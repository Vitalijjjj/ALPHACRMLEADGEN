import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { getAdSettings } from "@/lib/adTypesServer";
import { getCampaignStats, syncCampaignsFromLeads } from "@/lib/adStats";

// «Реклама» for a period (from / to — yyyy-mm-dd, inclusive): spend comes only from the cashflow
// («Реклама» operations → campaign → traffic type), leads / sales — from the CRM.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchema();
  await syncCampaignsFromLeads();
  const sp = req.nextUrl.searchParams;
  const now = new Date();
  const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999`) : now;
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1); // monthly bars: last 6 months

  const [settings, campaigns, stats, txs] = await Promise.all([
    getAdSettings(),
    db.adCampaign.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, trafficType: true } }),
    getCampaignStats(sp.get("from") ?? undefined, sp.get("to") ?? undefined),
    db.transaction.findMany({
      where: { kind: "expense", category: "Реклама", date: { gte: since < from ? since : from } },
      orderBy: { date: "desc" },
      select: { id: true, adCampaignId: true, date: true, amount: true, currency: true, amountUah: true, counterparty: true, comment: true },
    }),
  ]);

  const typeOf = new Map(campaigns.map((c) => [c.id, c.trafficType]));
  const cash = new Map<string, number>();
  const months: { type: string; month: string; uah: number }[] = [];
  const mm = new Map<string, number>();
  const payments: { id: string; date: Date; uah: number; amount: number; currency: string; type: string | null; campaignId: string | null; who: string | null; comment: string | null }[] = [];
  for (const t of txs) {
    const type = t.adCampaignId ? typeOf.get(t.adCampaignId) ?? null : null;
    if (t.date >= from && t.date <= to) {
      if (t.adCampaignId) cash.set(t.adCampaignId, (cash.get(t.adCampaignId) ?? 0) + t.amountUah);
      payments.push({ id: t.id, date: t.date, uah: t.amountUah, amount: t.amount, currency: t.currency, type, campaignId: t.adCampaignId, who: t.counterparty, comment: t.comment });
    }
    if (t.date >= since) {
      const k = `${type ?? ""}|${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
      mm.set(k, (mm.get(k) ?? 0) + t.amountUah);
    }
  }
  for (const [k, uah] of mm) { const [type, month] = k.split("|"); months.push({ type, month, uah }); }

  const rowOf = new Map(stats.groups.flatMap((g) => g.rows).map((r) => [r.key, r]));
  const fallback = Object.fromEntries(stats.groups.filter((g) => g.hasBudget).map((g) => {
    const f = g.rows.find((r) => r.isFallback);
    return [g.type, f ? { leads: f.leads, won: f.won } : null];
  }));
  return NextResponse.json({
    settings,
    campaigns: campaigns.map((c) => {
      const r = rowOf.get(c.id);
      return { ...c, cash: cash.get(c.id) ?? 0, leads: r?.leads ?? 0, won: r?.won ?? 0 };
    }),
    payments,
    months,
    fallback,
  });
}
