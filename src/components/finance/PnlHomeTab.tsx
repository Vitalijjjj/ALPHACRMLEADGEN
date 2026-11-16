"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownLeft, Briefcase, Check, Coins, Crown, HandCoins, Landmark, Pencil, Receipt, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { groupNum, numText, parseNum } from "@/lib/numInput";
import { toastError } from "@/components/ui/toast";
import { ADS_CAT, accountBalances, fmtMoney, periodLabel, periodRange, shiftPeriod, stageStatus } from "@/lib/finance";
import { DividendModal } from "@/components/finance/CashflowTab";
import { SCHEDULE_KEY, rowCurrency, type ScheduleRow } from "@/components/finance/useFinance";
import { pct, pnlSplit, projectStats, usePnlData } from "@/components/finance/pnlData";
import { usePnlShell } from "@/components/finance/pnlShell";
import TrendChart from "@/components/finance/TrendChart";
import { valueLabel, type PeriodValue } from "@/components/finance/PeriodPicker";

const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const short = (p: string) => `${MONTHS_SHORT[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;
const DAY = 86_400_000;

const C = { turnover: "#22c55e", income: "#38bdf8", costs: "#ef4444", tax: "#eab308", profit: "#C98C0A", div: "#a855f7", ads: "#f472b6" };
const SERIES = [
  { key: "turnover", label: "Оборот", color: C.turnover },
  { key: "income", label: "Дохід", color: C.income },
  { key: "costs", label: "Витрати", color: C.costs },
  { key: "profit", label: "Чистий прибуток", color: C.profit },
  { key: "div", label: "Дивіденди", color: C.div },
  { key: "ads", label: "Реклама", color: C.ads },
] as const;

// «Огляд» of P&L: a period at a glance — turnover → income → costs / taxes → profit → planned dividends, plan / fact, debts, trend.
export default function PnlHomeTab({ value, onPick, canEdit, onOpenProjects }: { value: PeriodValue; onPick: (p: string) => void; canEdit: boolean; onOpenProjects: () => void }) {
  const d = usePnlData();
  const { fin, fx, nowP, first } = d;
  const [planOpen, setPlanOpen] = useState(false);
  const [split, setSplit] = useState(false);
  const [now] = useState(() => Date.now());

  const range = d.periodsOf(value);
  const list = d.inValue(value);
  const s = pnlSplit(list, fin, range, first, nowP);
  const t = s.t;
  const costs = t.contractor + t.expense;
  const income = t.income - costs; // дохід = оборот − витрати

  // planned dividends: profit minus the ad budget of the month before (that's what next month's ads will cost)
  const refP = value.mode === "period" ? value.p : value.mode === "range" ? range[range.length - 1] : nowP;
  const prevAds = d.inPeriod(shiftPeriod(refP, -1)).filter((x) => x.kind === "expense" && x.category === ADS_CAT).reduce((sum, x) => sum + x.amountUah, 0);
  const owners = fin.owners.length || 2;
  const planDiv = Math.max(0, t.profit - prevAds);

  // plan of the selected months
  const planSum = (m: Record<string, number>) => range.reduce((sum, p) => sum + (m[p] ?? 0), 0);
  const checks = range.map((p) => fin.planCheck[p]).filter((v): v is number => !!v);
  const plans = { turnover: planSum(fin.planTurnover), profit: planSum(fin.plan), projects: planSum(fin.planProjects), check: checks.length ? checks.reduce((a, b) => a + b, 0) / checks.length : 0 };

  // new projects of the period: «Операційка» deals created in its dates, and their average value
  const dates = value.mode === "all" ? null : value.mode === "range"
    ? { a: new Date(`${value.from}T00:00`).getTime(), b: new Date(`${value.to}T23:59:59`).getTime() }
    : (() => { const r = periodRange(value.p, fin.monthStartDay); return { a: r.from.getTime(), b: r.to.getTime() - 1 }; })();
  const newDeals = d.deals.filter((x) => { const c = new Date(x.createdAt).getTime(); return !dates || (c >= dates.a && c <= dates.b); });
  const valued = newDeals.filter((x) => x.amount);
  const factCheck = valued.length ? valued.reduce((sum, x) => sum + d.toUah(x.amount!, x.currency ?? "EUR"), 0) / valued.length : 0;

  // how much of the period has passed (for the pace marker and «per day»)
  let elapsed = 1, daysLeft = 0;
  if (value.mode === "period") {
    const r = periodRange(value.p, fin.monthStartDay);
    const a = r.from.getTime(), b = r.to.getTime();
    elapsed = now <= a ? 0 : now >= b ? 1 : (now - a) / (b - a);
    daysLeft = now >= a && now < b ? Math.max(1, Math.ceil((b - now) / DAY)) : 0;
  }


  // money now
  const bal = accountBalances(fin.accounts, d.txs, { EUR: fx.eurUah, USD: fx.usdUah });
  const live = fin.accounts.filter((a) => !a.archived);
  const accUah = (id: string, cur: string) => d.toUah(bal[id] ?? 0, cur);
  const crypto = live.filter((a) => a.offBooks).reduce((sum, a) => sum + accUah(a.id, a.currency), 0);
  const GROUP_COLORS = ["#C98C0A", "#38bdf8", "#22c55e", "#a855f7", "#f472b6", "#f97316", "#94a3b8"];
  const groups = [...new Set(live.map((a) => a.group))]
    .map((g) => ({ g, v: live.filter((a) => a.group === g).reduce((sum, a) => sum + accUah(a.id, a.currency), 0) }))
    .filter((x) => Math.abs(x.v) >= 1)
    .sort((a, b) => b.v - a.v)
    .map((x, i) => ({ ...x, color: GROUP_COLORS[i % GROUP_COLORS.length] }));
  const money = groups.reduce((sum, x) => sum + x.v, 0);
  const posMoney = groups.reduce((sum, x) => sum + Math.max(0, x.v), 0);

  // trend: last 12 months
  const chart = d.periods.slice(-12).map((p) => {
    const x = pnlSplit(d.inPeriod(p), fin, [p], first, nowP);
    const c = x.t.contractor + x.t.expense;
    return { p, name: short(p), turnover: Math.round(x.turnover), income: Math.round(x.turnover - c), costs: Math.round(c), profit: Math.round(x.net), div: Math.round(x.owner), ads: Math.round(x.ads) };
  });

  // where the money went
  const outs = [
    { label: "Підрядники і витрати проєктів", v: t.projContractor + t.projExpense, color: "#ef4444" },
    { label: "Інші витрати компанії", v: t.compContractor + t.compExpense, color: "#f97316" },
    { label: "Податки", v: t.tax, color: C.tax },
    { label: "Дивіденди", v: t.owner, color: C.div },
  ];
  const outTotal = outs.reduce((sum, x) => sum + x.v, 0);

  // best projects of the period by cash profit (received − 6% − their costs)
  const top = projectStats(d.deals, d.projects, list, fin, d.toUah)
    .filter((p) => p.type !== "none" && (p.income > 0 || p.costs > 0))
    .map((p) => ({ name: p.name, inc: p.income, profit: p.cash }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 6);

  const undivided = t.profit - t.owner;
  const label = valueLabel(value);

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Tile icon={ArrowDownLeft} color={C.turnover} label="Оборот" value={t.income} sub="усі надходження, з криптою" />
        <Tile icon={TrendingUp} color={C.income} label="Дохід" value={income} sub="оборот − витрати" />
        <Tile icon={Receipt} color={C.costs} label="Витрати" value={costs} minus sub={`проєкти ${fmtMoney(t.projContractor + t.projExpense)} · компанія ${fmtMoney(t.compContractor + t.compExpense)}`} />
        <Tile icon={Landmark} color={C.tax} label="Податки" value={t.tax} minus sub={`6% ${fmtMoney(t.tax6)} · ЄСВ і фікс. ${fmtMoney(t.taxFixed)}`} />
        <Tile icon={Coins} color={C.profit} label="Чистий прибуток" value={t.profit} accent sub={t.income > 0 ? `рентабельність ${pct(t.profit / t.income)}` : "дохід − податки"} />
        <Tile icon={Crown} color={C.div} label="Дивіденди · план" value={planDiv}
          sub={<>по <b className="text-[var(--text-muted)] font-semibold">{fmtMoney(planDiv / owners)}</b> кожному · реклама −{fmtMoney(prevAds)}</>}
          title={`Чистий прибуток ${fmtMoney(t.profit)} − рекламний бюджет минулого місяця ${fmtMoney(prevAds)} = ${fmtMoney(planDiv)}, поділено на ${owners}. Виплачено: ${fmtMoney(t.owner)}`} />
      </div>

      {canEdit && value.mode === "period" && undivided > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#a855f7]/25 bg-gradient-to-r from-[#a855f7]/[0.08] to-transparent px-4 py-2.5">
          <Crown size={15} className="text-[#c084fc]" />
          <span className="text-sm text-[var(--text)]">Ще не поділено <b className="tabular-nums text-[#c084fc]">{fmtMoney(undivided)}</b> за {periodLabel(value.p).toLowerCase()}{t.owner > 0 ? ` · уже виплачено ${fmtMoney(t.owner)}` : ""}</span>
          <button onClick={() => setSplit(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer hover:brightness-110" style={{ background: "#9333ea" }}>
            <Crown size={12} /> Поділити на дивіденди
          </button>
        </div>
      )}
      {split && value.mode === "period" && <DividendModal period={value.p} amount={undivided} onClose={() => setSplit(false)} />}

      {/* plan / fact */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="absolute -top-24 -left-16 w-72 h-72 rounded-full blur-3xl opacity-[0.07] pointer-events-none" style={{ background: C.profit }} />
        <div className="relative flex flex-wrap items-center gap-2.5 mb-4">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.profit, background: `${C.profit}1f` }}><Target size={15} /></span>
          <div className="mr-auto">
            <h3 className="text-sm font-semibold text-[var(--text)]">План / факт</h3>
            <p className="text-[11px] text-[var(--text-dim)]">{label}{daysLeft ? ` · до кінця місяця ${daysLeft} дн. · минуло ${Math.round(elapsed * 100)}%` : ""}</p>
          </div>
          {canEdit && value.mode === "period" && (
            <button onClick={() => setPlanOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/20 cursor-pointer transition-colors">
              <Pencil size={12} /> {plans.turnover || plans.profit || plans.projects ? "Змінити план" : "Задати план"}
            </button>
          )}
        </div>
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-3">
          <PlanBlock icon={ArrowDownLeft} label="Оборот" color={C.turnover} fact={t.income} plan={plans.turnover} elapsed={elapsed} />
          <PlanBlock icon={Coins} label="Чистий прибуток" color={C.profit} fact={t.profit} plan={plans.profit} elapsed={elapsed} />
          <PlanBlock icon={Briefcase} label="Нові проєкти" color={C.income} fact={newDeals.length} plan={plans.projects} elapsed={elapsed} count
            footer={
              <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                <span className="text-[var(--text-muted)]">Середній чек</span>
                <span className="tabular-nums">
                  <b className="text-[var(--text)]">{factCheck ? fmtMoney(factCheck) : "—"}</b>
                  {plans.check > 0 && <span className="text-[var(--text-dim)]"> / план {fmtMoney(plans.check)}</span>}
                  {plans.check > 0 && factCheck > 0 && <span className="ml-1.5 font-semibold" style={{ color: factCheck >= plans.check ? "#4ade80" : "#f87171" }}>{factCheck >= plans.check ? "+" : "−"}{fmtMoney(Math.abs(factCheck - plans.check))}</span>}
                </span>
              </div>
            } />
        </div>
      </section>
      {planOpen && value.mode === "period" && <PlanModal period={value.p} onClose={() => setPlanOpen(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {/* debts */}
        <DebtsCard onOpenProjects={onOpenProjects} />

        {/* money now */}
        <Card icon={Wallet} color="#38bdf8" title="Гроші зараз на рахунках">
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tabular-nums text-[var(--text)]">{fmtMoney(money)}</div>
            {crypto !== 0 && <div className="pb-1 text-[11px] text-[var(--text-dim)]">з них крипта {fmtMoney(crypto)}</div>}
          </div>
          <div className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-white/[0.05] gap-px">
            {groups.filter((x) => x.v > 0).map((x) => <div key={x.g} style={{ width: `${(x.v / (posMoney || 1)) * 100}%`, background: x.color }} title={`${x.g}: ${fmtMoney(x.v)}`} />)}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
            {groups.map((x) => (
              <div key={x.g} className="flex items-center gap-2 text-xs py-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />
                <span className="flex-1 min-w-0 truncate text-[var(--text-muted)]">{x.g}</span>
                <span className={`tabular-nums ${x.v < 0 ? "text-[#f87171]" : "text-[var(--text)]"}`}>{fmtMoney(x.v)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-dim)]">валюта — за курсом НБУ {fx.date}</div>
        </Card>
      </div>

      {/* trend */}
      <Card icon={TrendingUp} color={C.turnover} title="По місяцях">
        <TrendChart data={chart} series={SERIES} onPick={onPick} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        <Card icon={Receipt} color="#f97316" title="Куди пішли гроші">
          <div className="space-y-2.5">
            {outs.map((x) => (
              <div key={x.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--text-muted)]">{x.label}</span>
                  <span className="tabular-nums text-[var(--text)]">{fmtMoney(x.v)} <span className="text-[var(--text-dim)]">· {outTotal ? Math.round((x.v / outTotal) * 100) : 0}%</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${outTotal ? (x.v / outTotal) * 100 : 0}%`, background: x.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card icon={Crown} color={C.profit} title="ТОП проєктів за прибутком по касі" right={<button onClick={onOpenProjects} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">усі проєкти →</button>}>
          {top.length ? (
            <div className="space-y-1">
              {top.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2.5 text-xs py-1">
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold bg-white/[0.05] text-[var(--text-muted)]">{i + 1}</span>
                  <span className="flex-1 truncate text-[var(--text)]">{p.name}</span>
                  <span className="tabular-nums text-[var(--text-dim)]">{fmtMoney(p.inc)}</span>
                  <span className="w-24 text-right tabular-nums font-semibold" style={{ color: p.profit >= 0 ? C.profit : "#f87171" }}>{fmtMoney(p.profit)}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-xs text-[var(--text-dim)] py-4 text-center">За цей період оплат по проєктах немає</div>}
        </Card>
      </div>
    </div>
  );
}

// ── pieces ──

// «Нам винні»: what clients still owe by contract + overdue scheduled payments (Огляд and P&L)
export function DebtsCard({ onOpenProjects }: { onOpenProjects: () => void }) {
  const d = usePnlData();
  const { openLead } = usePnlShell();
  const scheduleQ = useQuery({
    queryKey: SCHEDULE_KEY,
    queryFn: async (): Promise<ScheduleRow[]> => {
      const res = await fetch("/api/finance/schedule");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });
  const stats = projectStats(d.deals, d.projects, d.txs, d.fin, d.toUah);
  const debtors = stats.filter((p) => p.left > 0).sort((a, b) => b.left - a.left);
  const owed = debtors.reduce((sum, p) => sum + p.left, 0);
  const overdue = (scheduleQ.data ?? []).filter((r) => stageStatus(r) === "overdue");
  const overdueSum = overdue.reduce((sum, r) => sum + d.toUah(r.amount, rowCurrency(r)), 0);
  return (
        <Card icon={HandCoins} color="#fbbf24" title="Нам винні" right={<button onClick={onOpenProjects} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">усі проєкти →</button>}>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="text-3xl font-bold tabular-nums text-[#fbbf24]">{fmtMoney(owed)}</div>
            <div className="flex gap-4 pb-1 text-xs">
              <span className={overdueSum ? "text-[#f87171]" : "text-[var(--text-dim)]"}><AlertTriangle size={11} className="inline -mt-0.5 mr-1" />прострочено {overdueSum ? `${fmtMoney(overdueSum)} · ${overdue.length}` : "—"}</span>
              <span className="text-[var(--text-dim)]">{debtors.length} проєкт(ів)</span>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {!debtors.length && <div className="py-3 text-xs text-[var(--text-dim)]">Усі клієнти розрахувались</div>}
            {debtors.slice(0, 5).map((p) => (
              <button key={p.key} onClick={() => p.deal && openLead(p.deal.id)} disabled={!p.deal}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-lg text-left text-xs hover:bg-white/[0.03] cursor-pointer disabled:cursor-default">
                <span className="flex-1 min-w-0 truncate text-[var(--text)]">{p.name}</span>
                <span className="w-24 h-1 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block">
                  <span className="block h-full rounded-full bg-[#fbbf24]" style={{ width: `${p.value ? Math.min(100, ((p.value - p.left) / p.value) * 100) : 0}%` }} />
                </span>
                <span className="w-24 text-right tabular-nums font-semibold text-[#fbbf24]">{fmtMoney(p.left)}</span>
              </button>
            ))}
          </div>
        </Card>

  );
}

function Tile({ icon: I, color, label, value, sub, minus, accent, title }: { icon: typeof Coins; color: string; label: string; value: number; sub?: React.ReactNode; minus?: boolean; accent?: boolean; title?: string }) {
  return (
    <section title={title} className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
      </div>
      <div className="relative mt-3 text-2xl font-bold tabular-nums" style={{ color: accent ? (value >= 0 ? color : "#f87171") : value < 0 ? "#f87171" : "var(--text)" }}>
        {minus && value > 0 ? "−" : ""}{fmtMoney(value)}
      </div>
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}

export function Card({ icon: I, color, title, right, children }: { icon?: typeof Coins; color?: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2.5 mb-3">
        {I && <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={14} /></span>}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

// progress ring + fact / plan + what's missing + pace (where we should be by today)
function PlanBlock({ icon: I, label, color, fact, plan, elapsed, count, footer }: {
  icon: typeof Coins; label: string; color: string; fact: number; plan: number; elapsed: number; count?: boolean; footer?: React.ReactNode;
}) {
  const f = (v: number) => (count ? String(Math.round(v)) : fmtMoney(v));
  const p = plan > 0 ? fact / plan : null;
  const left = plan - fact;
  const live = plan > 0 && elapsed > 0 && elapsed < 1;
  const pace = live ? fact - plan * elapsed : 0; // < 0 — behind the calendar
  const done = p !== null && p >= 1;
  const ringColor = p === null ? "rgba(255,255,255,0.15)" : done ? "#4ade80" : pace < 0 ? "#fbbf24" : color;
  const R = 34, L = 2 * Math.PI * R;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.035] to-transparent p-4">
      <div className="absolute -bottom-16 -right-12 w-44 h-44 rounded-full blur-3xl opacity-[0.10] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-4">
        <div className="relative w-[84px] h-[84px] shrink-0">
          <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
            <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            {live && <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" strokeDasharray={`1.5 ${L}`} strokeDashoffset={-L * elapsed} />}
            <circle cx="42" cy="42" r={R} fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${L * Math.max(0, Math.min(1, p ?? 0))} ${L}`} className="transition-[stroke-dasharray] duration-700" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold tabular-nums" style={{ color: p === null ? "var(--text-dim)" : ringColor }}>{pct(p)}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-muted)]"><I size={12} style={{ color }} />{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)] truncate">{f(fact)}</div>
          <div className="text-xs text-[var(--text-dim)] tabular-nums">{plan > 0 ? `з ${f(plan)}` : "план не задано"}</div>
        </div>
      </div>
      {plan > 0 && (
        <div className="relative mt-3.5 flex flex-wrap gap-1.5">
          {left > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#ef4444]/10 text-[#f87171]">
              <Target size={12} /> не вистачає <b className="tabular-nums">{f(left)}</b>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#22c55e]/10 text-[#4ade80]">
              <Check size={12} /> план виконано{left < 0 ? <> · +<b className="tabular-nums">{f(-left)}</b></> : null}
            </span>
          )}
          {live && left > 0 && (pace < 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#fbbf24]/10 text-[#fbbf24]" title={`За календарем мали б ${f(plan * elapsed)}`}>
              <TrendingDown size={12} /> відстаємо на <b className="tabular-nums">{f(-pace)}</b>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#22c55e]/10 text-[#4ade80]" title={`За календарем мали б ${f(plan * elapsed)}`}>
              <TrendingUp size={12} /> випереджаємо на <b className="tabular-nums">{f(pace)}</b>
            </span>
          ))}
        </div>
      )}
      {footer && <div className="relative mt-3">{footer}</div>}
    </div>
  );
}

// «Задати план» of a month: turnover, income, net profit
function PlanModal({ period, onClose }: { period: string; onClose: () => void }) {
  const d = usePnlData();
  const { fin, save, first, nowP } = d;
  const prev = shiftPeriod(period, -1);
  const fmt = (v: number | undefined) => (v ? numText(v) : "");
  const pick = (p: string) => ({ turnover: fmt(fin.planTurnover[p]), profit: fmt(fin.plan[p]), projects: fmt(fin.planProjects[p]), check: fmt(fin.planCheck[p]) });
  const [vals, setVals] = useState(() => pick(period));
  const [busy, setBusy] = useState(false);
  const last = pnlSplit(d.inPeriod(prev), fin, [prev], first, nowP);
  const lastFact = { turnover: fmtMoney(last.turnover), profit: fmtMoney(last.net), projects: "", check: "" };
  const rows = [
    { k: "turnover", label: "Оборот", hint: "усі надходження", color: C.turnover, unit: "₴" },
    { k: "profit", label: "Чистий прибуток", hint: "дохід − податки", color: C.profit, unit: "₴" },
    { k: "projects", label: "Нових проєктів", hint: "скільки закрити", color: C.income, unit: "шт" },
    { k: "check", label: "Середній чек", hint: "вартість проєкту", color: C.income, unit: "₴" },
  ] as const;

  async function submit() {
    const put = (m: Record<string, number>, v: string) => {
      const n = { ...m };
      if (!v.trim()) delete n[period];
      else n[period] = parseNum(v);
      return n;
    };
    for (const r of rows) if (vals[r.k].trim() && !(parseNum(vals[r.k]) >= 0)) return toastError(`Перевір «${r.label}»`);
    setBusy(true);
    try {
      await save({ ...fin, planTurnover: put(fin.planTurnover, vals.turnover), plan: put(fin.plan, vals.profit), planProjects: put(fin.planProjects, vals.projects), planCheck: put(fin.planCheck, vals.check) });
      onClose();
    } catch {
      toastError("Не вдалося зберегти план");
    } finally {
      setBusy(false);
    }
  }

  const copyPrev = () => setVals(pick(prev));
  const hasPrev = !!(fin.planTurnover[prev] || fin.plan[prev] || fin.planProjects[prev]);

  return (
    <Modal open onClose={onClose} title={`План · ${periodLabel(period).toLowerCase()}`} size="md">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        {rows.map((r) => (
          <label key={r.k} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 focus-within:border-[var(--accent)] transition-colors">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
            <span className="w-36 shrink-0">
              <span className="block text-sm text-[var(--text)]">{r.label}</span>
              <span className="block text-[10px] text-[var(--text-dim)]">{r.hint}{lastFact[r.k] ? ` · минулого міс. ${lastFact[r.k]}` : ""}</span>
            </span>
            <input value={vals[r.k]} onChange={(e) => setVals({ ...vals, [r.k]: groupNum(e.target.value) })} inputMode="decimal" placeholder="0" autoFocus={r.k === "turnover"}
              className="flex-1 min-w-0 bg-transparent text-right text-lg font-semibold tabular-nums text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]" />
            <span className="text-sm text-[var(--text-dim)]">{r.unit}</span>
          </label>
        ))}
        <div className="flex items-center gap-2 pt-1">
          {hasPrev && <button type="button" onClick={copyPrev} className="px-3 py-2 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04] cursor-pointer">Як у {periodLabel(prev).toLowerCase()}</button>}
          <button type="button" onClick={onClose} className="ml-auto px-3.5 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-black cursor-pointer hover:brightness-110 disabled:opacity-50" style={{ background: "var(--accent)" }}>Зберегти план</button>
        </div>
      </form>
    </Modal>
  );
}
