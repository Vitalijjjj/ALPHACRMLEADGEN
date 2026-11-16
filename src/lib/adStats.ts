import { db, ensureSchema } from "@/lib/db";
import { getFx } from "@/lib/fxServer";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { getFunnel } from "@/lib/crmSettings";
import { replayStages } from "@/lib/stageFlow";
import { getAdSettings } from "@/lib/adTypesServer";
import { findType } from "@/lib/adTypes";
import {
  statusMatchValues,
  TARGETED_STATUSES,
  WON_STATUSES,
} from "@/lib/leadOptions";

// ── Автосинк: кампанії, що вже існують у лідах, заносяться в AdCampaign ──
// Унікальність — (назва, тип трафіку) без урахування регістру; startDate = перший лід кампанії.
export async function syncCampaignsFromLeads() {
  const settings = await getAdSettings();
  // «загально» types (Контекст) get one campaign named as the type — it's what the cashflow points at
  for (const t of settings.types.filter((x) => x.mode === "spend")) {
    const has = await db.adCampaign.findFirst({ where: { trafficType: t.name, name: t.name }, select: { id: true } });
    if (!has) await db.adCampaign.create({ data: { name: t.name, trafficType: t.name } }).catch(() => {});
  }
  const [leads, existing] = await Promise.all([
    db.lead.findMany({
      where: {
        source: { in: settings.types.map((t) => t.name), mode: "insensitive" },
        sourceDetail: { not: null },
      },
      select: { source: true, sourceDetail: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.adCampaign.findMany({ select: { name: true, trafficType: true } }),
  ]);

  const known = new Set(existing.map((c) => `${c.trafficType.toLowerCase()}|${c.name.trim().toLowerCase()}`));
  const fresh = new Map<string, { name: string; trafficType: string; startDate: Date }>();

  for (const lead of leads) {
    const name = lead.sourceDetail?.trim();
    const type = findType(settings, lead.source)?.name;
    if (!name || !type) continue;
    const key = `${type.toLowerCase()}|${name.toLowerCase()}`;
    if (known.has(key) || fresh.has(key)) continue;
    fresh.set(key, { name, trafficType: type, startDate: lead.createdAt });
  }

  if (fresh.size > 0) {
    await db.adCampaign.createMany({ data: [...fresh.values()], skipDuplicates: true });
  }
}

// ── Статистика кампаній для Overview ──

export interface CampaignStatRow {
  key: string;
  name: string;
  trafficType: string;
  active: boolean;
  isFallback: boolean; // «Без кампанії» — ліди типу трафіку без відповідної кампанії
  budgetLabel: string;
  leads: number;
  targeted: number;
  proposals: number; // побували в статусі КП
  won: number;
  spent: number;
  costPerLead: number | null;
  costPerProposal: number | null;
  costPerSale: number | null;
}

export interface TrafficTypeGroup {
  type: string;
  hasBudget: boolean; // рекламні типи мають бюджет/витрати; інші джерела — лише лічильники
  rows: CampaignStatRow[];
  totals: Omit<CampaignStatRow, "key" | "name" | "trafficType" | "active" | "isFallback" | "budgetLabel">;
}

export interface CampaignStatsResult {
  groups: TrafficTypeGroup[];
  periodLabel: string;
}

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

// Всі статуси, в яких лід будь-коли перебував: поточний + розібрана історія STATUS_CHANGE.
export function statusHistorySet(current: string, activityContents: string[]): Set<string> {
  const set = new Set([current]);
  for (const content of activityContents) {
    let m = content.match(/^Лід створено зі статусом: (.+)$/);
    if (m) { set.add(m[1].trim()); continue; }
    m = content.match(/^Статус змінено: (.+) → (.+)$/);
    if (m) { set.add(m[1].trim()); set.add(m[2].trim()); }
  }
  return set;
}

const PROPOSAL_VALUES = statusMatchValues("PROPOSAL");
const hasAny = (set: Set<string>, values: readonly string[]) => values.some((v) => set.has(v));

function priceOf(spent: number, count: number): number | null {
  return spent > 0 && count > 0 ? spent / count : null;
}

// Період: обраний фільтрами дат, інакше — поточний місяць.
export async function getCampaignStats(dateFrom?: string, dateTo?: string): Promise<CampaignStatsResult> {
  const now = new Date();
  const periodStart = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = dateTo ? new Date(dateTo) : now;
  periodEnd.setHours(23, 59, 59, 999);
  const periodLabel = `${fmt(periodStart)} – ${fmt(periodEnd)}`;

  const empty: CampaignStatsResult = { groups: [], periodLabel };

  try {
    await ensureSchema();
    await syncCampaignsFromLeads();
    const crm = await getCrmSettings();
    const settings = await getAdSettings();

    const [campaigns, leads] = await Promise.all([
      db.adCampaign.findMany({ orderBy: { createdAt: "asc" } }),
      db.lead.findMany({
        where: { createdAt: { gte: periodStart, lte: periodEnd } },
        select: {
          source: true,
          sourceDetail: true,
          status: true,
          funnelId: true,
          activities: { where: { type: "STATUS_CHANGE" }, select: { content: true, createdAt: true } },
        },
      }),
    ]);

    // Реальні витрати на рекламу з кешфлоу («Реклама» → кампанія) — у доларах, як бюджети
    const fx = await getFx();
    const paid = await db.transaction.findMany({
      where: { adCampaignId: { not: null }, kind: "expense", date: { gte: periodStart, lte: periodEnd } },
      select: { adCampaignId: true, amount: true, currency: true, amountUah: true },
    });
    const realSpent = new Map<string, number>();
    for (const t of paid) {
      const usd = t.currency === "USD" ? t.amount : t.amountUah / (fx.usdUah || 1);
      realSpent.set(t.adCampaignId!, (realSpent.get(t.adCampaignId!) ?? 0) + usd);
    }

    // Лічильники лідів по кампаніях: key = тип|назва (lowercase), fallback = тип|""
    const counters = new Map<string, { leads: number; targeted: number; proposals: number; won: number }>();
    const bump = (key: string, lead: (typeof leads)[number]) => {
      const c = counters.get(key) ?? { leads: 0, targeted: 0, proposals: 0, won: 0 };
      // Logged statuses + stages passed under the funnel rules (jump forward = passed the stages in between)
      const history = statusHistorySet(lead.status, lead.activities.map((a) => a.content));
      for (const st of replayStages(getFunnel(crm, lead.funnelId), lead.status, lead.activities).visited) history.add(st);
      c.leads++;
      if (hasAny(history, TARGETED_STATUSES)) c.targeted++;
      if (hasAny(history, PROPOSAL_VALUES)) c.proposals++;
      if (hasAny(history, WON_STATUSES)) c.won++;
      counters.set(key, c);
    };

    // Рекламні ліди рахуються по кампаніях; решта джерел — сумарно по джерелу (key = "src|назва")
    const campaignKeys = new Set(campaigns.map((c) => `${c.trafficType.toLowerCase()}|${c.name.trim().toLowerCase()}`));
    for (const lead of leads) {
      const type = findType(settings, lead.source)?.name;
      if (type) {
        const name = lead.sourceDetail?.trim().toLowerCase() ?? "";
        const key = `${type.toLowerCase()}|${name}`;
        bump(campaignKeys.has(key) ? key : `${type.toLowerCase()}|`, lead);
      } else {
        bump(`src|${lead.source?.trim() || "Не вказано"}`, lead);
      }
    }

    const groups: TrafficTypeGroup[] = [];
    for (const { name: type, mode } of settings.types) {
      const rows: CampaignStatRow[] = [];
      const ofType = campaigns.filter((x) => x.trafficType === type);
      // витрати — лише те, що оплачено в кешфлоу
      const spentOf = (c: (typeof campaigns)[number]) => realSpent.get(c.id) ?? 0;
      const typeSpent = ofType.reduce((sum, c) => sum + spentOf(c), 0);

      for (const c of ofType) {
        const counts = counters.get(`${type.toLowerCase()}|${c.name.trim().toLowerCase()}`);
        if (!counts || counts.leads === 0) continue; // пусті кампанії без лідів у періоді не показуємо
        const spent = spentOf(c);
        rows.push({
          key: c.id,
          name: c.name,
          trafficType: type,
          active: c.active,
          isFallback: false,
          budgetLabel: mode === "spend" ? "загально" : "",
          spent,
          ...counts,
          costPerLead: priceOf(spent, counts.leads),
          costPerProposal: priceOf(spent, counts.proposals),
          costPerSale: priceOf(spent, counts.won),
        });
      }

      const fallback = counters.get(`${type.toLowerCase()}|`);
      if (fallback && fallback.leads > 0) {
        // за фактом (Контекст): ліди без кампанії несуть решту витрат типу — так видно ціну ліда
        const rest = mode === "spend" ? Math.max(0, typeSpent - rows.reduce((sum, r) => sum + r.spent, 0)) : 0;
        rows.push({
          key: `${type}-fallback`,
          name: mode === "spend" ? "Усі кампанії" : "Без кампанії",
          trafficType: type,
          active: false,
          isFallback: true,
          budgetLabel: mode === "spend" ? "загально" : "—",
          spent: rest,
          ...fallback,
          costPerLead: priceOf(rest, fallback.leads),
          costPerProposal: priceOf(rest, fallback.proposals),
          costPerSale: priceOf(rest, fallback.won),
        });
      }

      if (rows.length === 0) continue;
      rows.sort((a, b) => (a.isFallback ? 1 : 0) - (b.isFallback ? 1 : 0) || b.leads - a.leads);

      const sum = rows.reduce(
        (t, r) => ({
          leads: t.leads + r.leads,
          targeted: t.targeted + r.targeted,
          proposals: t.proposals + r.proposals,
          won: t.won + r.won,
          spent: t.spent + r.spent,
        }),
        { leads: 0, targeted: 0, proposals: 0, won: 0, spent: 0 }
      );
      groups.push({
        type,
        hasBudget: true,
        rows,
        totals: {
          ...sum,
          costPerLead: priceOf(sum.spent, sum.leads),
          costPerProposal: priceOf(sum.spent, sum.proposals),
          costPerSale: priceOf(sum.spent, sum.won),
        },
      });
    }

    // Інші джерела (без кампаній і бюджетів) — одним рядком-групою на джерело
    const otherGroups: TrafficTypeGroup[] = [...counters.entries()]
      .filter(([key, c]) => key.startsWith("src|") && c.leads > 0)
      .map(([key, c]) => ({
        type: key.slice(4),
        hasBudget: false,
        rows: [],
        totals: { ...c, spent: 0, costPerLead: null, costPerProposal: null, costPerSale: null },
      }))
      .sort((a, b) => b.totals.leads - a.totals.leads);
    groups.push(...otherGroups);

    return { groups, periodLabel };
  } catch (e) {
    console.error("getCampaignStats error:", e);
    return empty;
  }
}
