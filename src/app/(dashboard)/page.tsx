export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import Link from "next/link";
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
    day: String(i + 1),
    total: 0,
    targeted: 0,
    lost: 0,
    won: 0,
  }));

  for (const lead of leads) {
    const d = new Date(lead.createdAt).getDate() - 1;
    if (d < 0 || d >= maxDay) continue;
    days[d].total++;
    if (["CONTACTED", "NEGOTIATION", "WON"].includes(lead.status)) days[d].targeted++;
    if (lead.status === "LOST") days[d].lost++;
    if (lead.status === "WON") days[d].won++;
  }

  return days;
}

async function getStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
    db.lead.count(),
    db.deal.count(),
    db.task.count({ where: { status: { not: "DONE" } } }),
    db.task.count({ where: { status: "DONE" } }),
    db.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, name: true, status: true, instagram: true, telegram: true,
        phone: true, source: true, amount: true, createdAt: true,
      },
    }),
    db.task.count({ where: { status: { not: "DONE" }, deadline: { lt: now } } }),
    db.lead.groupBy({ by: ["status"], _count: { status: true } }),
    db.deal.groupBy({ by: ["status"], _count: { status: true } }),
    db.lead.groupBy({
      by: ["source"], _count: { source: true },
      orderBy: { _count: { source: "desc" } }, take: 5,
    }),
    db.lead.aggregate({ _sum: { amount: true } }),
    db.lead.count({ where: { status: "WON" } }),
    db.lead.count({ where: { status: "LOST" } }),
    db.lead.count({ where: { createdAt: { gte: startOfMonth } } }),
    db.lead.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } } }),
    db.lead.aggregate({ _sum: { amount: true }, where: { status: "WON" } }),
    db.deal.aggregate({ _sum: { budget: true }, where: { status: { not: "COMPLETED" } } }),
    db.lead.groupBy({
      by: ["source"],
      _count: { source: true },
      where: { createdAt: { gte: startOfDay } },
      orderBy: { _count: { source: "desc" } },
    }),
    db.lead.findMany({
      where: { createdAt: { gte: startOfMonth } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.lead.findMany({
      where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.lead.count({
      where: {
        createdAt: { gte: startOfMonth },
        status: { in: ["CONTACTED", "NEGOTIATION", "WON"] },
      },
    }),
    db.lead.count({
      where: {
        createdAt: { gte: startOfLastMonth, lt: startOfMonth },
        status: { in: ["CONTACTED", "NEGOTIATION", "WON"] },
      },
    }),
  ]);

  const conversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const totalAmount = amountAgg._sum.amount ?? 0;
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

  return {
    totalLeads, totalDeals, totalTasks, taskDone, recentLeads,
    overdueTasks, leadsByStatus, dealsByStatus, conversion,
    leadsBySource, totalAmount, wonLeads, lostLeads,
    monthlyLeads, monthlyGrowth, wonAmount, activePipeline, avgLeadValue,
    todayLeadsBySource, currentMonthData, prevMonthData,
    targetedCurrentMonth, targetedPrevMonth, lastMonthLeads,
    currentMonthLabel, prevMonthLabel,
  };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  NEW:         { label: "Новий",       cls: "text-[#C98C0A] bg-[#C98C0A]/10 border border-[#C98C0A]/20" },
  CONTACTED:   { label: "Контакт",    cls: "text-cyan-400 bg-cyan-400/10 border border-cyan-400/20" },
  NEGOTIATION: { label: "Переговори", cls: "text-violet-400 bg-violet-400/10 border border-violet-400/20" },
  WON:         { label: "Виграно",    cls: "text-green-400 bg-green-400/10 border border-green-400/20" },
  LOST:        { label: "Програно",   cls: "text-red-400 bg-red-400/10 border border-red-400/20" },
};

export default async function DashboardPage() {
  const stats = await getStats();
  const taskTotal = stats.taskDone + stats.totalTasks;
  const todayTotal = stats.todayLeadsBySource.reduce((s, l) => s + l._count.source, 0);

  // ── KPI cards ──
  const kpiCards = [
    {
      label: "Всього лідів",
      sub: "Попередній місяць",
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
      sub: "Попередній місяць",
      value: stats.targetedPrevMonth,
      trend: stats.lastMonthLeads > 0
        ? `${Math.round((stats.targetedPrevMonth / stats.lastMonthLeads) * 100)}% від місяця`
        : "—",
      trendUp: true,
      Icon: Target,
      color: "#22c55e",
      glow: "rgba(34,197,94,0.30)",
      href: "/leads",
    },
    {
      label: "Всього лідів",
      sub: "Поточний місяць",
      value: stats.monthlyLeads,
      trend: `${stats.currentMonthLabel}`,
      trendUp: true,
      Icon: CalendarDays,
      color: "#22d3ee",
      glow: "rgba(34,211,238,0.28)",
      href: "/leads",
    },
    {
      label: "Цільові ліди",
      sub: "Поточний місяць",
      value: stats.targetedCurrentMonth,
      trend: stats.monthlyLeads > 0
        ? `${Math.round((stats.targetedCurrentMonth / stats.monthlyLeads) * 100)}% від місяця`
        : "—",
      trendUp: true,
      Icon: Target,
      color: "#a78bfa",
      glow: "rgba(167,139,250,0.28)",
      href: "/leads",
    },
    {
      label: "Потенційні гроші",
      sub: "Загальна сума лідів",
      value: `€${stats.totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      trend: `€${stats.avgLeadValue.toLocaleString("en-US")} середня / лід`,
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
    <div className="p-6 space-y-5 relative z-10">

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
