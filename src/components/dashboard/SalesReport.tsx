"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Euro, Hourglass, Radio, Receipt, Timer, Trophy, X, Zap } from "lucide-react";
import { fmtMoney } from "@/lib/finance";
import { Card } from "@/components/finance/PnlHomeTab";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import DashHeader from "@/components/dashboard/DashHeader";
import { sourceColor } from "@/lib/leadsReport";
import type { SaleRow, SalesData } from "@/lib/salesReport";

const DAY = 86_400_000;
const MONTHS_UA = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);
const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`; };
const eur = (v: number) => fmtMoney(v, "EUR");
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// «0 дн.», «2,5 дн.», «12 дн.»
const days = (v: number | null) => (v === null ? "—" : v < 1 ? "< 1 дн." : `${v < 10 ? (Math.round(v * 10) / 10).toString().replace(".", ",") : Math.round(v)} дн.`);

// the «closing window»: how many days from the request to the sale
const BUCKETS: { label: string; max: number; color: string }[] = [
  { label: "У той же день", max: 1, color: "#22c55e" },
  { label: "1–3 дні", max: 4, color: "#4ade80" },
  { label: "4–7 днів", max: 8, color: "#a3e635" },
  { label: "8–14 днів", max: 15, color: "#facc15" },
  { label: "15–30 днів", max: 31, color: "#fb923c" },
  { label: "31–60 днів", max: 61, color: "#f87171" },
  { label: "Понад 60 днів", max: Infinity, color: "#ef4444" },
];
const bucketOf = (d: number) => BUCKETS.findIndex((b) => d < b.max);

function rangeOf(v: PeriodValue, today: string) {
  if (v.mode === "all") return { from: "2020-01-01", to: today };
  if (v.mode === "range") return { from: v.from, to: v.to };
  const [y, m] = v.p.split("-").map(Number);
  const last = ymd(new Date(y, m, 0));
  return { from: `${v.p}-01`, to: last < today ? last : today };
}
function prevOf(v: PeriodValue, from: string, to: string) {
  if (v.mode === "all") return null;
  if (v.mode === "period") { const [y, m] = v.p.split("-").map(Number); const a = new Date(y, m - 2, 1); return { from: ymd(a), to: ymd(new Date(y, m - 1, 0)), label: MONTHS_UA[a.getMonth()] }; }
  const len = Math.round((parse(to).getTime() - parse(from).getTime()) / DAY) + 1;
  return { from: ymd(new Date(parse(from).getTime() - len * DAY)), to: ymd(new Date(parse(from).getTime() - DAY)), label: "Попередній" };
}
const load = (from: string, to: string) => async (): Promise<SalesData> => {
  const r = await fetch(`/api/dashboard/sales?from=${from}&to=${to}`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

// Дашборд → «Продажі»: sales on the day of the sale (a lead from September sold now = a sale of now),
// how long each one took to close, from which months the buyers came, by sources.
export default function SalesReport() {
  const [today] = useState(() => ymd(new Date()));
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: today.slice(0, 7) }));
  const [src, setSrc] = useState<string | null>(null);
  const [bucket, setBucket] = useState<number | null>(null);
  const { from, to } = rangeOf(period, today);
  const prev = prevOf(period, from, to);
  const q = useQuery({ queryKey: ["sales-report", from, to], queryFn: load(from, to), staleTime: 30_000, placeholderData: (p) => p });
  const qp = useQuery({ queryKey: ["sales-report", prev?.from, prev?.to], queryFn: load(prev?.from ?? "", prev?.to ?? ""), enabled: !!prev, staleTime: 30_000 });

  const header = <DashHeader tab="sales" right={<PeriodPicker value={period} onChange={(v) => { setPeriod(v); setBucket(null); }} startDay={1} align="right" />} />;
  if (!q.data) return <div className="p-3 sm:p-6 space-y-4 relative z-10">{header}<div className="py-16 text-center text-sm text-[var(--text-muted)]">{q.isError ? "Не вдалося завантажити" : "Завантаження…"}</div></div>;

  const data = q.data;
  const colorOf = (s: string) => sourceColor(s, data.adTypes);
  const all = data.sales.filter((s) => !src || s.src === src);
  const list = all.filter((s) => bucket === null || bucketOf(s.days) === bucket);
  const pAll = (qp.data?.sales ?? []).filter((s) => !src || s.src === src);
  const sum = (xs: SaleRow[]) => xs.reduce((a, s) => a + s.eur, 0);
  const priced = (xs: SaleRow[]) => xs.filter((s) => s.eur > 0);
  const check = (xs: SaleRow[]) => avg(priced(xs).map((s) => s.eur));
  const cyc = (xs: SaleRow[]) => avg(xs.map((s) => s.days));
  const kpc = (xs: SaleRow[]) => avg(xs.filter((s) => s.kpDays !== null).map((s) => s.kpDays!));
  const hasPrev = !!prev && !!qp.data;

  // from which month the buyers came (lead creation month vs the month of the sale)
  const mk = (iso: string) => iso.slice(0, 7);
  const cohorts = new Map<string, number>();
  for (const s of all) cohorts.set(mk(s.created), (cohorts.get(mk(s.created)) ?? 0) + 1);
  const cohortList = [...cohorts].sort((a, b) => b[0].localeCompare(a[0]));
  const maxCohort = Math.max(1, ...cohortList.map(([, n]) => n));

  // by sources
  const bySrc = [...new Set(data.sales.map((s) => s.src))].map((name) => {
    const xs = data.sales.filter((s) => s.src === name);
    return { name, n: xs.length, sum: sum(xs), check: check(xs), avg: cyc(xs), med: median(xs.map((s) => s.days)), min: Math.min(...xs.map((s) => s.days)), max: Math.max(...xs.map((s) => s.days)), kp: kpc(xs) };
  }).sort((a, b) => b.n - a.n || b.sum - a.sum);

  const hist = BUCKETS.map((b, i) => { const xs = all.filter((s) => bucketOf(s.days) === i); return { ...b, i, n: xs.length, sum: sum(xs) }; });
  const maxHist = Math.max(1, ...hist.map((h) => h.n));
  const pctOf = (n: number) => (all.length ? Math.round((n / all.length) * 100) : 0);
  const fast = all.filter((s) => s.days < 8).length;

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      {header}

      {src && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--text-dim)]">Показую тільки:</span>
          <span className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border" style={{ color: colorOf(src), borderColor: `${colorOf(src)}55`, background: `${colorOf(src)}14` }}>
            {src}<button onClick={() => setSrc(null)} className="p-0.5 rounded hover:bg-white/10 cursor-pointer"><X size={11} /></button>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Tile icon={Trophy} color="#22c55e" label="Продажі" value={String(all.length)} cur={all.length} prev={hasPrev ? pAll.length : null} prevLabel={prev?.label} prevText={String(pAll.length)} />
        <Tile icon={Euro} color="#C98C0A" label="Виручка" value={eur(sum(all))} cur={sum(all)} prev={hasPrev ? sum(pAll) : null} prevLabel={prev?.label} prevText={eur(sum(pAll))} />
        <Tile icon={Receipt} color="#f472b6" label="Середній чек" value={check(all) === null ? "—" : eur(check(all)!)} cur={check(all)} prev={hasPrev ? check(pAll) : null} prevLabel={prev?.label} prevText={check(pAll) === null ? "—" : eur(check(pAll)!)} />
        <Tile icon={Hourglass} color="#38bdf8" label="Середній цикл" value={days(cyc(all))} cur={cyc(all)} prev={hasPrev ? cyc(pAll) : null} prevLabel={prev?.label} prevText={days(cyc(pAll))} invert sub="від заявки до продажу" />
        <Tile icon={Timer} color="#a78bfa" label="Медіана циклу" value={days(median(all.map((s) => s.days)))} sub="половина закривається швидше" />
        <Tile icon={Zap} color="#fbbf24" label="Від КП до продажу" value={days(kpc(all))} cur={kpc(all)} prev={hasPrev ? kpc(pAll) : null} prevLabel={prev?.label} prevText={days(kpc(pAll))} invert />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2.5 items-stretch">
        {/* the closing window */}
        <Card icon={Hourglass} color="#38bdf8" title="Вікно закриття · за скільки днів закрились продажі"
          right={all.length ? <span className="text-[11px] text-[var(--text-dim)]">за тиждень закрились <b className="text-[var(--text)]">{pctOf(fast)}%</b></span> : undefined}>
          {!all.length ? <div className="py-10 text-center text-sm text-[var(--text-dim)]">За період продажів немає</div> : (
            <>
              <div className="flex items-end gap-2 h-[210px] pt-6">
                {hist.map((h) => {
                  const on = bucket === h.i, dim = bucket !== null && !on;
                  return (
                    <button key={h.label} onClick={() => setBucket(on ? null : h.i)} disabled={!h.n}
                      className={`group flex-1 h-full flex flex-col justify-end items-center gap-1.5 cursor-pointer disabled:cursor-default transition-opacity ${dim ? "opacity-35" : ""}`}
                      title={h.n ? `${h.n} продажів · ${eur(h.sum)} — клік: показати їх нижче` : undefined}>
                      <span className="text-sm font-bold tabular-nums" style={{ color: h.n ? "var(--text)" : "var(--text-dim)" }}>{h.n || ""}</span>
                      {h.n > 0 && <span className="text-[10px] tabular-nums text-[var(--text-dim)] -mt-1">{pctOf(h.n)}%</span>}
                      <span className={`w-full max-w-[70px] rounded-t-lg transition-all ${on ? "ring-2 ring-white/40" : "group-hover:brightness-125"}`}
                        style={{ height: `${h.n ? Math.max(6, (h.n / maxHist) * 140) : 3}px`, background: h.n ? `linear-gradient(to top, ${h.color}99, ${h.color})` : "rgba(255,255,255,0.06)" }} />
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2 pt-2 border-t border-white/[0.06]">
                {hist.map((h) => <span key={h.label} className="flex-1 text-center text-[11px] leading-tight text-[var(--text-muted)]">{h.label}</span>)}
              </div>
            </>
          )}
        </Card>

        {/* from which months the buyers came */}
        <Card icon={CalendarRange} color="#C98C0A" title="Коли прийшли ліди, які купили">
          {!cohortList.length ? <div className="py-10 text-center text-sm text-[var(--text-dim)]">—</div> : (
            <div className="space-y-2">
              {cohortList.map(([m, n]) => {
                const [y, mm] = m.split("-").map(Number);
                const same = m === from.slice(0, 7) && period.mode === "period";
                return (
                  <div key={m}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-[var(--text)]">{MONTHS_UA[mm - 1]} {y}{same && <span className="ml-1.5 text-[10px] text-[var(--text-dim)]">цього ж місяця</span>}</span>
                      <span className="font-semibold tabular-nums text-[var(--text)]">{n}</span>
                      <span className="w-10 text-right text-[11px] tabular-nums text-[var(--text-dim)]">{pctOf(n)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(n / maxCohort) * 100}%`, background: same ? "#C98C0A" : "#C98C0A88" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* by sources */}
      <Card icon={Radio} color="#22c55e" title="Продажі по джерелах">
        {!bySrc.length ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">За період продажів немає</div> : (
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[minmax(170px,1.4fr)_repeat(8,minmax(78px,0.7fr))] gap-x-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]">
                <span>Джерело</span>
                {["Продажі", "Виручка", "Сер. чек", "Сер. цикл", "Медіана", "Найшвидше", "Найдовше", "КП → продаж"].map((h) => <span key={h} className="text-right">{h}</span>)}
              </div>
              {bySrc.map((r) => {
                const on = src === r.name;
                return (
                  <button key={r.name} onClick={() => setSrc(on ? null : r.name)} title="Клік — показати тільки це джерело"
                    className={`w-full grid grid-cols-[minmax(170px,1.4fr)_repeat(8,minmax(78px,0.7fr))] gap-x-3 items-center px-2 py-2.5 text-left border-b border-white/[0.04] cursor-pointer transition-colors hover:bg-white/[0.03] ${on ? "bg-white/[0.05] shadow-[inset_3px_0_0_var(--accent)]" : ""} ${src && !on ? "opacity-45" : ""}`}>
                    <span className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorOf(r.name) }} /><span className="truncate text-sm text-[var(--text)]">{r.name}</span></span>
                    <span className="text-right text-sm font-semibold tabular-nums text-[#4ade80]">{r.n}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text)]">{eur(r.sum)}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{r.check === null ? "—" : eur(r.check)}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-[#7dd3fc]">{days(r.avg)}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{days(r.med)}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{days(r.min)}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{days(r.max)}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{days(r.kp)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* every sale */}
      <Card icon={Trophy} color="#22c55e" title={bucket === null ? "Усі продажі" : `Продажі · ${BUCKETS[bucket].label.toLowerCase()}`}
        right={bucket !== null ? <button onClick={() => setBucket(null)} className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><X size={12} />показати всі</button> : <span className="text-[11px] text-[var(--text-dim)] tabular-nums">{list.length}</span>}>
        {!list.length ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">Немає продажів</div> : (
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[76px_minmax(170px,1.6fr)_minmax(120px,1fr)_76px_76px_minmax(140px,1.3fr)_90px_96px] gap-x-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]">
                <span>Продаж</span><span>Угода</span><span>Джерело</span><span>Заявка</span><span>КП</span><span>Скільки йшла до продажу</span><span className="text-right">КП → продаж</span><span className="text-right">Сума</span>
              </div>
              {list.map((s) => {
                const b = BUCKETS[bucketOf(s.days)];
                const maxD = Math.max(30, ...list.map((x) => x.days));
                return (
                  <Link key={s.id} href={`/leads/${s.n}`} className="grid grid-cols-[76px_minmax(170px,1.6fr)_minmax(120px,1fr)_76px_76px_minmax(140px,1.3fr)_90px_96px] gap-x-3 items-center px-2 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <span className="text-sm tabular-nums text-[var(--text)]">{fmtDate(s.sold)}</span>
                    <span className="min-w-0"><span className="text-[11px] text-[var(--text-dim)] tabular-nums mr-1.5">#{s.n}</span><span className="text-sm text-[var(--text)] truncate">{s.name}</span></span>
                    <span className="flex items-center gap-1.5 min-w-0 text-sm text-[var(--text-muted)]"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: colorOf(s.src) }} /><span className="truncate" title={s.camp ?? undefined}>{s.src}{s.camp ? ` · ${s.camp}` : ""}</span></span>
                    <span className="text-[13px] tabular-nums text-[var(--text-muted)]">{fmtDate(s.created)}</span>
                    <span className="text-[13px] tabular-nums text-[var(--text-muted)]">{s.kp ? fmtDate(s.kp) : "—"}</span>
                    <span className="flex items-center gap-2">
                      <span className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(3, (s.days / maxD) * 100)}%`, background: b.color }} /></span>
                      <span className="w-16 text-right text-sm font-semibold tabular-nums" style={{ color: b.color }}>{days(s.days)}</span>
                    </span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{days(s.kpDays)}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-[var(--text)]">{s.eur ? eur(s.eur) : "—"}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ icon: I, color, label, value, sub, cur, prev, prevLabel, prevText, invert }: {
  icon: typeof Trophy; color: string; label: string; value: string; sub?: string;
  cur?: number | null; prev?: number | null; prevLabel?: string; prevText?: string; invert?: boolean;
}) {
  const d = cur !== undefined && cur !== null && prev ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  const good = d === null ? null : invert ? d < 0 : d > 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
      </div>
      <div className="relative mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-[var(--text)] truncate">{value}</span>
        {d !== null && Math.abs(d) >= 0.5 && <span className="text-[11px] font-semibold tabular-nums" style={{ color: good ? "#4ade80" : "#f87171" }}>{d > 0 ? "▲" : "▼"} {Math.min(999, Math.round(Math.abs(d)))}%</span>}
      </div>
      {prev !== undefined && prev !== null && prevLabel && <div className="relative mt-1 text-[11px] text-[var(--text-muted)] truncate">{prevLabel}: <span className="tabular-nums text-[var(--text)]/80">{prevText}</span></div>}
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}
