"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Filter, Layers, PieChart, Radio, RotateCcw, TrendingDown, X,
} from "lucide-react";
import { fmtMoney } from "@/lib/finance";
import { Card } from "@/components/finance/PnlHomeTab";
import TrendChart from "@/components/finance/TrendChart";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import DashHeader from "@/components/dashboard/DashHeader";
import { countOf, ratio, sourceColor, type Counts, type LeadsReportData, type ReportLead } from "@/lib/leadsReport";

const DAY = 86_400_000;
const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const cnt = (v: number) => String(Math.round(v));
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const pctText = (v: number | null) => (v === null ? "—" : `${v > 0 && v < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v)}%`);
const price = (spend: number, n: number) => (spend > 0 && n > 0 ? spend / n : null);
const uah = (v: number | null) => (v === null ? "—" : fmtMoney(v));
type Kind = "all" | "ad" | "free";

const MONTHS_UA = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const monthLabel = (m: string) => { const [y, mm] = m.split("-").map(Number); return `${MONTHS_UA[mm - 1]} ${y}`; };
const shiftMonth = (m: string, by: number) => { const [y, mm] = m.split("-").map(Number); return ymd(new Date(y, mm - 1 + by, 1)).slice(0, 7); };
// a whole calendar month (the current one — up to today)
const monthRange = (m: string, today: string) => { const [y, mm] = m.split("-").map(Number); const last = ymd(new Date(y, mm, 0)); return { from: `${m}-01`, to: last < today ? last : today }; };

// dates of the picked period (the current month — only up to today)
function rangeOf(v: PeriodValue, today: string): { from: string; to: string } {
  if (v.mode === "all") return { from: "2020-01-01", to: today };
  if (v.mode === "range") return { from: v.from, to: v.to };
  const [y, m] = v.p.split("-").map(Number);
  const last = ymd(new Date(y, m, 0));
  return { from: `${v.p}-01`, to: last < today ? last : today };
}

// «Ліди і конверсії»: range + sources (several, add / remove) + source type + loss reason + stage → bars by days,
// conversion by sources and loss reasons, the price of every step (lead → targeted → qualified → КП → sale).
export default function LeadsReport() {
  const [today] = useState(() => ymd(new Date()));
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: today.slice(0, 7) }));
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<Kind>("all");
  const [reasons, setReasons] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<Set<string>>(new Set());
  const { from, to } = rangeOf(period, today);

  const q = useQuery({
    queryKey: ["leads-report", from, to],
    queryFn: async (): Promise<LeadsReportData> => {
      const r = await fetch(`/api/dashboard/leads-report?from=${from}&to=${to}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const data = q.data;
  // the funnel compares two months: by default the picked one & the one before, each can be switched
  const [cmpA, setCmpA] = useState<string | null>(null);
  const [cmpB, setCmpB] = useState<string | null>(null);
  const monthA = cmpA ?? (period.mode === "period" ? period.p : today.slice(0, 7));
  const monthB = cmpB ?? shiftMonth(monthA, -1);
  const fetchMonth = (m: string) => async (): Promise<LeadsReportData> => {
    const r = monthRange(m, today);
    const res = await fetch(`/api/dashboard/leads-report?from=${r.from}&to=${r.to}`);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  const ra = monthRange(monthA, today), rb = monthRange(monthB, today);
  const qA = useQuery({ queryKey: ["leads-report", ra.from, ra.to], queryFn: fetchMonth(monthA), staleTime: 30_000, placeholderData: (p) => p });
  const qB = useQuery({ queryKey: ["leads-report", rb.from, rb.to], queryFn: fetchMonth(monthB), staleTime: 30_000, placeholderData: (p) => p });

  // everything below follows the settings; the source list itself ignores the picked sources (so you can switch)
  const base = useMemo(() => (data?.leads ?? []).filter((l) =>
    (kind === "all" || (kind === "ad") === l.ad)
    && (!reasons.size || (l.r !== null && reasons.has(l.r)))
    && (!stages.size || stages.has(l.st))), [data, kind, reasons, stages]);
  const picked = useMemo(() => (sources.size ? base.filter((l) => sources.has(l.src)) : base), [base, sources]);

  const header = <DashHeader tab="leads" right={<PeriodPicker value={period} onChange={setPeriod} startDay={1} align="right" />} />;
  if (!data) return <div className="p-3 sm:p-6 space-y-4 relative z-10">{header}<div className="py-16 text-center text-sm text-[var(--text-muted)]">{q.isError ? "Не вдалося завантажити" : "Завантаження…"}</div></div>;

  const colorOf = (s: string) => sourceColor(s, data.adTypes);
  const allSources = [...new Set(data.leads.map((l) => l.src)), ...data.adTypes.map((t) => t.name)].filter((v, i, a) => a.indexOf(v) === i);
  const spendOf = (src: string, camp?: string | null) => data.spend.filter((s) => s.src === src && (camp === undefined || s.camp === camp)).reduce((a, s) => a + s.uah, 0);
  // funnel of any loaded period with the same settings (this one and the one before)
  const funnelOf = (d: LeadsReportData) => {
    const ls = d.leads.filter((l) => (kind === "all" || (kind === "ad") === l.ad)
      && (!reasons.size || (l.r !== null && reasons.has(l.r))) && (!stages.size || stages.has(l.st))
      && (!sources.size || sources.has(l.src)));
    const so = (src: string) => d.spend.filter((x) => x.src === src).reduce((a, x) => a + x.uah, 0);
    const adSrc = (sources.size ? [...sources] : d.adTypes.map((t) => t.name)).filter((x) => d.adTypes.some((t) => t.name === x));
    const spend = kind === "free" ? 0 : adSrc.reduce((a, x) => a + so(x), 0) + (sources.size ? 0 : so("Без кампанії"));
    return { total: countOf(ls, d), paid: countOf(ls.filter((l) => l.ad), d), spend };
  };
  const fA = qA.data ? funnelOf(qA.data) : null;
  const fB = qB.data ? funnelOf(qB.data) : null;
  const anyFilter = sources.size || kind !== "all" || reasons.size || stages.size;
  const resetAll = () => { setSources(new Set()); setKind("all"); setReasons(new Set()); setStages(new Set()); };

  // left list: share of every source (by the other settings)
  const bySrc = new Map<string, number>();
  for (const l of base) if (l.inR) bySrc.set(l.src, (bySrc.get(l.src) ?? 0) + 1);
  const srcList = [...bySrc].sort((a, b) => b[1] - a[1]);
  const srcTotal = srcList.reduce((a, [, n]) => a + n, 0);
  const clickSource = (s: string, add: boolean) => setSources((cur) => {
    const x = new Set(add ? cur : []);
    if (cur.has(s) && (add || cur.size === 1)) x.delete(s); else x.add(s);
    return x;
  });

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      {header}
      {/* settings */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"><Filter size={13} />Налаштування</span>
        <Segmented value={kind} onChange={setKind} options={[["all", "Усі джерела"], ["ad", "Реклама"], ["free", "Без реклами"]]} />
        <Multi label="Джерела" icon={Radio} all={allSources.map((s) => ({ id: s, label: s, color: colorOf(s) }))} value={sources} onChange={setSources} />
        <Multi label="Причина програшу" icon={TrendingDown} all={data.reasons.map((r) => ({ id: r.id, label: r.label }))} value={reasons} onChange={setReasons} />
        <Multi label="Стадія" icon={Layers} all={data.stages.map((s) => ({ id: s.id, label: s.label, color: s.color }))} value={stages} onChange={setStages} />
        {anyFilter ? <button onClick={resetAll} className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><RotateCcw size={12} />Скинути</button> : null}
        {[...sources].map((s) => (
          <span key={s} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs border" style={{ color: colorOf(s), borderColor: `${colorOf(s)}55`, background: `${colorOf(s)}14` }}>
            {s}<button onClick={() => clickSource(s, true)} className="p-0.5 rounded hover:bg-white/10 cursor-pointer"><X size={11} /></button>
          </span>
        ))}
      </section>

      {/* sources share | chart */}
      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-2.5 items-stretch">
        <Card icon={PieChart} color="#22c55e" title="Джерела" right={<span className="text-[11px] text-[var(--text-dim)] tabular-nums">{srcTotal} лідів</span>}>
          {!srcList.length ? <div className="py-6 text-center text-xs text-[var(--text-dim)]">Немає лідів</div> : (
            <>
              <div className="flex h-2.5 rounded-full overflow-hidden mb-3 bg-white/[0.04]">
                {srcList.map(([s, n]) => <span key={s} style={{ width: `${(n / srcTotal) * 100}%`, background: colorOf(s), opacity: !sources.size || sources.has(s) ? 1 : 0.25 }} />)}
              </div>
              <div className="space-y-0.5">
                {srcList.map(([s, n]) => {
                  const on = sources.has(s), dim = sources.size > 0 && !on;
                  return (
                    <button key={s} onClick={(e) => clickSource(s, e.metaKey || e.ctrlKey || e.shiftKey)} title="Клік — тільки це джерело · Ctrl/⌘+клік — додати"
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"} ${dim ? "opacity-45" : ""}`}>
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorOf(s) }} />
                      <span className="flex-1 min-w-0 truncate text-sm text-[var(--text)]">{s}</span>
                      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{n}</span>
                      <span className="w-10 text-right text-[11px] tabular-nums text-[var(--text-dim)]">{pctText(pct(n, srcTotal))}</span>
                      {on && <Check size={13} className="text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[10px] text-[var(--text-dim)]">Клік — показати тільки це джерело. Ctrl/⌘ + клік — додати ще одне.</div>
            </>
          )}
        </Card>
        <Card icon={BarChart3} color="#C98C0A" title={sources.size ? `Ліди · ${[...sources].join(", ")}` : "Ліди · кваліфіковані · продажі"}
          right={<span className="text-[11px] text-[var(--text-dim)]">{q.isFetching ? "оновлюю…" : `${fmtDay(from)} – ${fmtDay(to)}`}</span>}>
          <TrendChart data={chartData(picked, from, to, today)} height={300} storeKey="lr-chart-view" defaultView="bars" showChange={false} tipTitle={tipTitle} series={[
            { key: "leads", label: "Всього лідів", color: "#C98C0A", fmt: cnt },
            { key: "qualified", label: "Кваліфіковані", color: "#22c55e", fmt: cnt },
            { key: "sales", label: "Продажі", color: "#38bdf8", fmt: cnt },
          ]} />
        </Card>
      </div>

      {/* price of every step */}
      <Card icon={CircleDollarSign} color="#f97316" title="Воронка і ціна кожного етапу" right={
        <div className="flex items-center gap-2">
          <MonthSwitch value={monthA} onChange={setCmpA} max={today.slice(0, 7)} />
          <span className="text-lg font-semibold text-[var(--accent)] leading-none">&amp;</span>
          <MonthSwitch value={monthB} onChange={setCmpB} max={today.slice(0, 7)} dim />
          {(cmpA || cmpB) && <button onClick={() => { setCmpA(null); setCmpB(null); }} title="Як за замовчуванням: вибраний місяць & попередній" className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer"><RotateCcw size={13} /></button>}
        </div>
      }>
        <div className="space-y-4">
          {fA ? <FunnelCosts label={monthLabel(monthA)} {...fA} /> : <div className="py-6 text-center text-xs text-[var(--text-dim)]">Завантаження…</div>}
          {fB ? <FunnelCosts label={monthLabel(monthB)} {...fB} dim /> : <div className="py-6 text-center text-xs text-[var(--text-dim)]">Завантаження…</div>}
        </div>
        <div className="mt-3 text-[10px] text-[var(--text-dim)]">Кожен етап — у день, коли лід на нього потрапив (продаж — у день продажу). % — скільки з тих, хто потрапив на попередній етап у цьому місяці, дійшли далі. Ціна = витрати на рекламу за місяць ÷ скільки цього етапу було з реклами.</div>
      </Card>

      {/* conversion by sources */}
      <SourcesTable data={data} picked={picked} colorOf={colorOf} spendOf={spendOf} kind={kind} sourcesSel={sources} />

      {/* loss reasons */}
      <ReasonsTable data={data} picked={picked} colorOf={colorOf} />
    </div>
  );
}

const fmtDay = (s: string) => s.split("-").reverse().join(".");
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const MONTHS_NOM = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const tipTitle = (p: string) => {
  const [y, m, d] = p.split("-").map(Number);
  return d ? `${d} ${MONTHS_GEN[m - 1]} ${y}` : `${MONTHS_NOM[m - 1]} ${y}`;
};

function chartData(leads: ReportLead[], from: string, to: string, today: string) {
  const end = to < today ? to : today;
  const long = (parse(end).getTime() - parse(from).getTime()) / DAY > 62;
  const rows: { p: string; name: string; leads: number; qualified: number; sales: number }[] = [];
  const idx = new Map<string, number>();
  const key = (s: string) => (long ? s.slice(0, 7) : s);
  let start = from;
  if (long) { const first = leads.filter((l) => l.inR).map((l) => l.d).sort()[0]; if (first && first > start) start = first; }
  const c = parse(start);
  if (long) c.setDate(1);
  while (ymd(c) <= end && rows.length < 400) {
    const k = key(ymd(c));
    if (!idx.has(k)) {
      idx.set(k, rows.length);
      rows.push({ p: k, name: long ? `${MONTHS_SHORT[c.getMonth()]} ${String(c.getFullYear()).slice(2)}` : String(c.getDate()), leads: 0, qualified: 0, sales: 0 });
    }
    if (long) c.setMonth(c.getMonth() + 1); else c.setDate(c.getDate() + 1);
  }
  for (const l of leads) {
    const i = l.inR ? idx.get(key(l.d)) : undefined;
    if (i !== undefined) rows[i].leads++;
    // every step on its own day
    if (l.qD && l.qD >= from && l.qD <= to) { const j = idx.get(key(l.qD)); if (j !== undefined) rows[j].qualified++; }
    if (l.wD && l.wD >= from && l.wD <= to) { const j = idx.get(key(l.wD)); if (j !== undefined) rows[j].sales++; }
  }
  return rows;
}

// lead → targeted → qualified → КП → sale: how many, % from the previous step, what one costs
function FunnelCosts({ label, total, paid, spend, dim }: { label: string; total: Counts; paid: Counts; spend: number; dim?: boolean }) {
  const steps = [
    { key: "leads", label: "Ліди", color: "#C98C0A", n: total.leads, pn: paid.leads },
    { key: "targeted", label: "Цільові", color: "#22c55e", n: total.targeted, pn: paid.targeted, cv: total.cv.targeted },
    { key: "qualified", label: "Кваліфіковані", color: "#2dd4bf", n: total.qualified, pn: paid.qualified, cv: total.cv.qualified },
    { key: "proposals", label: "КП", color: "#a78bfa", n: total.proposals, pn: paid.proposals, cv: total.cv.proposals },
    { key: "sales", label: "Продажі", color: "#38bdf8", n: total.sales, pn: paid.sales, cv: total.cv.sales },
  ] as { key: string; label: string; color: string; n: number; pn: number; cv?: [number, number] }[];
  return (
    <div className={dim ? "pt-4 border-t border-white/[0.05]" : ""}>
      <div className={`mb-2 text-sm font-semibold ${dim ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>{label}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {steps.map((s, i) => {
          const prev = i ? steps[i - 1] : null;
          const p = price(spend, s.pn);
          return (
            <div key={s.key} className={`relative rounded-xl border border-white/[0.06] p-3 overflow-hidden ${dim ? "bg-white/[0.01]" : "bg-white/[0.02]"}`}>
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: s.color, opacity: dim ? 0.55 : 1 }} />
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{s.label}</span>
                {prev && s.cv && <span className="text-[11px] tabular-nums text-[var(--text-dim)]" title={`з тих, хто став «${prev.label}» у цьому місяці, дійшли до «${s.label}»: ${s.cv[0]} з ${s.cv[1]}`}>{pctText(ratio(s.cv))}</span>}
              </div>
              <div className={`mt-1.5 text-2xl font-bold tabular-nums ${dim ? "text-[var(--text)]/80" : "text-[var(--text)]"}`}>{s.n}</div>
              <div className="mt-2 pt-2 border-t border-white/[0.05]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">ціна {s.key === "leads" ? "ліда" : s.key === "sales" ? "продажу" : s.label.toLowerCase().replace(/і$/, "ого").replace("кп", "КП")}</div>
                <div className="text-base font-semibold tabular-nums" style={{ color: p === null ? "var(--text-dim)" : s.color, opacity: dim && p !== null ? 0.85 : 1 }}>{uah(p)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// conversion by sources (+ campaigns of ad sources)
function SourcesTable({ data, picked, colorOf, spendOf, kind, sourcesSel }: {
  data: LeadsReportData; picked: ReportLead[]; colorOf: (s: string) => string; spendOf: (src: string, camp?: string | null) => number; kind: Kind; sourcesSel: Set<string>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // + ad sources that spent money but brought no leads (so the money is visible)
  const rng = { from: data.from, to: data.to };
  const touched = (l: ReportLead) => l.inR || [l.tD, l.qD, l.pD, l.wD].some((x) => !!x && x >= rng.from && x <= rng.to);
  const srcs = [...new Set([...picked.filter(touched).map((l) => l.src), ...(kind === "free" ? [] : data.adTypes.map((t) => t.name).filter((n) => spendOf(n) > 0 && (!sourcesSel.size || sourcesSel.has(n))))])];
  const rows = srcs.map((s) => {
    const ls = picked.filter((l) => l.src === s);
    const camps = [...new Set([...ls.filter((l) => touched(l) && l.camp).map((l) => l.camp!), ...data.spend.filter((x) => x.src === s && x.camp && x.uah > 0).map((x) => x.camp!)])]
      .map((c) => ({ name: c, c: countOf(ls.filter((l) => l.camp === c), rng), spend: spendOf(s, c) }))
      .sort((a, b) => b.c.leads - a.c.leads);
    const ad = data.adTypes.some((t) => t.name === s);
    return { s, c: countOf(ls, rng), spend: ad && kind !== "free" ? spendOf(s) : 0, ad, camps: camps.length > 1 || (camps.length === 1 && camps[0].name !== s) ? camps : [] };
  }).sort((a, b) => b.c.leads - a.c.leads);
  const tot = countOf(picked, rng);
  const anyAd = rows.some((r) => r.ad);
  const cols = `minmax(170px,1.3fr) repeat(10,minmax(70px,0.62fr))${anyAd ? " repeat(5,minmax(84px,0.7fr))" : ""}`;
  const toggle = (k: string) => setOpen((o) => { const x = new Set(o); if (x.has(k)) x.delete(k); else x.add(k); return x; });

  const line = (key: string, name: string, c: Counts, spend: number, opts: { depth?: number; total?: boolean; color?: string; expandable?: boolean; ad?: boolean }) => (
    <div key={key} className={`group grid gap-x-2.5 items-center px-2 py-2 transition-colors hover:bg-[#1b1b1f] ${opts.total ? "border-t border-white/[0.08] bg-[#141416] font-semibold" : "border-b border-white/[0.04]"}`} style={{ gridTemplateColumns: cols }}>
      {/* name stays on the left while the table scrolls sideways; the hovered row gets a gold bar */}
      <span className={`sticky left-0 z-[2] self-stretch -my-2 py-2 -ml-2 pl-2 pr-2 flex items-center gap-2 min-w-0 transition-colors shadow-[6px_0_10px_-6px_rgba(0,0,0,0.7)] group-hover:bg-[#1b1b1f] group-hover:shadow-[inset_3px_0_0_var(--accent),6px_0_10px_-6px_rgba(0,0,0,0.7)] ${opts.total ? "bg-[#141416]" : opts.depth ? "bg-[#121214]" : "bg-[#101011]"}`}>
        <span className="flex items-center gap-2 min-w-0" style={{ paddingLeft: (opts.depth ?? 0) * 20 }}>
        {opts.expandable ? (
          <button onClick={() => toggle(key)} className="w-4 h-4 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer shrink-0">{open.has(key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        ) : !opts.total && <span className="w-4 shrink-0" />}
        {!opts.total && <span className={`${opts.depth ? "w-1.5 h-1.5 rounded-full opacity-60" : "w-2.5 h-2.5 rounded-sm"} shrink-0`} style={{ background: opts.color }} />}
        <span className={`truncate ${opts.depth ? "text-[13px] text-[var(--text-muted)]" : "text-sm text-[var(--text)]"} group-hover:text-[var(--text)]`} title={name}>{name}</span>
        </span>
      </span>
      <N v={c.leads} strong />
      <N v={c.work} sub={pctText(pct(c.work, c.leads))} />
      <N v={c.targeted} sub={pctText(ratio(c.cv.targeted))} />
      <N v={c.qualified} sub={pctText(ratio(c.cv.qualified))} />
      <N v={c.proposals} sub={pctText(ratio(c.cv.proposals))} />
      <N v={c.lostTargeted} sub={pctText(pct(c.lostTargeted, c.leads))} tone="bad" />
      <N v={c.dup} sub={pctText(pct(c.dup, c.leads))} tone="bad" />
      <N v={c.notTarget} sub={pctText(pct(c.notTarget, c.leads))} tone="bad" />
      <N v={c.sales} strong tone="good" sub={pctText(ratio(c.cv.sales))} />
      <span className="text-right text-sm font-semibold tabular-nums" style={{ color: c.soldOfNew ? "#c4b5fd" : "var(--text-dim)" }} title={`${c.soldOfNew} з ${c.leads} лідів цього періоду вже купили`}>{pctText(pct(c.soldOfNew, c.leads))}</span>
      {anyAd && (opts.ad || opts.total ? (
        <>
          <M v={spend || null} />
          <M v={price(spend, c.leads)} /><M v={price(spend, c.targeted)} /><M v={price(spend, c.proposals)} /><M v={price(spend, c.sales)} strong />
        </>
      ) : <><M v={null} /><M v={null} /><M v={null} /><M v={null} /><M v={null} /></>)}
    </div>
  );
  const paid = picked.filter((l) => l.ad);
  const totSpend = rows.reduce((a, r) => a + r.spend, 0);
  const paidC = countOf(paid, rng);

  return (
    <Card icon={Radio} color="#22c55e" title="Конверсія по джерелах">
      {!rows.length ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">Немає лідів за цими налаштуваннями</div> : (
        <div className="overflow-x-auto -mx-1 px-1">
          <div style={{ minWidth: anyAd ? 1480 : 1060 }}>
            <div className="grid gap-x-2.5 px-2 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]" style={{ gridTemplateColumns: cols }}>
              <span className="sticky left-0 z-[2] -ml-2 pl-2 bg-[#101011]">Джерело</span>
              {["Нові ліди", "В роботі", "Цільові", "Кваліфік.", "КП", "Не продали", "Дублі", "Не ЦА", "Продажі", "Лід → продаж"].map((h) => <span key={h} className="text-right">{h}</span>)}
              {anyAd && ["Витрати", "Ціна ліда", "Ціна цільов.", "Ціна КП", "Ціна продажу"].map((h) => <span key={h} className="text-right text-[#fdba74]/70">{h}</span>)}
            </div>
            {rows.map((r) => (
              <Fragment key={r.s}>
                {line(r.s, r.s, r.c, r.spend, { color: colorOf(r.s), expandable: r.camps.length > 0, ad: r.ad })}
                {open.has(r.s) && r.camps.map((cm) => line(`${r.s}|${cm.name}`, cm.name, cm.c, cm.spend, { depth: 1, color: colorOf(r.s), ad: true }))}
              </Fragment>
            ))}
            {line("__t", "Разом", tot, 0, { total: true })}
            {anyAd && totSpend > 0 && line("__p", "Разом по рекламі", paidC, totSpend, { total: true })}
          </div>
        </div>
      )}
      <div className="mt-2 text-[10px] text-[var(--text-dim)]">Цільові, КП, продажі — скільки їх було в цьому періоді (за днем етапу). Під ними — % переходу з попереднього етапу. В роботі, не продали, дублі, не ЦА і «Лід → продаж» — про нових лідів цього періоду.</div>
    </Card>
  );
}

function ReasonsTable({ data, picked, colorOf }: { data: LeadsReportData; picked: ReportLead[]; colorOf: (s: string) => string }) {
  const cohort = picked.filter((l) => l.inR);
  const lost = cohort.filter((l) => l.k === "l");
  const label = (id: string | null) => (id ? data.reasons.find((r) => r.id === id)?.label ?? id : "Без причини");
  const ids = [...new Set(lost.map((l) => l.r))];
  const rows = ids.map((id) => {
    const ls = lost.filter((l) => l.r === id);
    const bySrc = new Map<string, number>();
    for (const l of ls) bySrc.set(l.src, (bySrc.get(l.src) ?? 0) + 1);
    return { id, n: ls.length, t: ls.filter((l) => l.tD).length, q: ls.filter((l) => l.qD).length, p: ls.filter((l) => l.pD).length, src: [...bySrc].sort((a, b) => b[1] - a[1]) };
  }).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const cols = "minmax(160px,1.2fr) minmax(130px,1.2fr) repeat(5,minmax(70px,0.6fr)) minmax(170px,1.5fr)";
  return (
    <Card icon={TrendingDown} color="#ef4444" title="Причини програшу" right={<span className="text-[11px] text-[var(--text-dim)] tabular-nums">програно {lost.length} з {cohort.length} · {pctText(pct(lost.length, cohort.length))}</span>}>
      {!rows.length ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">Програних лідів немає</div> : (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[940px]">
            <div className="grid gap-x-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]" style={{ gridTemplateColumns: cols }}>
              <span>Причина</span><span>Кількість</span>
              <span className="text-right">% усіх лідів</span><span className="text-right">% програшів</span><span className="text-right">Були цільові</span><span className="text-right">Кваліфік.</span><span className="text-right">Дійшли до КП</span>
              <span>Звідки</span>
            </div>
            {rows.map((r) => (
              <div key={r.id ?? "none"} className="grid gap-x-3 items-center px-2 py-2 border-b border-white/[0.04] last:border-0" style={{ gridTemplateColumns: cols }}>
                <span className="text-sm text-[var(--text)] truncate">{label(r.id)}</span>
                <span className="flex items-center gap-2">
                  <span className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden"><span className="block h-full rounded-full bg-[#ef4444]/80" style={{ width: `${(r.n / max) * 100}%` }} /></span>
                  <span className="w-7 text-right text-sm font-semibold tabular-nums text-[var(--text)]">{r.n}</span>
                </span>
                <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{pctText(pct(r.n, cohort.length))}</span>
                <span className="text-right text-sm tabular-nums text-[var(--text)]">{pctText(pct(r.n, lost.length))}</span>
                <N v={r.t} sub={pctText(pct(r.t, r.n))} />
                <N v={r.q} sub={pctText(pct(r.q, r.n))} />
                <N v={r.p} sub={pctText(pct(r.p, r.n))} />
                <span className="flex items-center gap-1 min-w-0 overflow-hidden">
                  {r.src.slice(0, 3).map(([s, n]) => (
                    <span key={s} className="shrink-0 max-w-[140px] truncate px-1.5 py-0.5 rounded-md text-[11px]" style={{ color: colorOf(s), background: `${colorOf(s)}18` }} title={s}>{s} · {n}</span>
                  ))}
                  {r.src.length > 3 && <span className="text-[11px] text-[var(--text-dim)]">+{r.src.length - 3}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function N({ v, sub, strong, tone }: { v: number; sub?: string; strong?: boolean; tone?: "good" | "bad" }) {
  const color = !v ? "var(--text-dim)" : tone === "good" ? "#4ade80" : tone === "bad" ? "#fca5a5" : "var(--text)";
  return (
    <span className="text-right leading-tight">
      <span className={`block text-sm tabular-nums ${strong && v ? "font-semibold" : ""}`} style={{ color }}>{v}</span>
      {sub && v > 0 && <span className="block text-[10px] tabular-nums text-[var(--text-dim)]">{sub}</span>}
    </span>
  );
}
function M({ v, strong }: { v: number | null; strong?: boolean }) {
  return <span className={`text-right text-sm tabular-nums ${strong && v !== null ? "font-semibold text-[#fdba74]" : v === null ? "text-[var(--text-dim)]" : "text-[var(--text)]"}`}>{uah(v)}</span>;
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`px-2.5 py-1.5 rounded-[10px] text-xs cursor-pointer transition-colors ${value === k ? "bg-[var(--accent)]/15 text-[var(--accent)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{l}</button>
      ))}
    </div>
  );
}

// dropdown with checkboxes — pick several, add / remove
function Multi({ label, icon: I, all, value, onChange }: { label: string; icon: typeof Radio; all: { id: string; label: string; color?: string }[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const flip = (id: string) => { const x = new Set(value); if (x.has(id)) x.delete(id); else x.add(id); onChange(x); };
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={`h-[34px] flex items-center gap-1.5 px-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${value.size ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
        <I size={13} />{label}
        {value.size > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-black bg-[var(--accent)]">{value.size}</span>}
        <ChevronDown size={12} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-64 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[#0f0f12]/98 backdrop-blur-xl shadow-2xl p-1.5">
          {all.map((o) => {
            const on = value.has(o.id);
            return (
              <button key={o.id} onClick={() => flip(o.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-white/[0.05] cursor-pointer">
                <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${on ? "bg-[var(--accent)] border-[var(--accent)] text-black" : "border-white/20"}`}>{on && <Check size={11} />}</span>
                {o.color && <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: o.color }} />}
                <span className="truncate text-[var(--text)]">{o.label}</span>
              </button>
            );
          })}
          {value.size > 0 && <button onClick={() => onChange(new Set())} className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04] cursor-pointer text-left">Очистити вибір</button>}
        </div>
      )}
    </div>
  );
}

// ‹ Листопад 2026 › — one month back / forward (not into the future)
function MonthSwitch({ value, onChange, max, dim }: { value: string; onChange: (m: string) => void; max: string; dim?: boolean }) {
  return (
    <div className={`h-[34px] flex items-center gap-0.5 p-0.5 rounded-xl border ${dim ? "border-[var(--border)] bg-[var(--surface-2)]" : "border-[var(--accent)]/35 bg-[var(--accent)]/[0.07]"}`}>
      <button onClick={() => onChange(shiftMonth(value, -1))} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Попередній місяць"><ChevronLeft size={14} /></button>
      <span className={`min-w-[112px] text-center text-[13px] font-semibold tabular-nums ${dim ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>{monthLabel(value)}</span>
      <button disabled={value >= max} onClick={() => onChange(shiftMonth(value, 1))} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer disabled:opacity-30 disabled:cursor-default" aria-label="Наступний місяць"><ChevronRight size={14} /></button>
    </div>
  );
}
