export const dynamic = "force-dynamic";

import type { Prisma } from "@prisma/client";
import { Suspense } from "react";
import { db } from "@/lib/db";
import Link from "next/link";
import OverviewFilters from "@/components/dashboard/OverviewFilters";
import CampaignStatsTable from "@/components/dashboard/CampaignStatsTable";
import { getCampaignStats } from "@/lib/adStats";
import { TARGETED_STATUSES, LOSS_STATUSES_ALL, LEAD_STATUS_BADGE, LEAD_STATUS_BADGE_LABEL, statusMatchValues } from "@/lib/leadOptions";
import {
  Users,
  Briefcase,
  CheckSquare,
  TrendingUp,
  ArrowUpRight,
  Target,
  Euro,
  CalendarDays,
} from "lucide-react";
import {
  LeadDonutChart,
  TaskProgressRing,
  DealBarChart,
  MiniLineChart,
  LeadDynamicsSection,
  CARD,
  type DailyLeadPoint,
} from "@/components/dashboard/DashboardCharts";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

const MONTH_UA = [
  "Січень","Лютий","Березень","Квітень","Травень","Червень",
  "Липень","Серпень","Вересень","Жовтень","Листопад","Грудень",
];

function buildDailyData(
  leads: { createdAt: Date; status: string }[],
  year: number,
  month: number
): DailyLeadPoint[] {
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const maxDay = isCurrentMonth ? today.getDate() : daysInMonth;

  const days: DailyLeadPoint[] = Array.from({ length: maxDay }, (_, i) => ({
    day: format(new Date(year, month, i + 1), "dd.MM.yyyy"),
    total: 0,
    targeted: 0,
    lost: 0,
    won: 0,
  }));

  for (const lead of leads) {
    const d = new Date(lead.createdAt).getDate() - 1;
    if (d < 0 || d >= maxDay) continue;
    days[d].total++;
    if (TARGETED_STATUSES.includes(lead.status)) days[d].targeted++;
    if (LOSS_STATUSES_ALL.includes(lead.status)) days[d].lost++;
    if (lead.status === "WON") days[d].won++;
  }

  return days;
}

// One point per day across an arbitrary date range (used when date filters are set).
function buildRangeData(
  leads: { createdAt: Date; status: string }[],
  start: Date,
  end: Date
): DailyLeadPoint[] {
  const days: DailyLeadPoint[] = [];
  const index = new Map<string, number>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last && days.length < 366) {
    const key = format(cursor, "dd.MM.yyyy");
    index.set(key, days.length);
    days.push({ day: key, total: 0, targeted: 0, lost: 0, won: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const lead of leads) {
    const i = index.get(format(new Date(lead.createdAt), "dd.MM.yyyy"));
    if (i === undefined) continue;
    days[i].total++;
    if (TARGETED_STATUSES.includes(lead.status)) days[i].targeted++;
    if (LOSS_STATUSES_ALL.includes(lead.status)) days[i].lost++;
    if (lead.status === "WON") days[i].won++;
  }

  return days;
}

const STATS_EMPTY = {
  totalLeads: 0, totalDeals: 0, totalTasks: 0, taskDone: 0, recentLeads: [] as never[],
  overdueTasks: 0, leadsByStatus: [] as never[], dealsByStatus: [] as never[],
  conversion: 0, leadsBySource: [] as never[], totalAmount: 0, potentialAmount: 0, wonLeads: 0, lostLeads: 0,
  monthlyLeads: 0, monthlyGrowth: 0, wonAmount: 0, activePipeline: 0, avgLeadValue: 0,
  todayLeadsBySource: [] as never[], currentMonthData: [] as never[], prevMonthData: [] as never[],
  targetedCurrentMonth: 0, targetedPrevMonth: 0, lastMonthLeads: 0,
  currentMonthLabel: "", prevMonthLabel: "",
  rangeData: null as DailyLeadPoint[] | null, rangeLabel: null as string | null,
  isCustomPeriod: false, currentPeriodSub: "Поточний місяць", prevPeriodSub: "Попередній місяць",
};

export interface OverviewFilterValues {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  niche?: string;
  source?: string;
  campaign?: string;
  geo?: string;
  amount?: string;
  service?: string;
}

type DateRange = { gte?: Date; lte?: Date };

// Extract a createdAt range from the date filters (shared by lead/deal/task queries).
function buildDateRange(f: OverviewFilterValues): DateRange | undefined {
  const range: DateRange = {};
  if (f.dateFrom) range.gte = new Date(f.dateFrom);
  if (f.dateTo) {
    const end = new Date(f.dateTo);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range.gte || range.lte ? range : undefined;
}

// A lead matches a status filter if it EVER passed through that status, not only if it's
// there now. History lives in STATUS_CHANGE activities:
//   "Лід створено зі статусом: X"  /  "Статус змінено: X → Y"
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

// Build a Prisma Lead where-clause from Overview filters. Campaign lives in sourceDetail.
function buildLeadWhere(f: OverviewFilterValues): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  const range = buildDateRange(f);
  if (range) where.createdAt = range;
  if (f.status) where.OR = statusHistoryWhere(f.status).OR;
  if (f.source) where.source = { equals: f.source, mode: "insensitive" };
  if (f.service) where.service = f.service;
  if (f.niche) where.niche = { contains: f.niche, mode: "insensitive" };
  if (f.geo) where.geo = { contains: f.geo, mode: "insensitive" };
  if (f.campaign) where.sourceDetail = { equals: f.campaign, mode: "insensitive" };
  if (f.amount) {
    const min = parseFloat(f.amount);
    if (!Number.isNaN(min)) where.amount = { gte: min };
  }
  return where;
}

async function getStats(filters: OverviewFilterValues = {}) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const where = buildLeadWhere(filters);
  // Combine the base filter with an extra clause (e.g. a month range).
  const merge = (extra: Prisma.LeadWhereInput): Prisma.LeadWhereInput => ({ AND: [where, extra] });
  // Date-only filter applied to non-lead entities (deals/tasks) so they follow the date range too.
  const range = buildDateRange(filters);
  const dateWhere: { createdAt?: DateRange } = range ? { createdAt: range } : {};

  // KPI-картки «поточний/попередній»: якщо у фільтрах обрано дати — поточний = обраний період,
  // попередній = період тієї ж довжини безпосередньо перед ним. Без дат — календарні місяці.
  const DAY = 86400000;
  const dayFloor = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isCustomPeriod = !!range;
  const curPeriodStart = range?.gte ?? startOfMonth;
  const curPeriodEnd = range?.lte ?? now;
  let prevPeriodStart: Date;
  let prevPeriodEnd: Date;
  if (isCustomPeriod) {
    const days = Math.round((dayFloor(curPeriodEnd).getTime() - dayFloor(curPeriodStart).getTime()) / DAY) + 1;
    prevPeriodEnd = new Date(dayFloor(curPeriodStart).getTime() - 1);
    prevPeriodStart = new Date(dayFloor(curPeriodStart).getTime() - days * DAY);
  } else {
    prevPeriodStart = startOfLastMonth;
    prevPeriodEnd = new Date(startOfMonth.getTime() - 1);
  }
  // Періодні лічильники не мають успадковувати createdAt з фільтра — період задає власний діапазон.
  const whereNoDate = buildLeadWhere({ ...filters, dateFrom: undefined, dateTo: undefined });
  const mergeND = (extra: Prisma.LeadWhereInput): Prisma.LeadWhereInput => ({ AND: [whereNoDate, extra] });
  const curPeriodRange = { createdAt: { gte: curPeriodStart, lte: curPeriodEnd } };
  const prevPeriodRange = { createdAt: { gte: prevPeriodStart, lte: prevPeriodEnd } };

  const [
    totalLeads,
    totalDeals,
    totalTasks,
    taskDone,
    recentLeads,
    overdueTasks,
    leadsByStatus,
    dealsByStatus,
    leadsBySource,
    amountAgg,
    potentialAmountAgg,
    wonLeads,
    lostLeads,
    monthlyLeads,
    lastMonthLeads,
    wonAmountAgg,
    activeDealsBudget,
    todayLeadsBySource,
    currentMonthLeadsRaw,
    prevMonthLeadsRaw,
    targetedCurrentMonth,
    targetedPrevMonth,
  ] = await Promise.all([
    db.lead.count({ where }),
    db.deal.count({ where: dateWhere }),
    db.task.count({ where: { status: { not: "DONE" }, ...dateWhere } }),
    db.task.count({ where: { status: "DONE", ...dateWhere } }),
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, name: true, status: true, instagram: true, telegram: true,
        phone: true, source: true, amount: true, createdAt: true,
      },
    }),
    db.task.count({ where: { status: { not: "DONE" }, deadline: { lt: now }, ...dateWhere } }),
    db.lead.groupBy({ by: ["status"], _count: { status: true }, where }),
    db.deal.groupBy({ by: ["status"], _count: { status: true }, where: dateWhere }),
    db.lead.groupBy({
      by: ["source"], _count: { source: true }, where,
      orderBy: { _count: { source: "desc" } }, take: 5,
    }),
    db.lead.aggregate({ _sum: { amount: true }, where }),
    db.lead.aggregate({ _sum: { amount: true }, where: merge({ status: { notIn: LOSS_STATUSES_ALL.concat("WON") } }) }),
    db.lead.count({ where: merge({ status: "WON" }) }),
    db.lead.count({ where: merge({ status: { in: LOSS_STATUSES_ALL } }) }),
    db.lead.count({ where: mergeND(curPeriodRange) }),
    db.lead.count({ where: mergeND(prevPeriodRange) }),
    db.lead.aggregate({ _sum: { amount: true }, where: merge({ status: "WON" }) }),
    db.deal.aggregate({ _sum: { budget: true }, where: { status: { not: "COMPLETED" }, ...dateWhere } }),
    db.lead.groupBy({
      by: ["source"],
      _count: { source: true },
      where: merge({ createdAt: { gte: startOfDay } }),
      orderBy: { _count: { source: "desc" } },
    }),
    db.lead.findMany({
      where: merge({ createdAt: { gte: startOfMonth } }),
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.lead.findMany({
      where: merge({ createdAt: { gte: startOfLastMonth, lt: startOfMonth } }),
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.lead.count({
      where: mergeND({ ...curPeriodRange, status: { in: TARGETED_STATUSES } }),
    }),
    db.lead.count({
      where: mergeND({ ...prevPeriodRange, status: { in: TARGETED_STATUSES } }),
    }),
  ]);

  const conversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const totalAmount = amountAgg._sum.amount ?? 0;
  const potentialAmount = potentialAmountAgg._sum.amount ?? 0;
  const wonAmount = wonAmountAgg._sum.amount ?? 0;
  const activePipeline = activeDealsBudget._sum.budget ?? 0;
  const avgLeadValue = totalLeads > 0 ? Math.round(totalAmount / totalLeads) : 0;
  const monthlyGrowth =
    lastMonthLeads > 0
      ? Math.round(((monthlyLeads - lastMonthLeads) / lastMonthLeads) * 100)
      : 0;

  const currentMonthData = buildDailyData(
    currentMonthLeadsRaw,
    now.getFullYear(),
    now.getMonth()
  );
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevMonthData = buildDailyData(prevMonthLeadsRaw, prevYear, prevMonth);

  const currentMonthLabel = `${MONTH_UA[now.getMonth()]} ${now.getFullYear()}`;
  const prevMonthLabel = `${MONTH_UA[prevMonth]} ${prevYear}`;

  // Підписи KPI-карток: обраний період і рівний йому попередній, або календарні місяці.
  const fmtShort = (d: Date) => format(d, "dd.MM.yy");
  const currentPeriodSub = isCustomPeriod
    ? `${fmtShort(curPeriodStart)} – ${fmtShort(curPeriodEnd)}`
    : "Поточний місяць";
  const prevPeriodSub = isCustomPeriod
    ? `${fmtShort(prevPeriodStart)} – ${fmtShort(prevPeriodEnd)}`
    : "Попередній місяць";

  // Date filter set → the dynamics chart shows exactly that range instead of month tabs.
  let rangeData: DailyLeadPoint[] | null = null;
  let rangeLabel: string | null = null;
  if (range) {
    const rangeStart = range.gte ?? startOfMonth;
    const rangeEnd = range.lte ?? now;
    const rangeLeadsRaw = await db.lead.findMany({
      where,
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    rangeData = buildRangeData(rangeLeadsRaw, rangeStart, rangeEnd);
    rangeLabel = `${format(rangeStart, "dd.MM.yyyy")} – ${format(rangeEnd, "dd.MM.yyyy")}`;
  }

  return {
    rangeData, rangeLabel,
    isCustomPeriod, currentPeriodSub, prevPeriodSub,
    totalLeads, totalDeals, totalTasks, taskDone, recentLeads,
    overdueTasks, leadsByStatus, dealsByStatus, conversion,
    leadsBySource, totalAmount, potentialAmount, wonLeads, lostLeads,
    monthlyLeads, monthlyGrowth, wonAmount, activePipeline, avgLeadValue,
    todayLeadsBySource, currentMonthData, prevMonthData,
    targetedCurrentMonth, targetedPrevMonth, lastMonthLeads,
    currentMonthLabel, prevMonthLabel,
  };
}

async function getStatsSafe(filters: OverviewFilterValues) {
  try {
    return await getStats(filters);
  } catch (e) {
    console.error("Dashboard getStats error:", e);
    return STATS_EMPTY;
  }
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = Object.fromEntries(
  Object.keys(LEAD_STATUS_BADGE_LABEL).map((k) => [
    k,
    { label: LEAD_STATUS_BADGE_LABEL[k], cls: `${LEAD_STATUS_BADGE[k]} border` },
  ])
);

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters: OverviewFilterValues = {
    dateFrom: firstParam(sp.dateFrom),
    dateTo: firstParam(sp.dateTo),
    status: firstParam(sp.status),
    niche: firstParam(sp.niche),
    source: firstParam(sp.source),
    campaign: firstParam(sp.campaign),
    geo: firstParam(sp.geo),
    amount: firstParam(sp.amount),
    service: firstParam(sp.service),
  };
  const [stats, campaignStats] = await Promise.all([
    getStatsSafe(filters),
    getCampaignStats(filters.dateFrom, filters.dateTo),
  ]);
  const taskTotal = stats.taskDone + stats.totalTasks;
  const todayTotal = stats.todayLeadsBySource.reduce((s, l) => s + l._count.source, 0);

  // ── KPI cards ──
  const kpiCards = [
    {
      label: "Всього лідів",
      sub: stats.prevPeriodSub,
      value: stats.lastMonthLeads,
      trend: stats.monthlyGrowth !== 0
        ? `Поточний: ${stats.monthlyLeads} (${stats.monthlyGrowth > 0 ? "+" : ""}${stats.monthlyGrowth}%)`
        : `Поточний: ${stats.monthlyLeads}`,
      trendUp: stats.monthlyGrowth >= 0,
      Icon: Users,
      color: "#C98C0A",
      glow: "rgba(201,140,10,0.35)",
      href: "/leads",
    },
    {
      label: "Цільові ліди",
      sub: stats.prevPeriodSub,
      value: stats.targetedPrevMonth,
      trend: stats.lastMonthLeads > 0
        ? `${Math.round((stats.targetedPrevMonth / stats.lastMonthLeads) * 100)}% від ${stats.isCustomPeriod ? "періоду" : "місяця"}`
        : "—",
      trendUp: true,
      Icon: Target,
      color: "#22c55e",
      glow: "rgba(34,197,94,0.30)",
      href: "/leads",
    },
    {
      label: "Всього лідів",
      sub: stats.currentPeriodSub,
      value: stats.monthlyLeads,
      trend: stats.isCustomPeriod ? "Обраний період" : `${stats.currentMonthLabel}`,
      trendUp: true,
      Icon: CalendarDays,
      color: "#22d3ee",
      glow: "rgba(34,211,238,0.28)",
      href: "/leads",
    },
    {
      label: "Цільові ліди",
      sub: stats.currentPeriodSub,
      value: stats.targetedCurrentMonth,
      trend: stats.monthlyLeads > 0
        ? `${Math.round((stats.targetedCurrentMonth / stats.monthlyLeads) * 100)}% від ${stats.isCustomPeriod ? "періоду" : "місяця"}`
        : "—",
      trendUp: true,
      Icon: Target,
      color: "#a78bfa",
      glow: "rgba(167,139,250,0.28)",
      href: "/leads",
    },
    {
      label: "Потенційні гроші",
      sub: "Активні ліди",
      value: `€${stats.potentialAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      trend: stats.wonAmount > 0 ? `€${stats.wonAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })} зароблено` : `€${stats.avgLeadValue.toLocaleString("en-US")} середня / лід`,
      trendUp: true,
      Icon: Euro,
      color: "#C98C0A",
      glow: "rgba(201,140,10,0.35)",
      href: "/leads",
    },
  ];

  // sparklines for secondary stat cards
  const sparklines = [
    [2, 4, 3, 6, 5, 8, stats.totalLeads],
    [1, 3, 2, 4, 3, 5, stats.totalDeals],
    [3, 2, 4, 3, 5, 4, stats.totalTasks],
    [10, 20, 15, 30, 25, 40, stats.conversion],
  ];

  const secondaryCards = [
    {
      label: "Всього лідів",
      value: stats.totalLeads,
      icon: Users,
      href: "/leads",
      color: "#C98C0A",
      glow: "rgba(201,140,10,0.40)",
      trend:
        stats.monthlyGrowth >= 0
          ? `+${stats.monthlyLeads} цього місяця`
          : `${stats.monthlyLeads} цього місяця`,
    },
    {
      label: "Активні угоди",
      value: stats.totalDeals,
      icon: Briefcase,
      href: "/clients",
      color: "#22d3ee",
      glow: "rgba(34,211,238,0.35)",
      trend:
        stats.activePipeline > 0
          ? `€${stats.activePipeline.toLocaleString("en-US", { maximumFractionDigits: 0 })} pipeline`
          : "Немає активних",
    },
    {
      label: "Задачі",
      value: stats.totalTasks,
      icon: CheckSquare,
      href: "/tasks",
      color: "#a78bfa",
      glow: "rgba(167,139,250,0.35)",
      trend: stats.overdueTasks > 0 ? `${stats.overdueTasks} прострочено` : "Все вчасно",
    },
    {
      label: "Конверсія",
      value: `${stats.conversion}%`,
      icon: TrendingUp,
      href: "/pipeline",
      color: "#C98C0A",
      glow: "rgba(201,140,10,0.40)",
      trend: `${stats.wonLeads} вигр / ${stats.lostLeads} прогр`,
    },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5 relative z-10">

      {/* ── Filters ── */}
      <Suspense fallback={null}>
        <OverviewFilters />
      </Suspense>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpiCards.map((c) => {
          const Icon = c.Icon;
          return (
            <Link
              key={c.label + c.sub}
              href={c.href}
              className="block group cursor-pointer"
              style={CARD}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: `${c.color}15`,
                      border: `1px solid ${c.color}25`,
                    }}
                  >
                    <Icon size={14} style={{ color: c.color }} />
                  </div>
                  <ArrowUpRight
                    size={13}
                    className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                    style={{ color: c.color }}
                  />
                </div>

                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-0.5 font-medium">
                  {c.sub}
                </p>
                <p className="text-xs text-[var(--text-muted)] mb-2">{c.label}</p>
                <p
                  className="text-2xl font-bold mb-1.5"
                  style={{ color: c.color, textShadow: `0 0 20px ${c.glow}` }}
                >
                  {c.value}
                </p>
                <p className="text-[11px]" style={{ color: `${c.color}90` }}>
                  {c.trend}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Динаміка лідів + Ліди сьогодні ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Dynamics chart (2/3 width) */}
        <div className="xl:col-span-2">
          <LeadDynamicsSection
            currentData={stats.currentMonthData}
            prevData={stats.prevMonthData}
            currentLabel={stats.currentMonthLabel}
            prevLabel={stats.prevMonthLabel}
            rangeData={stats.rangeData}
            rangeLabel={stats.rangeLabel}
          />
        </div>

        {/* Today's leads (1/3 width) */}
        <div style={CARD} className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Ліди сьогодні</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">За джерелами трафіку</p>
            </div>
            {todayTotal > 0 && (
              <span
                className="text-lg font-bold"
                style={{ color: "var(--accent)", textShadow: "0 0 16px var(--accent-glow)" }}
              >
                {todayTotal}
              </span>
            )}
          </div>

          {stats.todayLeadsBySource.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-sm text-[var(--text-muted)]">Сьогодні ще немає лідів</p>
              <Link
                href="/leads"
                className="text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                Додати ліда →
              </Link>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div
                className="grid grid-cols-[1fr_auto] gap-4 pb-2 mb-1"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-medium">
                  Джерело
                </span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-medium">
                  Кількість
                </span>
              </div>

              {/* Rows */}
              {stats.todayLeadsBySource.map((s) => {
                const pct = todayTotal > 0 ? Math.round((s._count.source / todayTotal) * 100) : 0;
                return (
                  <div
                    key={s.source ?? "none"}
                    className="py-2"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                  >
                    <div className="grid grid-cols-[1fr_auto] gap-4 mb-1">
                      <span className="text-sm text-[var(--text)] truncate">
                        {s.source ?? "Не вказано"}
                      </span>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--accent)" }}
                      >
                        {s._count.source}
                      </span>
                    </div>
                    <div
                      className="h-1 rounded-full"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: "var(--accent)",
                          boxShadow: "0 0 6px var(--accent-glow)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Total */}
              <div className="grid grid-cols-[1fr_auto] gap-4 pt-2.5 mt-0.5">
                <span className="text-xs font-semibold text-[var(--text)]">
                  Загальний підсумок
                </span>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: "var(--accent)", textShadow: "0 0 10px var(--accent-glow)" }}
                >
                  {todayTotal}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Рекламні кампанії ── */}
      <CampaignStatsTable stats={campaignStats} />

      {/* ── Останні ліди ── */}
      <div style={CARD} className="overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Останні ліди</p>
            <p className="text-xs text-[var(--text-muted)]">Нещодавно додані контакти</p>
          </div>
          <Link
            href="/leads"
            className="text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ color: "var(--accent)", textShadow: "0 0 10px var(--accent-glow)" }}
          >
            Переглянути всіх →
          </Link>
        </div>

        {stats.recentLeads.length === 0 ? (
          <div className="text-center py-10 text-[var(--text-muted)] text-sm">
            Немає лідів.{" "}
            <Link href="/leads" style={{ color: "var(--accent)" }}>
              Додати першого
            </Link>
          </div>
        ) : (
          <div>
            {stats.recentLeads.map((lead, i) => {
              const badge = STATUS_BADGE[lead.status];
              return (
                <Link
                  key={lead.id}
                  href="/leads"
                  className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  style={
                    i < stats.recentLeads.length - 1
                      ? { borderBottom: "1px solid rgba(255,255,255,0.03)" }
                      : {}
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: "rgba(201,140,10,0.08)",
                        border: "1px solid rgba(201,140,10,0.16)",
                        color: "var(--accent)",
                      }}
                    >
                      {lead.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{lead.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {[lead.source, lead.phone].filter(Boolean).join(" · ") || (
                          lead.instagram ? `@${lead.instagram}` : lead.telegram ? `@${lead.telegram}` : "—"
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {lead.amount != null && lead.amount > 0 && (
                      <span
                        className="text-xs font-semibold hidden sm:block"
                        style={{ color: "var(--accent)" }}
                      >
                        €{lead.amount.toLocaleString()}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                        badge?.cls ?? "bg-zinc-500/10 text-zinc-400 border border-zinc-400/20"
                      }`}
                    >
                      {badge?.label ?? lead.status}
                    </span>
                    <span className="text-xs text-[var(--text-dim)] hidden md:block whitespace-nowrap">
                      {format(new Date(lead.createdAt), "d MMM", { locale: uk })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Secondary stat cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {secondaryCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href} className="block group cursor-pointer" style={CARD}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${c.color}18`,
                      border: `1px solid ${c.color}28`,
                    }}
                  >
                    <Icon size={16} style={{ color: c.color }} />
                  </div>
                  <ArrowUpRight
                    size={14}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: c.color }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-1 font-medium">{c.label}</p>
                <p
                  className="text-3xl font-bold mb-3"
                  style={{ color: c.color, textShadow: `0 0 24px ${c.glow}` }}
                >
                  {c.value}
                </p>
                <div className="mb-2.5">
                  <MiniLineChart points={sparklines[i]} />
                </div>
                <p className="text-xs" style={{ color: `${c.color}99` }}>{c.trend}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div style={CARD} className="p-5">
          <p className="text-sm font-semibold text-[var(--text)] mb-0.5">Статуси лідів</p>
          <p className="text-xs text-[var(--text-muted)] mb-5">Розподіл за статусом</p>
          <LeadDonutChart data={stats.leadsByStatus} />
        </div>
        <div style={CARD} className="p-5">
          <p className="text-sm font-semibold text-[var(--text)] mb-0.5">Pipeline угод</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">По стадіях</p>
          <DealBarChart data={stats.dealsByStatus} />
        </div>
        <div style={CARD} className="p-5 flex flex-col">
          <p className="text-sm font-semibold text-[var(--text)] mb-0.5">Задачі</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">Прогрес виконання</p>
          <div className="flex-1 flex items-center justify-center">
            <TaskProgressRing done={stats.taskDone} total={taskTotal} />
          </div>
        </div>
      </div>

      {/* ── Metrics + Sources ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: "Виграно лідів",
              value: stats.wonLeads,
              sub: stats.wonAmount > 0
                ? `€${stats.wonAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : "—",
              color: "#22c55e",
            },
            {
              label: "Програно лідів",
              value: stats.lostLeads,
              sub: stats.totalLeads > 0
                ? `${Math.round((stats.lostLeads / stats.totalLeads) * 100)}% від усіх`
                : "—",
              color: "#f87171",
            },
            {
              label: "Нових цього місяця",
              value: stats.monthlyLeads,
              sub: stats.monthlyGrowth !== 0
                ? `${stats.monthlyGrowth > 0 ? "+" : ""}${stats.monthlyGrowth}% vs минулий`
                : "Перший місяць",
              color: "#C98C0A",
            },
            {
              label: "Середня сума ліда",
              value: `€${stats.avgLeadValue.toLocaleString("en-US")}`,
              sub: `Pipeline: €${stats.activePipeline.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
              color: "#a78bfa",
            },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                background:
                  "linear-gradient(rgba(13,13,13,0.96), rgba(13,13,13,0.96)) padding-box, linear-gradient(135deg, rgba(201,140,10,0.18), rgba(255,255,255,0.03) 45%, rgba(34,211,238,0.08)) border-box",
                border: "1px solid transparent",
                borderRadius: 12,
                backdropFilter: "blur(16px)",
              }}
              className="px-4 py-3"
            >
              <p className="text-xs text-[var(--text-muted)] mb-1">{m.label}</p>
              <p className="text-2xl font-bold" style={{ color: m.color }}>
                {m.value}
              </p>
              <p className="text-xs mt-1" style={{ color: `${m.color}80` }}>
                {m.sub}
              </p>
            </div>
          ))}
        </div>

        {/* Lead sources */}
        <div style={CARD} className="p-5">
          <p className="text-sm font-semibold text-[var(--text)] mb-0.5">Джерела лідів</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">Звідки приходять контакти</p>
          {stats.leadsBySource.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Немає даних</p>
          ) : (
            <div className="space-y-3">
              {stats.leadsBySource.map((s) => {
                const label = s.source ?? "Не вказано";
                const count = s._count.source;
                const max = stats.leadsBySource[0]._count.source;
                const pct = Math.round((count / max) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text)]">{label}</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                        {count}
      </span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: "var(--accent)",
                          boxShadow: "0 0 8px var(--accent-glow)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
