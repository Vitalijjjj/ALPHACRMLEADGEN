import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { resolveStage } from "@/lib/crmSettings";
import { normUrl } from "@/lib/caseUrl";

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// «Кейси»: every deal with a link to its live site (the PM adds it when the project is handed over)
// + cases added by hand that are not linked to a project yet. `?projects=1` — projects to link a case to.
export async function GET(req: NextRequest) {
  const gate = await requireAccess("cases");
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const pay = gate.settings.funnels.filter((f) => f.payments).map((f) => f.id);

  if (req.nextUrl.searchParams.get("projects")) {
    const rows = await db.lead.findMany({
      where: { funnelId: { in: pay.length ? pay : ["-"] } },
      select: { id: true, number: true, name: true, projectName: true, caseUrl: true, status: true, funnelId: true, closeReason: true },
      orderBy: { number: "desc" }, take: 300,
    });
    return NextResponse.json(rows.map((r) => {
      const { stage } = resolveStage(gate.settings, r);
      return { id: r.id, number: r.number, title: r.projectName || `Проєкт #${r.number}`, client: r.name, hasCase: !!r.caseUrl, stage: stage.label, stageColor: stage.color };
    }));
  }

  const [rows, free] = await Promise.all([
    db.lead.findMany({
      // only projects — Підписка / Апсейл deals carry the same link of their project
      where: { caseUrl: { not: null }, funnelId: { in: pay.length ? pay : ["-"] } },
      select: { id: true, number: true, name: true, projectName: true, niche: true, geo: true, service: true, caseUrl: true, status: true, funnelId: true, closeReason: true, closedAt: true, updatedAt: true },
      orderBy: [{ closedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    }),
    db.caseLink.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return NextResponse.json([
    ...free.map((c) => ({
      id: c.id, free: true, number: null, title: c.title || "", client: "", niche: c.niche, geo: c.geo, service: null,
      url: c.url, done: false, stage: "", stageColor: "", date: c.createdAt.toISOString(),
    })),
    ...rows.map((r) => {
      const { stage } = resolveStage(gate.settings, r);
      return {
        id: r.id, free: false, number: r.number, title: r.projectName || `Проєкт #${r.number}`, client: r.name, niche: r.niche, geo: r.geo, service: r.service,
        url: r.caseUrl, done: stage.kind === "win", stage: stage.label, stageColor: stage.color, date: (r.closedAt ?? r.updatedAt).toISOString(),
      };
    }),
  ]);
}

// «Додати кейс»: a link without a project (it can be linked to one later)
export async function POST(req: NextRequest) {
  const gate = await requireAccess("cases");
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const b = await req.json().catch(() => ({}));
  const url = normUrl(b.url);
  if (!url) return NextResponse.json({ error: "Вкажи посилання" }, { status: 400 });
  const c = await db.caseLink.create({ data: { url, title: txt(b.title), niche: txt(b.niche), geo: txt(b.geo) } });
  return NextResponse.json(c);
}
