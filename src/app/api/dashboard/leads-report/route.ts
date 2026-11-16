import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { milestones } from "@/lib/leadMilestones";
import { getFx } from "@/lib/fxServer";
import { toEur } from "@/lib/currency";
import { getAdSettings } from "@/lib/adTypesServer";
import { findType } from "@/lib/adTypes";
import { syncCampaignsFromLeads } from "@/lib/adStats";
import type { LeadsReportData, ReportLead } from "@/lib/leadsReport";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// «Ліди і конверсії»: every lead of the range in a compact form (+ ad spend from the cashflow) —
// the page filters / groups it by itself, so clicking a source is instant.
export async function GET(req: NextRequest) {
  const gate = await requireAccess("dash_leads");
  if ("error" in gate) return gate.error;
  const { settings: crm } = gate;
  await ensureSchema();
  await syncCampaignsFromLeads();
  const sp = req.nextUrl.searchParams;
  const from = new Date(`${sp.get("from") ?? ymd(new Date())}T00:00:00`);
  const toDay = new Date(`${sp.get("to") ?? ymd(new Date())}T00:00:00`);
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1); // exclusive

  const [ads, fx] = await Promise.all([getAdSettings(), getFx()]);
  const payFunnels = crm.funnels.filter((f) => f.payments).map((f) => f.id);
  const notProjects: Prisma.LeadWhereInput = payFunnels.length ? { OR: [{ funnelId: null }, { funnelId: { notIn: payFunnels } }] } : {};
  const [rows, campaigns, txs] = await Promise.all([
    db.lead.findMany({
      // created in the range, sold in the range, or moved through stages in the range (КП / цільовий of an older lead)
      where: { AND: [notProjects, { createdAt: { lt: to } }, { OR: [
        { createdAt: { gte: from, lt: to } },
        { closedAt: { gte: from, lt: to } },
        { activities: { some: { type: "STATUS_CHANGE", createdAt: { gte: from, lt: to } } } },
      ] }] },
      select: {
        id: true, number: true, name: true, projectName: true, amount: true, currency: true,
        createdAt: true, closedAt: true, status: true, closeReason: true, funnelId: true, source: true, sourceDetail: true,
        activities: { where: { type: "STATUS_CHANGE" }, select: { content: true, createdAt: true } },
      },
    }),
    db.adCampaign.findMany({ select: { id: true, name: true, trafficType: true } }),
    db.transaction.findMany({ where: { kind: "expense", category: "Реклама", date: { gte: from, lt: to } }, select: { adCampaignId: true, amountUah: true } }),
  ]);

  const campByKey = new Map(campaigns.map((c) => [`${c.trafficType.toLowerCase()}|${c.name.trim().toLowerCase()}`, c]));
  const leads: ReportLead[] = rows.map((l) => {
    const type = findType(ads, l.source);
    const src = type?.name ?? (l.source?.trim() || "Не вказано");
    let camp: string | null = null;
    if (type) {
      const c = campByKey.get(`${type.name.toLowerCase()}|${l.sourceDetail?.trim().toLowerCase() ?? ""}`)
        ?? (type.mode === "spend" ? campByKey.get(`${type.name.toLowerCase()}|${type.name.toLowerCase()}`) : undefined);
      camp = c?.name ?? null;
    }
    const m = milestones(crm, l);
    const d = (x: Date | null) => (x ? ymd(x) : null);
    return {
      d: ymd(l.createdAt), c: l.closedAt ? ymd(l.closedAt) : null, inR: l.createdAt >= from && l.createdAt < to,
      src, ad: !!type, camp, st: m.stageId, k: m.kind === "win" ? "w" : m.kind === "loss" ? "l" : "a",
      r: m.kind === "loss" ? (l.closeReason ?? (l.status !== "LOST" ? l.status : null)) : null,
      tD: d(m.tAt), qD: d(m.qAt), pD: d(m.pAt), wD: d(m.wAt),
      id: l.id, n: l.number, name: l.projectName || l.name, eur: toEur(l.amount, l.currency, fx),
    };
  });

  const campById = new Map(campaigns.map((c) => [c.id, c]));
  const spendMap = new Map<string, { src: string; camp: string | null; uah: number }>();
  for (const t of txs) {
    const c = t.adCampaignId ? campById.get(t.adCampaignId) : undefined;
    const src = c ? findType(ads, c.trafficType)?.name ?? c.trafficType : "Без кампанії";
    const key = `${src}|${c?.name ?? ""}`;
    const cur = spendMap.get(key) ?? { src, camp: c?.name ?? null, uah: 0 };
    cur.uah += t.amountUah;
    spendMap.set(key, cur);
  }

  const main = crm.funnels.find((f) => !f.payments) ?? crm.funnels[0];
  const data: LeadsReportData = {
    from: ymd(from), to: ymd(toDay),
    stages: main.stages.map((s) => ({ id: s.id, label: s.label, color: s.color, kind: s.kind })),
    reasons: main.loss.reasons.map((r) => ({ id: r.id, label: r.label })),
    adTypes: ads.types.map((t) => ({ name: t.name, color: t.color })),
    leads,
    spend: [...spendMap.values()],
  };
  return NextResponse.json(data);
}
