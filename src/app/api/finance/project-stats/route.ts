import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { financeGate } from "@/lib/financeServer";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { visibleLeadsWhere, getAccess } from "@/lib/accessServer";
import { canonicalStage, STATUS_CHANGE_RE } from "@/lib/stageFlow";
import { resolveStage } from "@/lib/crmSettings";

const CREATED_RE = /^Лід створено зі статусом: (\S+)$/;

// Projects = deals of the funnels with payments («Операційка»): where each stands, how long it spent on each stage.
// stageMs — time on every stage it really stood on (moves through stages in one jump give ~0 and are dropped).
export async function GET() {
  const gate = await financeGate();
  if (gate.error) return gate.error;
  const settings = await getCrmSettings();
  const access = await getAccess(settings);
  const pay = settings.funnels.filter((f) => f.payments);
  if (!pay.length || !access) return NextResponse.json({ stages: [], deals: [] });
  const visible = visibleLeadsWhere(access, settings);
  const deals = await db.lead.findMany({
    where: { AND: [{ funnelId: { in: pay.map((f) => f.id) } }, ...(visible ? [visible] : [])] },
    select: {
      id: true, number: true, name: true, projectName: true, status: true, funnelId: true, closeReason: true,
      amount: true, currency: true, createdAt: true, closedAt: true,
      activities: { where: { type: "STATUS_CHANGE" }, select: { content: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const now = Date.now();

  const out = deals.map((d) => {
    const { stage } = resolveStage(settings, d);
    // timeline of stages: [enteredAt, stageId]
    const steps: [number, string][] = [];
    const created = d.activities.map((a) => CREATED_RE.exec(a.content)?.[1]).find(Boolean);
    const firstChange = d.activities.map((a) => STATUS_CHANGE_RE.exec(a.content)).find(Boolean);
    steps.push([d.createdAt.getTime(), canonicalStage(created ?? firstChange?.[1] ?? d.status)]);
    for (const a of d.activities) {
      const m = STATUS_CHANGE_RE.exec(a.content);
      if (m) steps.push([a.createdAt.getTime(), canonicalStage(m[2])]);
    }
    const stageMs: Record<string, number> = {};
    for (let i = 0; i < steps.length; i++) {
      const [at, id] = steps[i];
      const end = i + 1 < steps.length ? steps[i + 1][0] : stage.kind === "active" ? now : at;
      const ms = end - at;
      if (ms >= 60_000) stageMs[id] = (stageMs[id] ?? 0) + ms;
    }
    const enteredAt = steps[steps.length - 1][0];
    return {
      id: d.id, number: d.number, name: d.name, projectName: d.projectName,
      status: stage.id, kind: stage.kind, amount: d.amount, currency: d.currency,
      createdAt: d.createdAt, closedAt: d.closedAt, enteredAt: new Date(enteredAt), stageMs,
    };
  });

  const f = pay[0];
  return NextResponse.json({
    stages: f.stages.map((s) => ({ id: s.id, label: s.label, color: s.color, kind: s.kind })),
    deals: out,
  });
}
