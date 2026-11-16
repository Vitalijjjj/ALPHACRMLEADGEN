import type { Prisma } from "@prisma/client";
import { db, ensureSchema } from "@/lib/db";
import { getFx } from "@/lib/fxServer";
import { toEur } from "@/lib/currency";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { resolveStage, WIN_ID } from "@/lib/crmSettings";
import { replayStages } from "@/lib/stageFlow";
import { getAdSettings } from "@/lib/adTypesServer";
import { findType } from "@/lib/adTypes";
import { syncCampaignsFromLeads } from "@/lib/adStats";
import { statusMatchValues } from "@/lib/leadOptions";
import { milestones } from "@/lib/leadMilestones";

// ── Дашборд: ліди / цільові / КП / продажі за період і попередній період, по джерелах і кампаніях ──
// Ліди, цільові, КП, не ЦА, дублі — за датою створення ліда; продажі — за датою закриття (як завжди в CRM).
// Витрати — лише з кешфлоу («Реклама» → кампанія), у гривнях.

export interface DashFilters {
  p?: string;        // "YYYY-MM" (календарний місяць) | "all"
  dateFrom?: string; // yyyy-mm-dd — свій період
  dateTo?: string;
  status?: string;
  niche?: string;
  source?: string;
  campaign?: string;
  geo?: string;
  amount?: string;
  service?: string;
}

export interface Totals {
  leads: number; targeted: number; proposals: number; sales: number; notTarget: number; dup: number;
  revenue: number; // € — сума проданих (для середнього чека)
  priced: number;  // продажів із сумою
  spend: number;   // ₴ з кешфлоу
}
export interface SourceRow {
  key: string; name: string; color: string; ad: boolean; fallback?: boolean;
  cur: Totals; prev: Totals | null;
  campaigns: SourceRow[];
}
export interface DayRow { p: string; name: string; leads: number; targeted: number; proposals: number; notTarget: number; dup: number; sales: number; [k: string]: number | string }
export interface StageRow { id: string; label: string; color: string; skip: boolean; kind: string; current: number; ever: number; won: number; amount: number; step: number | null; fromLabel: string }
export interface PeriodInfo { label: string; short: string; from: string; to: string }
export interface DashboardData {
  mode: "period" | "range" | "all";
  p: string | null;
  cur: PeriodInfo; prev: PeriodInfo | null;
  kpi: { cur: Totals; prev: Totals | null; paidCur: Totals; paidPrev: Totals | null; unlinkedCur: number; unlinkedPrev: number };
  today: { total: number; sources: { name: string; color: string; n: number }[] };
  daily: { cur: DayRow[]; prev: DayRow[] | null; byMonth: boolean };
  sources: SourceRow[];
  stages: StageRow[];
  stagesTotal: number;
}

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const OTHER_COLORS = ["#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#60a5fa", "#fb923c", "#2dd4bf", "#e879f9", "#94a3b8"];
const DAY = 86_400_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const zero = (): Totals => ({ leads: 0, targeted: 0, proposals: 0, sales: 0, notTarget: 0, dup: 0, revenue: 0, priced: 0, spend: 0 });

// A lead matches a status filter if it EVER passed through that status (history in STATUS_CHANGE activities).
function statusHistoryWhere(status: string): Prisma.LeadWhereInput {
  const values = statusMatchValues(status);
  return {
    OR: [
      { status: { in: values } },
      {
        activities: {
          some: {
            type: "STATUS_CHANGE",
            OR: values.flatMap((v) => [
              { content: { endsWith: `зі статусом: ${v}` } },
              { content: { contains: `змінено: ${v} →` } },
              { content: { startsWith: "Статус змінено:", endsWith: `→ ${v}` } },
            ]),
          },
        },
      },
    ],
  };
}

// filters except dates (the period sets its own range)
function filterWhere(f: DashFilters): Prisma.LeadWhereInput[] {
  const and: Prisma.LeadWhereInput[] = [];
  if (f.status) and.push(statusHistoryWhere(f.status));
  if (f.source) and.push({ source: { equals: f.source, mode: "insensitive" } });
  if (f.service) and.push({ service: f.service });
  if (f.niche) and.push({ niche: { contains: f.niche, mode: "insensitive" } });
  if (f.geo) and.push({ geo: { contains: f.geo, mode: "insensitive" } });
  if (f.campaign) and.push({ sourceDetail: { equals: f.campaign, mode: "insensitive" } });
  if (f.amount) {
    const min = parseFloat(f.amount.replace(/\s/g, ""));
    if (!Number.isNaN(min)) and.push({ amount: { gte: min } });
  }
  return and;
}

// current + previous period: a calendar month (and the one before), own dates (and as many days before), or all time
function periods(f: DashFilters, now: Date) {
  if (f.dateFrom || f.dateTo) {
    const from = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`) : new Date(2020, 0, 1);
    const toDay = f.dateTo ? new Date(`${f.dateTo}T00:00:00`) : startOf(now);
    const to = new Date(toDay.getTime() + DAY); // exclusive
    const len = Math.round((to.getTime() - from.getTime()) / DAY);
    const pFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() - len);
    const fmt = (a: Date, b: Date) => `${ymd(a).split("-").reverse().join(".")} – ${ymd(new Date(b.getTime() - DAY)).split("-").reverse().join(".")}`;
    return {
      mode: "range" as const, p: null,
      cur: { from, to, label: fmt(from, to), short: "Період" },
      prev: { from: pFrom, to: from, label: fmt(pFrom, from), short: "Попередній" },
    };
  }
  if (f.p === "all") {
    return { mode: "all" as const, p: "all", cur: { from: new Date(2020, 0, 1), to: new Date(now.getTime() + DAY), label: "Весь час", short: "Весь час" }, prev: null };
  }
  const p = /^\d{4}-\d{2}$/.test(f.p ?? "") ? f.p! : mkey(now);
  const [y, m] = p.split("-").map(Number);
  const from = new Date(y, m - 1, 1), to = new Date(y, m, 1);
  const pFrom = new Date(y, m - 2, 1);
  return {
    mode: "period" as const, p,
    cur: { from, to, label: `${MONTHS[m - 1]} ${y}`, short: MONTHS[m - 1] },
    prev: { from: pFrom, to: from, label: `${MONTHS[pFrom.getMonth()]} ${pFrom.getFullYear()}`, short: MONTHS[pFrom.getMonth()] },
  };
}

export async function getDashboard(f: DashFilters): Promise<DashboardData> {
  await ensureSchema();
  await syncCampaignsFromLeads();
  const now = new Date();
  const per = periods(f, now);
  const lo = per.prev?.from ?? per.cur.from, hi = per.cur.to;
  const [crm, ads, fx, campaigns] = await Promise.all([getCrmSettings(), getAdSettings(), getFx(), db.adCampaign.findMany({ select: { id: true, name: true, trafficType: true } })]);
  const payFunnels = crm.funnels.filter((x) => x.payments).map((x) => x.id);
  // projects of «Операційка» are copies of sold deals — not leads
  const notProjects: Prisma.LeadWhereInput = payFunnels.length ? { OR: [{ funnelId: null }, { funnelId: { notIn: payFunnels } }] } : {};
  const base = [notProjects, ...filterWhere(f)];
  const todayFrom = startOf(now);

  const [leads, txs, todayLeads] = await Promise.all([
    db.lead.findMany({
      // created / sold / moved through stages in the two periods (a КП of an older lead counts on its day)
      where: { AND: [...base, { createdAt: { lt: hi } }, { OR: [
        { createdAt: { gte: lo, lt: hi } },
        { closedAt: { gte: lo, lt: hi } },
        { activities: { some: { type: "STATUS_CHANGE", createdAt: { gte: lo, lt: hi } } } },
      ] }] },
      select: {
        createdAt: true, closedAt: true, status: true, closeReason: true, funnelId: true, source: true, sourceDetail: true, amount: true, currency: true,
        activities: { where: { type: "STATUS_CHANGE" }, select: { content: true, createdAt: true } },
      },
    }),
    db.transaction.findMany({
      where: { kind: "expense", category: "Реклама", date: { gte: lo, lt: hi } },
      select: { adCampaignId: true, amountUah: true, date: true },
    }),
    db.lead.findMany({ where: { AND: [...base, { createdAt: { gte: todayFrom } }] }, select: { source: true } }),
  ]);

  // ── classify every lead ──
  const campByKey = new Map(campaigns.map((c) => [`${c.trafficType.toLowerCase()}|${c.name.trim().toLowerCase()}`, c]));
  const campById = new Map(campaigns.map((c) => [c.id, c]));
  const typeColor = (name: string) => findType(ads, name)?.color;
  const colorOf = (name: string) => typeColor(name) ?? (name === "Не вказано" ? "#6b7280" : OTHER_COLORS[Math.abs(hash(name)) % OTHER_COLORS.length]);
  const inCur = (d: Date | null) => !!d && d >= per.cur.from && d < per.cur.to;
  const inPrev = (d: Date | null) => !!d && !!per.prev && d >= per.prev.from && d < per.prev.to;

  type L = (typeof leads)[number] & { src: string; ad: boolean; camp: string; tAt: Date | null; pAt: Date | null; wAt: Date | null; notTarget: boolean; dup: boolean; eur: number };
  const rows: L[] = leads.map((l) => {
    const type = findType(ads, l.source);
    const src = type?.name ?? (l.source?.trim() || "Не вказано");
    let camp = "";
    if (type) {
      const c = campByKey.get(`${type.name.toLowerCase()}|${l.sourceDetail?.trim().toLowerCase() ?? ""}`);
      // «загально» types (Контекст): all leads belong to the one campaign named as the type
      const own = type.mode === "spend" ? campByKey.get(`${type.name.toLowerCase()}|${type.name.toLowerCase()}`) : undefined;
      camp = c ? c.id : own ? own.id : `${type.name}|`; // `type|` = leads without a known campaign
    }
    const m = milestones(crm, l);
    const reason = l.closeReason ?? "";
    return {
      ...l, src, ad: !!type, camp,
      tAt: m.tAt, pAt: m.pAt, wAt: m.wAt,
      notTarget: l.status === "NOT_TARGET" || reason === "NOT_TARGET",
      dup: l.status === "DUPLICATE" || reason === "DUPLICATE",
      eur: toEur(l.amount, l.currency, fx),
    };
  });

  // every step on its own day: new lead — when it came, targeted / КП — when it got there, sale — the day of the sale
  const tally = (pick: (l: L) => boolean, which: "cur" | "prev") => {
    const t = zero();
    const inP = which === "cur" ? inCur : inPrev;
    for (const l of rows) {
      if (!pick(l)) continue;
      if (inP(l.createdAt)) { t.leads++; if (l.notTarget) t.notTarget++; if (l.dup) t.dup++; }
      if (inP(l.tAt)) t.targeted++;
      if (inP(l.pAt)) t.proposals++;
      if (inP(l.wAt)) { t.sales++; if (l.eur) { t.revenue += l.eur; t.priced++; } }
    }
    return t;
  };

  // ── spend from the cashflow ──
  const spendBy = { cur: new Map<string, number>(), prev: new Map<string, number>() };
  let unlinkedCur = 0, unlinkedPrev = 0;
  // with a source / campaign filter — only the spend of that source / campaign
  const narrowed = !!(f.source || f.campaign);
  const spendCounts = (id: string) => {
    const c = campById.get(id)!;
    if (f.source && c.trafficType.toLowerCase() !== (findType(ads, f.source)?.name ?? f.source).toLowerCase()) return false;
    if (f.campaign && c.name.trim().toLowerCase() !== f.campaign.trim().toLowerCase()) return false;
    return true;
  };
  for (const t of txs) {
    const which = inCur(t.date) ? "cur" : inPrev(t.date) ? "prev" : null;
    if (!which) continue;
    if (narrowed && (!t.adCampaignId || !campById.has(t.adCampaignId) || !spendCounts(t.adCampaignId))) continue;
    if (!t.adCampaignId || !campById.has(t.adCampaignId)) { if (which === "cur") unlinkedCur += t.amountUah; else unlinkedPrev += t.amountUah; continue; }
    spendBy[which].set(t.adCampaignId, (spendBy[which].get(t.adCampaignId) ?? 0) + t.amountUah);
  }

  // ── sources → campaigns ──
  const srcNames = [...new Set(rows.map((l) => l.src)), ...ads.types.map((t) => t.name)];
  const sources: SourceRow[] = [];
  for (const name of new Set(srcNames)) {
    const type = findType(ads, name);
    const ofSrc = (l: L) => l.src === name;
    const row: SourceRow = { key: name, name, color: colorOf(name), ad: !!type, cur: tally(ofSrc, "cur"), prev: per.prev ? tally(ofSrc, "prev") : null, campaigns: [] };
    if (type) {
      const ofType = campaigns.filter((c) => c.trafficType === type.name);
      for (const c of ofType) {
        const ofC = (l: L) => l.camp === c.id;
        const cr: SourceRow = { key: c.id, name: c.name, color: row.color, ad: true, cur: tally(ofC, "cur"), prev: per.prev ? tally(ofC, "prev") : null, campaigns: [] };
        cr.cur.spend = spendBy.cur.get(c.id) ?? 0;
        if (cr.prev) cr.prev.spend = spendBy.prev.get(c.id) ?? 0;
        row.cur.spend += cr.cur.spend;
        if (row.prev && cr.prev) row.prev.spend += cr.prev.spend;
        if (cr.cur.leads || cr.cur.sales || cr.cur.spend || cr.prev?.leads || cr.prev?.sales || cr.prev?.spend) row.campaigns.push(cr);
      }
      const noCamp = (l: L) => l.camp === `${type.name}|`;
      const fb: SourceRow = { key: `${type.name}|`, name: type.mode === "spend" ? "Без назви кампанії" : "Без кампанії", color: row.color, ad: true, fallback: true, cur: tally(noCamp, "cur"), prev: per.prev ? tally(noCamp, "prev") : null, campaigns: [] };
      if (fb.cur.leads || fb.cur.sales || fb.prev?.leads || fb.prev?.sales) row.campaigns.push(fb);
      row.campaigns.sort((a, b) => (a.fallback ? 1 : 0) - (b.fallback ? 1 : 0) || b.cur.leads - a.cur.leads || b.cur.spend - a.cur.spend);
      // a type with only one (own-named) campaign — the campaign line adds nothing
      if (row.campaigns.length === 1 && (row.campaigns[0].name === type.name || row.campaigns[0].fallback)) row.campaigns = [];
    }
    if (row.cur.leads || row.cur.sales || row.cur.spend || row.prev?.leads || row.prev?.sales || row.prev?.spend) sources.push(row);
  }
  sources.sort((a, b) => b.cur.leads - a.cur.leads || b.cur.spend - a.cur.spend || (b.prev?.leads ?? 0) - (a.prev?.leads ?? 0));

  const kpiCur = tally(() => true, "cur"), kpiPrev = per.prev ? tally(() => true, "prev") : null;
  const paidCur = tally((l) => l.ad, "cur"), paidPrev = per.prev ? tally((l) => l.ad, "prev") : null;
  kpiCur.spend = paidCur.spend = [...spendBy.cur.values()].reduce((a, b) => a + b, 0) + unlinkedCur;
  if (kpiPrev && paidPrev) kpiPrev.spend = paidPrev.spend = [...spendBy.prev.values()].reduce((a, b) => a + b, 0) + unlinkedPrev;

  // ── day by day (or month by month for long periods) ──
  const longSpan = per.cur.to.getTime() - per.cur.from.getTime() > 62 * DAY;
  const firstLead = longSpan ? rows.reduce<Date | null>((m, l) => (!m || l.createdAt < m ? l.createdAt : m), null) : null;
  const series = (from: Date, to: Date): DayRow[] => {
    const out: DayRow[] = [];
    const idx = new Map<string, number>();
    const end = to > now ? now : new Date(to.getTime() - 1);
    if (longSpan) {
      const c = new Date((firstLead && firstLead > from ? firstLead : from).getFullYear(), (firstLead && firstLead > from ? firstLead : from).getMonth(), 1);
      while (c <= end && out.length < 120) {
        idx.set(mkey(c), out.length);
        out.push({ p: mkey(c), name: `${MONTHS_SHORT[c.getMonth()]} ${String(c.getFullYear()).slice(2)}`, leads: 0, targeted: 0, proposals: 0, notTarget: 0, dup: 0, sales: 0 });
        c.setMonth(c.getMonth() + 1);
      }
    } else {
      const c = new Date(from);
      while (c < to && c <= end && out.length < 400) {
        idx.set(ymd(c), out.length);
        out.push({ p: ymd(c), name: String(c.getDate()), leads: 0, targeted: 0, proposals: 0, notTarget: 0, dup: 0, sales: 0 });
        c.setDate(c.getDate() + 1);
      }
    }
    const k = (d: Date) => idx.get(longSpan ? mkey(d) : ymd(d));
    for (const l of rows) {
      const at = (d: Date | null) => (d && d >= from && d < to ? k(d) : undefined);
      const i = at(l.createdAt);
      if (i !== undefined) {
        const r = out[i];
        r.leads++;
        if (l.notTarget) r.notTarget++;
        if (l.dup) r.dup++;
      }
      const ti = at(l.tAt); if (ti !== undefined) out[ti].targeted++;
      const pi = at(l.pAt); if (pi !== undefined) out[pi].proposals++;
      const wi = at(l.wAt); if (wi !== undefined) out[wi].sales++;
    }
    return out;
  };

  // ── stages of the sales funnel (leads created in the period) ──
  const main = crm.funnels.find((x) => !x.payments) ?? crm.funnels[0];
  const parsed = rows
    .filter((l) => inCur(l.createdAt) && (!l.funnelId || l.funnelId === main.id))
    .map((l) => ({ stageId: resolveStage(crm, l).stage.id, eur: l.eur, visited: replayStages(main, l.status, l.activities).visited }));
  const everOf = (id: string) => parsed.filter((l) => l.visited.has(id)).length;
  let prevRegular: string | null = null;
  const stages: StageRow[] = main.stages.map((st) => {
    let current = 0, ever = 0, won = 0, amount = 0;
    for (const l of parsed) {
      if (l.stageId === st.id) { current++; amount += l.eur; }
      if (l.visited.has(st.id)) { ever++; if (l.visited.has(WIN_ID)) won++; }
    }
    const baseN = st.kind === "loss" || !prevRegular ? parsed.length : everOf(prevRegular);
    const step = baseN > 0 ? Math.round((ever / baseN) * 100) : null;
    const fromLabel = st.kind === "loss" || !prevRegular ? "усіх лідів" : main.stages.find((x) => x.id === prevRegular)?.label ?? "";
    if ((st.kind === "active" && !st.skip) || st.kind === "win") prevRegular = st.id;
    return { id: st.id, label: st.label, color: st.color, skip: !!st.skip, kind: st.kind, current, ever, won, amount: Math.round(amount), step, fromLabel };
  });

  // ── today ──
  const todayMap = new Map<string, number>();
  for (const l of todayLeads) {
    const name = findType(ads, l.source)?.name ?? (l.source?.trim() || "Не вказано");
    todayMap.set(name, (todayMap.get(name) ?? 0) + 1);
  }

  const info = (x: { from: Date; to: Date; label: string; short: string }): PeriodInfo => ({ label: x.label, short: x.short, from: ymd(x.from), to: ymd(new Date(x.to.getTime() - 1)) });
  return {
    mode: per.mode, p: per.p,
    cur: info(per.cur), prev: per.prev ? info(per.prev) : null,
    kpi: { cur: kpiCur, prev: kpiPrev, paidCur, paidPrev, unlinkedCur, unlinkedPrev },
    today: { total: todayLeads.length, sources: [...todayMap].map(([name, n]) => ({ name, n, color: colorOf(name) })).sort((a, b) => b.n - a.n) },
    daily: { cur: series(per.cur.from, per.cur.to), prev: per.prev && !longSpan ? series(per.prev.from, per.prev.to) : null, byMonth: longSpan },
    sources, stages, stagesTotal: parsed.length,
  };
}
