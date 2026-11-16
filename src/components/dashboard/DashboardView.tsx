"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Activity, BadgePercent, ChevronDown, ChevronRight, Euro, Layers, Megaphone, Radio, Target, Trophy, Users, Zap,
} from "lucide-react";
import { fmtMoney } from "@/lib/finance";
import { Card } from "@/components/finance/PnlHomeTab";
import TrendChart from "@/components/finance/TrendChart";
import DashFilterBar from "@/components/dashboard/DashFilterBar";
import DashHeader from "@/components/dashboard/DashHeader";
import type { PeriodValue } from "@/components/finance/PeriodPicker";
import type { DashboardData, SourceRow, Totals } from "@/lib/dashboardStats";

const cnt = (v: number) => String(Math.round(v));
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const pctText = (v: number | null) => (v === null ? "—" : `${v < 10 && v > 0 ? v.toFixed(1).replace(".", ",") : Math.round(v)}%`);
const uah = (v: number | null) => (v === null ? "—" : fmtMoney(v));
const price = (spend: number, n: number) => (spend > 0 && n > 0 ? spend / n : null);
const avgCheck = (t: Totals) => (t.priced ? t.revenue / t.priced : null);

const SERIES = [
  { key: "leads", label: "Всього лідів", color: "#C98C0A", fmt: cnt },
  { key: "targeted", label: "Цільові", color: "#22c55e", fmt: cnt },
  { key: "proposals", label: "КП", color: "#a78bfa", fmt: cnt },
  { key: "sales", label: "Продажі", color: "#38bdf8", fmt: cnt },
  { key: "notTarget", label: "Не ЦА", color: "#f87171", fmt: cnt, minor: true },
  { key: "dup", label: "Дублі", color: "#94a3b8", fmt: cnt, minor: true },
] as const;
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const MONTHS_NOM = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
// «7 листопада 2026» for a day, «Листопад 2026» for a month
const tipTitle = (p: string) => {
  const [y, m, d] = p.split("-").map(Number);
  return d ? `${d} ${MONTHS_GEN[m - 1]} ${y}` : `${MONTHS_NOM[m - 1]} ${y}`;
};

// «Дашборд»: how many leads, of what quality, from where, what they cost and how many became sales — this period vs the previous one.
export default function DashboardView({ data, value }: { data: DashboardData; value: PeriodValue }) {
  const { cur, prev, kpi } = data;
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const prevName = prev?.short ?? "";

  const conv = pct(kpi.cur.sales, kpi.cur.leads), convPrev = kpi.prev ? pct(kpi.prev.sales, kpi.prev.leads) : null;
  const tgtShare = pct(kpi.cur.targeted, kpi.cur.leads), tgtSharePrev = kpi.prev ? pct(kpi.prev.targeted, kpi.prev.leads) : null;

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      <DashHeader tab="overview" right={<DashFilterBar value={value} />} />

      {/* this period vs previous */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <CmpTile icon={Users} color="#C98C0A" label="Всього лідів" cur={kpi.cur.leads} prev={kpi.prev?.leads ?? null} prevName={prevName} fmt={cnt} />
        <CmpTile icon={Target} color="#22c55e" label="Цільові ліди" cur={kpi.cur.targeted} prev={kpi.prev?.targeted ?? null} prevName={prevName} fmt={cnt}
          sub={tgtShare !== null ? `${pctText(tgtShare)} від лідів${tgtSharePrev !== null ? ` · було ${pctText(tgtSharePrev)}` : ""}` : undefined} />
        <CmpTile icon={Trophy} color="#38bdf8" label="Продажі" cur={kpi.cur.sales} prev={kpi.prev?.sales ?? null} prevName={prevName} fmt={cnt} />
        <CmpTile icon={BadgePercent} color="#a78bfa" label="Конверсія в продаж" cur={conv} prev={convPrev} prevName={prevName} fmt={(v) => pctText(v)} points
          sub="продажі ÷ ліди" />
        <CmpTile icon={Euro} color="#f472b6" label="Сер. вартість проєкту" cur={avgCheck(kpi.cur)} prev={kpi.prev ? avgCheck(kpi.prev) : null} prevName={prevName}
          fmt={(v) => fmtMoney(v, "EUR")} sub={kpi.cur.priced ? `з ${kpi.cur.priced} продажів` : "немає продажів із сумою"} />
      </div>

      {/* today + ad costs | dynamics */}
      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-2.5 items-start">
        <div className="space-y-2.5">
          <TodayCard data={data} />
          <CostsCard data={data} />
        </div>
        <Card icon={Activity} color="#C98C0A" title="Динаміка лідів">
          <div className="space-y-4">
            <ChartBlock label={cur.label} total={kpi.cur.leads}>
              <TrendChart data={data.daily.cur} series={SERIES} height={230} storeKey="dash-dyn-view" defaultView="lines" showChange={false}
                hover={hover} onHover={setHover} hidden={hidden} onHidden={setHidden}
                tipTitle={tipTitle} />
            </ChartBlock>
            {data.daily.prev && prev && (
              <ChartBlock label={prev.label} total={kpi.prev?.leads ?? 0} dim>
                <TrendChart data={data.daily.prev} series={SERIES} height={230} storeKey="dash-dyn-view" defaultView="lines" showChange={false}
                  hover={hover} onHover={setHover} hidden={hidden} onHidden={setHidden} tipTitle={tipTitle} />
              </ChartBlock>
            )}
          </div>
        </Card>
      </div>

      {/* sources and campaigns */}
      <SourcesCard data={data} />

      {/* stages */}
      <StagesCard data={data} />
    </div>
  );
}

function ChartBlock({ label, total, dim, children }: { label: string; total: number; dim?: boolean; children: React.ReactNode }) {
  return (
    <div className={dim ? "pt-3 border-t border-white/[0.05]" : ""}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
        <span className="text-xs text-[var(--text-dim)] tabular-nums">{total} лідів</span>
      </div>
      {children}
    </div>
  );
}

// big value of this period + the previous one + ▲▼
function CmpTile({ icon: I, color, label, cur, prev, prevName, fmt, sub, points, invert }: {
  icon: typeof Users; color: string; label: string; cur: number | null; prev: number | null; prevName: string;
  fmt: (v: number) => string; sub?: string; points?: boolean; invert?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
      </div>
      <div className="relative mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-[var(--text)] truncate">{cur === null ? "—" : fmt(cur)}</span>
        <Delta cur={cur} prev={prev} points={points} invert={invert} />
      </div>
      {prev !== null && prevName && <div className="relative mt-1 text-[11px] text-[var(--text-muted)] truncate">{prevName}: <span className="tabular-nums text-[var(--text)]/80">{fmt(prev)}</span></div>}
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}

// ▲ 12% (or +3 п.п. for percentages); invert — when less is better (prices)
function Delta({ cur, prev, points, invert }: { cur: number | null; prev: number | null; points?: boolean; invert?: boolean }) {
  if (cur === null || prev === null || (!points && !prev)) return null;
  const d = points ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(d) < 0.5) return <span className="text-[11px] text-[var(--text-dim)]">= як було</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color: good ? "#4ade80" : "#f87171" }}>
      {d > 0 ? "▲" : "▼"} {points ? `${Math.abs(d).toFixed(1).replace(".", ",")} п.п.` : `${Math.min(999, Math.round(Math.abs(d)))}%`}
    </span>
  );
}

function TodayCard({ data }: { data: DashboardData }) {
  const { total, sources } = data.today;
  const max = Math.max(1, ...sources.map((s) => s.n));
  return (
    <Card icon={Zap} color="#C98C0A" title="Ліди сьогодні" right={<span className="text-2xl font-bold tabular-nums text-[var(--accent)] leading-none">{total}</span>}>
      {!sources.length ? (
        <div className="py-3 text-center text-xs text-[var(--text-dim)]">Сьогодні ще немає лідів · <Link href="/leads" className="text-[var(--accent)] hover:underline">до CRM →</Link></div>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.name}>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="flex-1 truncate text-[var(--text)]">{s.name}</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">{s.n}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/[0.05] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s.n / max) * 100}%`, background: s.color }} /></div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ad spend and what one lead / target lead / proposal / sale cost (only leads of ad sources)
function CostsCard({ data }: { data: DashboardData }) {
  const { paidCur: c, paidPrev: p } = data.kpi;
  const rows: { label: string; cur: number | null; prev: number | null; hint?: string }[] = [
    { label: "Витрати на рекламу", cur: c.spend, prev: p?.spend ?? null },
    { label: "Ціна ліда", cur: price(c.spend, c.leads), prev: p ? price(p.spend, p.leads) : null, hint: `${c.leads} лідів з реклами` },
    { label: "Ціна цільового", cur: price(c.spend, c.targeted), prev: p ? price(p.spend, p.targeted) : null, hint: `${c.targeted} цільових` },
    { label: "Ціна КП", cur: price(c.spend, c.proposals), prev: p ? price(p.spend, p.proposals) : null, hint: `${c.proposals} КП` },
    { label: "Ціна продажу", cur: price(c.spend, c.sales), prev: p ? price(p.spend, p.sales) : null, hint: `${c.sales} продажів` },
  ];
  return (
    <Card icon={Megaphone} color="#f97316" title="Реклама · ціна" right={<Link href="/ads" className="text-[11px] text-[var(--text-dim)] hover:text-[var(--accent)]">детальніше →</Link>}>
      <div className="divide-y divide-white/[0.04]">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-[var(--text)]">{r.label}</span>
              {r.hint && <span className="block text-[10px] text-[var(--text-dim)]">{r.hint}</span>}
            </span>
            <span className="text-right">
              <span className="flex items-baseline justify-end gap-1.5">
                <Delta cur={r.cur} prev={r.prev} invert={i > 0} />
                <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{uah(r.cur)}</span>
              </span>
              {data.prev && <span className="block text-[10px] tabular-nums text-[var(--text-dim)]">{data.prev.short}: {uah(r.prev)}</span>}
            </span>
          </div>
        ))}
      </div>
      {data.kpi.unlinkedCur > 0 && (
        <div className="mt-2.5 rounded-lg bg-[#f97316]/10 border border-[#f97316]/20 px-2.5 py-1.5 text-[11px] text-[#fdba74]">
          {fmtMoney(data.kpi.unlinkedCur)} у кешфлоу без кампанії — враховано в загальних витратах
        </div>
      )}
    </Card>
  );
}

// sources → campaigns: leads, quality, sales, conversion and prices; this period + the previous one in grey
function SourcesCard({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(data.sources.filter((s) => s.campaigns.length).map((s) => s.key)));
  const toggle = (k: string) => setOpen((o) => { const x = new Set(o); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const total: SourceRow = { key: "__total", name: "Разом", color: "#C98C0A", ad: false, cur: data.kpi.cur, prev: data.kpi.prev, campaigns: [] };
  const anyAd = data.sources.some((s) => s.ad);
  const cols = anyAd ? "minmax(160px,1.4fr) repeat(5,minmax(62px,0.7fr)) repeat(5,minmax(76px,0.8fr))" : "minmax(190px,1.4fr) repeat(5,minmax(78px,0.7fr))";

  const line = (r: SourceRow, depth: number, isTotal = false) => {
    const c = r.cur, p = r.prev;
    const hasCamps = r.campaigns.length > 0;
    const showSpend = r.ad || isTotal;
    const totalSpend = isTotal ? data.kpi.paidCur : null;
    const priceCells = anyAd ? (
      <>
        <Cell v={showSpend ? c.spend || null : null} pv={showSpend && p ? p.spend || null : null} fmt={uah} />
        {(["leads", "targeted", "proposals", "sales"] as const).map((k) => {
          const base = isTotal ? totalSpend! : c, pb = isTotal ? data.kpi.paidPrev : p;
          return <Cell key={k} v={showSpend ? price(base.spend, base[k]) : null} pv={showSpend && pb ? price(pb.spend, pb[k]) : null} fmt={uah} invert />;
        })}
      </>
    ) : null;
    return (
      <div key={r.key}
        className={`grid gap-x-3 items-center px-2 py-2 ${isTotal ? "border-t border-white/[0.08] bg-white/[0.02] rounded-b-xl font-semibold" : "border-b border-white/[0.04]"} ${depth ? "bg-white/[0.012]" : ""}`}
        style={{ gridTemplateColumns: cols }}>
        <span className="flex items-center gap-2 min-w-0" style={{ paddingLeft: depth * 22 }}>
          {hasCamps ? (
            <button onClick={() => toggle(r.key)} className="w-4 h-4 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer shrink-0">
              {open.has(r.key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : !isTotal && <span className="w-4 shrink-0" />}
          {depth ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.color, opacity: 0.6 }} /> : !isTotal && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />}
          <span className={`truncate ${depth ? "text-[13px] text-[var(--text-muted)]" : "text-sm text-[var(--text)]"} ${r.fallback ? "italic" : ""}`} title={r.name}>{r.name}</span>
          {!depth && r.ad && !isTotal && <span className="text-[9px] px-1.5 py-px rounded bg-[#f97316]/12 text-[#fdba74] shrink-0">реклама</span>}
        </span>
        <Cell v={c.leads} pv={p?.leads ?? null} fmt={cnt} strong />
        <Cell v={c.targeted} pv={p?.targeted ?? null} fmt={cnt} extra={c.leads ? pctText(pct(c.targeted, c.leads)) : undefined} />
        <Cell v={c.proposals} pv={p?.proposals ?? null} fmt={cnt} />
        <Cell v={c.sales} pv={p?.sales ?? null} fmt={cnt} />
        <Cell v={pct(c.sales, c.leads)} pv={p ? pct(p.sales, p.leads) : null} fmt={pctText} accent />
        {priceCells}
      </div>
    );
  };

  return (
    <Card icon={Radio} color="#22c55e" title="Джерела та кампанії" right={data.prev ? <span className="text-[11px] text-[var(--text-dim)]">{data.cur.label} · сірим — {data.prev.label}</span> : undefined}>
      {!data.sources.length ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">За період немає лідів</div> : (
        <div className="overflow-x-auto -mx-1 px-1">
          <div style={{ minWidth: anyAd ? 960 : 640 }}>
            <div className="grid gap-x-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]" style={{ gridTemplateColumns: cols }}>
              <span>Джерело / кампанія</span>
              <span className="text-right">Ліди</span><span className="text-right">Цільові</span><span className="text-right">КП</span><span className="text-right">Продажі</span><span className="text-right">Конверсія</span>
              {anyAd && <><span className="text-right">Витрати</span><span className="text-right">Ціна ліда</span><span className="text-right">Ціна цільов.</span><span className="text-right">Ціна КП</span><span className="text-right">Ціна продажу</span></>}
            </div>
            {data.sources.map((s) => (
              <Fragment key={s.key}>
                {line(s, 0)}
                {open.has(s.key) && s.campaigns.map((c) => line(c, 1))}
              </Fragment>
            ))}
            {line(total, 0, true)}
          </div>
        </div>
      )}
    </Card>
  );
}

function Cell({ v, pv, fmt, strong, accent, invert, extra }: { v: number | null; pv: number | null; fmt: (v: number) => string; strong?: boolean; accent?: boolean; invert?: boolean; extra?: string }) {
  const up = v !== null && pv !== null && v !== pv ? v > pv : null;
  const good = up === null ? null : invert ? !up : up;
  return (
    <span className="text-right leading-tight">
      <span className={`block tabular-nums text-sm ${strong ? "font-semibold text-[var(--text)]" : accent ? "font-semibold text-[#c4b5fd]" : "text-[var(--text)]"} ${v === null || v === 0 ? "!text-[var(--text-dim)] !font-normal" : ""}`}>
        {v === null ? "—" : fmt(v)}{extra && <span className="ml-1 text-[10px] text-[var(--text-dim)] font-normal">{extra}</span>}
      </span>
      {pv !== null && pv !== undefined && (
        <span className="block text-[10px] tabular-nums" style={{ color: good === null ? "var(--text-dim)" : good ? "#4ade8099" : "#f8717199" }}>{fmt(pv)}</span>
      )}
    </span>
  );
}

function StagesCard({ data }: { data: DashboardData }) {
  const n = data.stagesTotal;
  const max = Math.max(1, ...data.stages.map((s) => s.current));
  return (
    <Card icon={Layers} color="#a78bfa" title="Ліди по стадіях" right={<span className="text-[11px] text-[var(--text-dim)]">ліди, створені за {data.cur.label.toLowerCase()} · {n}</span>}>
      {!n ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">За період немає лідів</div> : (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(170px,1.2fr)_minmax(160px,1.4fr)_70px_80px_90px_100px_110px] gap-x-4 px-1 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]">
              <span>Стадія</span><span>Зараз на стадії</span><span className="text-right">% лідів</span>
              <span className="text-right" title="Скільки лідів періоду пройшли цю стадію">Пройшли</span>
              <span className="text-right" title="Який % з попередньої стадії дійшов до цієї">Перехід</span>
              <span className="text-right" title="Скільки з тих, хто пройшов стадію, дійшли до продажу">Конв. у продаж</span>
              <span className="text-right">Сума</span>
            </div>
            {data.stages.map((s) => (
              <div key={s.id} className="grid grid-cols-[minmax(170px,1.2fr)_minmax(160px,1.4fr)_70px_80px_90px_100px_110px] gap-x-4 items-center px-1 py-2 border-b border-white/[0.04] last:border-0">
                <span className="flex items-center gap-2 min-w-0 text-sm text-[var(--text)]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} /><span className="truncate">{s.label}</span>
                  {s.skip && <span className="text-[9px] px-1 py-px rounded text-orange-400 bg-orange-400/10" title="Обхідна стадія">обхід</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(s.current / max) * 100}%`, background: s.color, opacity: s.kind === "active" ? 0.9 : 0.55 }} /></span>
                  <span className="w-7 text-right text-sm font-semibold tabular-nums text-[var(--text)]">{s.current}</span>
                </span>
                <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{pctText(pct(s.current, n))}</span>
                <span className="text-right text-sm tabular-nums text-[var(--text)]">{s.ever}</span>
                <span className="text-right text-sm tabular-nums text-[var(--text-muted)]" title={`від «${s.fromLabel}»`}>{s.step === null ? "—" : `${s.step}%`}</span>
                <span className="text-right text-sm tabular-nums" style={{ color: s.ever ? "#c4b5fd" : "var(--text-dim)" }}>{s.ever ? `${Math.round((s.won / s.ever) * 100)}%` : "—"}</span>
                <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{s.amount ? fmtMoney(s.amount, "EUR") : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

