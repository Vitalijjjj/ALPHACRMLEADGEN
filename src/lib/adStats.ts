import { db, ensureSchema } from "@/lib/db";
import {
  AD_TRAFFIC_TYPES,
  normalizeTrafficType,
  statusMatchValues,
  TARGETED_STATUSES,
  WON_STATUSES,
} from "@/lib/leadOptions";

// ── Автосинк: кампанії, що вже існують у лідах, заносяться в AdCampaign ──
// Унікальність — (назва, тип трафіку) без урахування регістру; startDate = перший лід кампанії.
export async function syncCampaignsFromLeads() {
  const [leads, existing] = await Promise.all([
    db.lead.findMany({
      where: {
        source: { in: [...AD_TRAFFIC_TYPES], mode: "insensitive" },
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
    const type = normalizeTrafficType(lead.source);
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
  rows: CampaignStatRow[];
  totals: Omit<CampaignStatRow, "key" | "name" | "trafficType" | "active" | "isFallback" | "budgetLabel">;
}

export interface CampaignStatsResult {
  groups: TrafficTypeGroup[];
  periodLabel: string;
}

const DAY = 86400000;
const dayIndex = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

// Скільки бюджету «відкрутилось» у межах вибраного періоду.
// Таргет: денний бюджет × активні дні в періоді. Автопрозвон: загальний бюджет,
// пропорційно перекриттю періоду з тривалістю кампанії.
function spentInPeriod(
  c: { trafficType: string; dailyBudget: number | null; totalBudget: number | null; startDate: Date | null; endDate: Date | null },
  periodStart: Date,
  periodEnd: Date,
  now: Date
): number {
  const startIdx = dayIndex(c.startDate ?? periodStart);
  const endIdx = Math.min(dayIndex(c.endDate ?? now), dayIndex(now));
  const from = Math.max(startIdx, dayIndex(periodStart));
  const to = Math.min(endIdx, dayIndex(periodEnd));
  const days = to - from + 1;
  if (days <= 0) return 0;

  if (c.trafficType === "Автопрозвон") {
    const totalDays = Math.max(endIdx - startIdx + 1, 1);
    return (c.totalBudget ?? 0) * Math.min(days / totalDays, 1);
  }
  return (c.dailyBudget ?? 0) * days;
}

// Всі статуси, в яких лід будь-коли перебував: поточний + розібрана історія STATUS_CHANGE.
function statusHistorySet(current: string, activityContents: string[]): Set<string> {
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

// Період: обраний фільтрами дат, інакше — останні 30 днів.
export async function getCampaignStats(dateFrom?: string, dateTo?: string): Promise<CampaignStatsResult> {
  const now = new Date();
  const periodStart = dateFrom ? new Date(dateFrom) : new Date(now.getTime() - 30 * DAY);
  const periodEnd = dateTo ? new Date(dateTo) : now;
  periodEnd.setHours(23, 59, 59, 999);
  const periodLabel = `${fmt(periodStart)} – ${fmt(periodEnd)}`;

  const empty: CampaignStatsResult = { groups: [], periodLabel };

  try {
    await ensureSchema();
    await syncCampaignsFromLeads();

    const [campaigns, leads] = await Promise.all([
      db.adCampaign.findMany({ orderBy: { createdAt: "asc" } }),
      db.lead.findMany({
        where: {
          source: { in: [...AD_TRAFFIC_TYPES], mode: "insensitive" },
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        select: {
          source: true,
          sourceDetail: true,
          status: true,
          activities: { where: { type: "STATUS_CHANGE" }, select: { content: true } },
        },
      }),
    ]);

    // Лічильники лідів по кампаніях: key = тип|назва (lowercase), fallback = тип|""
    const counters = new Map<string, { leads: number; targeted: number; proposals: number; won: number }>();
    const bump = (key: string, lead: (typeof leads)[number]) => {
      const c = counters.get(key) ?? { leads: 0, targeted: 0, proposals: 0, won: 0 };
      const history = statusHistorySet(lead.status, lead.activities.map((a) => a.content));
      c.leads++;
      if (hasAny(history, TARGETED_STATUSES)) c.targeted++;
      if (hasAny(history, PROPOSAL_VALUES)) c.proposals++;
      if (hasAny(history, WON_STATUSES)) c.won++;
      counters.set(key, c);
    };

    const campaignKeys = new Set(campaigns.map((c) => `${c.trafficType.toLowerCase()}|${c.name.trim().toLowerCase()}`));
    for (const lead of leads) {
      const type = normalizeTrafficType(lead.source);
      if (!type) continue;
      const name = lead.sourceDetail?.trim().toLowerCase() ?? "";
      const key = `${type.toLowerCase()}|${name}`;
      bump(campaignKeys.has(key) ? key : `${type.toLowerCase()}|`, lead);
    }

    const groups: TrafficTypeGroup[] = [];
    for (const type of AD_TRAFFIC_TYPES) {
      const rows: CampaignStatRow[] = [];

      for (const c of campaigns.filter((x) => x.trafficType === type)) {
        const counts = counters.get(`${type.toLowerCase()}|${c.name.trim().toLowerCase()}`);
        if (!counts || counts.leads === 0) continue; // пусті кампанії без лідів у періоді не показуємо
        const spent = spentInPeriod(c, periodStart, periodEnd, now);
        rows.push({
          key: c.id,
          name: c.name,
          trafficType: type,
          active: c.active,
          isFallback: false,
          budgetLabel:
            type === "Автопрозвон"
              ? c.totalBudget != null ? `€${c.totalBudget.toLocaleString("en-US", { maximumFractionDigits: 0 })} всього` : "—"
              : c.dailyBudget != null ? `€${c.dailyBudget.toLocaleString("en-US", { maximumFractionDigits: 0 })}/день` : "—",
          spent,
          ...counts,
          costPerLead: priceOf(spent, counts.leads),
          costPerProposal: priceOf(spent, counts.proposals),
          costPerSale: priceOf(spent, counts.won),
        });
      }

      const fallback = counters.get(`${type.toLowerCase()}|`);
      if (fallback && fallback.leads > 0) {
        rows.push({
          key: `${type}-fallback`,
          name: "Без кампанії",
          trafficType: type,
          active: false,
          isFallback: true,
          budgetLabel: "—",
          spent: 0,
          ...fallback,
          costPerLead: null,
          costPerProposal: null,
          costPerSale: null,
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
        rows,
        totals: {
          ...sum,
          costPerLead: priceOf(sum.spent, sum.leads),
          costPerProposal: priceOf(sum.spent, sum.proposals),
          costPerSale: priceOf(sum.spent, sum.won),
        },
      });
    }

    return { groups, periodLabel };
  } catch (e) {
    console.error("getCampaignStats error:", e);
    return empty;
  }
}
