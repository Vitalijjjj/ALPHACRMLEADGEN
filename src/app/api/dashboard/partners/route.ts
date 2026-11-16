import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getFx } from "@/lib/fxServer";
import { toEur } from "@/lib/currency";
import { partnerFunnels, resolveStage } from "@/lib/crmSettings";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// «Партнери»: every partner + every lead he passed (and the project that grew out of it) — the page counts the period itself.
export async function GET() {
  const gate = await requireAccess("dash_partners");
  if ("error" in gate) return gate.error;
  const { settings } = gate;
  await ensureSchema();
  const funnels = partnerFunnels(settings);
  const pay = settings.funnels.filter((f) => f.payments).map((f) => f.id);
  const [fx, partners, leads] = await Promise.all([
    getFx(),
    db.lead.findMany({
      where: { funnelId: { in: funnels.length ? funnels.map((f) => f.id) : ["-"] } },
      select: { id: true, number: true, name: true, status: true, funnelId: true, closeReason: true, createdAt: true, customFields: true, niche: true, geo: true },
    }),
    db.lead.findMany({
      where: { partnerId: { not: null } },
      select: { id: true, number: true, name: true, projectName: true, partnerId: true, status: true, funnelId: true, closeReason: true, amount: true, currency: true, createdAt: true, closedAt: true },
    }),
  ]);
  // projects («Операційка») handed over from the partners' leads
  const projects = leads.length ? await db.lead.findMany({
    where: { funnelId: { in: pay.length ? pay : ["-"] }, sourceLeadId: { in: leads.map((l) => l.id) } },
    select: { id: true, number: true, projectName: true, sourceLeadId: true, status: true, funnelId: true, closeReason: true, amount: true, currency: true, createdAt: true },
  }) : [];
  const projOf = new Map(projects.map((p) => [p.sourceLeadId!, p]));

  return NextResponse.json({
    partners: partners.map((p) => {
      const r = resolveStage(settings, p);
      // «активний» — from the stage named «Активний…» on (incl. «Передав ліда»)
      const at = r.funnel.stages.findIndex((s) => /актив/i.test(s.label));
      const idx = r.funnel.stages.findIndex((s) => s.id === r.stage.id);
      const cf = (p.customFields ?? {}) as Record<string, unknown>;
      return {
        id: p.id, number: p.number, name: p.name, created: ymd(p.createdAt),
        kind: typeof cf.cf_prt_kind === "string" ? cf.cf_prt_kind : null, fee: typeof cf.cf_prt_fee === "string" ? cf.cf_prt_fee : null,
        niche: p.niche, geo: p.geo,
        stage: { label: r.stage.label, color: r.stage.color, kind: r.stage.kind },
        active: r.stage.kind === "active" && at >= 0 && idx >= at,
      };
    }),
    leads: leads.map((l) => {
      const r = resolveStage(settings, l);
      const pr = projOf.get(l.id);
      const prs = pr ? resolveStage(settings, pr) : null;
      const eur = l.amount ? toEur(l.amount, l.currency, fx) : pr?.amount ? toEur(pr.amount, pr.currency, fx) : 0;
      return {
        id: l.id, number: l.number, name: l.name, partnerId: l.partnerId, created: ymd(l.createdAt),
        closed: l.closedAt ? ymd(l.closedAt) : null,
        k: r.stage.kind === "win" ? "w" : r.stage.kind === "loss" ? "l" : "a",
        stage: { label: r.stage.label, color: r.stage.color }, eur: Math.round(eur),
        project: pr && prs ? { id: pr.id, number: pr.number, title: pr.projectName || `Проєкт #${pr.number}`, stage: { label: prs.stage.label, color: prs.stage.color } } : null,
      };
    }),
  });
}
