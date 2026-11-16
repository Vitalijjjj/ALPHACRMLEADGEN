"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Briefcase, ChevronDown, ChevronRight, Coins, Gauge, Handshake, Inbox, Sparkles, TrendingUp, Trophy, Users, Wallet } from "lucide-react";
import DashHeader from "@/components/dashboard/DashHeader";
import PeriodPicker, { valueLabel, type PeriodValue } from "@/components/finance/PeriodPicker";
import TrendChart from "@/components/finance/TrendChart";
import { Card } from "@/components/finance/PnlHomeTab";
import { PrivacyButton } from "@/components/ui/Privacy";
import { periodOf } from "@/lib/finance";

interface Partner { id: string; number: number; name: string; created: string; kind: string | null; fee: string | null; niche: string | null; geo: string | null; stage: { label: string; color: string; kind: string }; active: boolean }
interface PLead { id: string; number: number; name: string; partnerId: string; created: string; closed: string | null; k: "a" | "w" | "l"; stage: { label: string; color: string }; eur: number; project: { id: string; number: number; title: string; stage: { label: string; color: string } } | null }
interface Data { partners: Partner[]; leads: PLead[] }

const eur = (v: number) => `€${Math.round(v).toLocaleString("uk-UA").replace(/\s/g, " ")}`;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const fmtD = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(2, 4)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function rangeOf(v: PeriodValue): { from: string; to: string } | null {
  if (v.mode === "all") return null;
  if (v.mode === "range") return { from: v.from, to: v.to };
  const [y, m] = v.p.split("-").map(Number);
  return { from: `${v.p}-01`, to: ymd(new Date(y, m, 0)) };
}
const nameOf = (p: { name: string; number: number }) => p.name?.trim() || `Партнер #${p.number}`;

type SortKey = "all" | "period" | "won" | "revenue" | "check";

// Дашборд → «Партнери»: who brings leads, how many, which projects, at what check — for a month or all the time.
export default function PartnersReport() {
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: periodOf(new Date(), 1) }));
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("all");
  const [onlyActive, setOnlyActive] = useState(false);
  const q = useQuery({
    queryKey: ["partners-report"],
    queryFn: async (): Promise<Data> => { const r = await fetch("/api/dashboard/partners"); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    staleTime: 60_000,
  });
  const r = rangeOf(period);
  const inR = (d: string | null) => !!d && (!r || (d >= r.from && d <= r.to));
  const all = period.mode === "all";
  const label = all ? "за весь час" : period.mode === "range" ? valueLabel(period) : `за ${valueLabel(period).toLowerCase()}`;

  const calc = useMemo(() => {
    const d = q.data;
    if (!d) return null;
    const byP = new Map<string, PLead[]>();
    for (const l of d.leads) byP.set(l.partnerId, [...(byP.get(l.partnerId) ?? []), l]);
    const leadsP = d.leads.filter((l) => inR(l.created));
    const wonP = d.leads.filter((l) => l.k === "w" && inR(l.closed));
    const revenue = wonP.reduce((a, l) => a + l.eur, 0);
    const priced = wonP.filter((l) => l.eur > 0);
    const activeN = d.partners.filter((p) => p.active).length;
    const givers = new Set(leadsP.map((l) => l.partnerId)).size;
    const rows = d.partners.map((p) => {
      const ls = (byP.get(p.id) ?? []).sort((a, b) => b.created.localeCompare(a.created));
      const won = ls.filter((l) => l.k === "w");
      const wonRev = won.reduce((a, l) => a + l.eur, 0);
      const pricedW = won.filter((l) => l.eur > 0);
      // months since the partner appeared — «лідів на місяць»
      const months = Math.max(1, Math.round((Date.parse(new Date().toDateString()) - Date.parse(p.created)) / (30.4 * 86_400_000)));
      return {
        p, leads: ls, all: ls.length, period: ls.filter((l) => inR(l.created)).length,
        won: won.length, wonPeriod: won.filter((l) => inR(l.closed)).length, revenue: wonRev,
        check: pricedW.length ? wonRev / pricedW.length : 0, perMonth: ls.length / months,
        projects: ls.filter((l) => l.project).length, last: ls[0]?.created ?? null,
      };
    });
    return { leadsP, wonP, revenue, check: priced.length ? revenue / priced.length : 0, activeN, givers, rows, newP: d.partners.filter((p) => inR(p.created)).length, total: d.leads.length };
  }, [q.data, r?.from, r?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // 12 months up to the picked one: leads from partners and sales
  const chart = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const end = r ? new Date(`${r.to}T00:00`) : new Date();
    const out: { p: string; name: string; leads: number; sales: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(end.getFullYear(), end.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      out.push({ p: key, name: `${SHORT[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`, leads: d.leads.filter((l) => l.created.startsWith(key)).length, sales: d.leads.filter((l) => l.k === "w" && l.closed?.startsWith(key)).length });
    }
    const first = out.findIndex((x) => x.leads || x.sales);
    return first < 0 ? out.slice(-6) : out.slice(Math.min(first, 6));
  }, [q.data, r?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <DashHeader tab="partners" right={<><PrivacyButton /><PeriodPicker value={period} onChange={setPeriod} startDay={1} align="right" /></>} />;
  if (!calc) return <div className="p-3 sm:p-6 space-y-4 relative z-10">{header}<div className="py-16 text-center text-sm text-[var(--text-muted)]">{q.isError ? "Не вдалося завантажити" : "Завантаження…"}</div></div>;

  const sorted = calc.rows
    .filter((x) => !onlyActive || x.p.active)
    .sort((a, b) => (sort === "period" ? b.period - a.period : sort === "won" ? b.won - a.won : sort === "revenue" ? b.revenue - a.revenue : sort === "check" ? b.check - a.check : 0) || b.all - a.all || b.revenue - a.revenue);
  const avgPerActive = calc.activeN ? calc.leadsP.length / calc.activeN : 0;
  const th = (k: SortKey, text: string) => (
    <th className="py-2.5 pr-4 text-right font-medium">
      <button onClick={() => setSort(k)} className={`inline-flex items-center gap-1 cursor-pointer hover:text-[var(--text)] ${sort === k ? "text-[var(--accent)]" : ""}`}>{text}{sort === k && <ArrowDownUp size={10} />}</button>
    </th>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      {header}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Tile icon={Handshake} color="#2dd4bf" label="Активних партнерів" value={String(calc.activeN)} sub={`з ${q.data!.partners.length} усього`} />
        <Tile icon={Sparkles} color="#a78bfa" label="Нових партнерів" value={String(calc.newP)} sub={label} />
        <Tile icon={Inbox} color="#38bdf8" label="Лідів від партнерів" value={String(calc.leadsP.length)} sub={label} />
        <Tile icon={Users} color="#f472b6" label="Партнерів передали" value={String(calc.givers)} sub={`хоча б 1 лід ${label}`} />
        <Tile icon={Trophy} color="#4ade80" label="Продажів" value={String(calc.wonP.length)} sub={`конверсія ${pct(calc.leadsP.filter((l) => l.k === "w").length, calc.leadsP.length)}`} />
        <Tile icon={Coins} color="#F5B530" label="Оборот" value={eur(calc.revenue)} sub={label} money />
        <Tile icon={Wallet} color="#facc15" label="Середній чек" value={calc.check ? eur(calc.check) : "—"} sub="продажів від партнерів" money />
        <Tile icon={Gauge} color="#fb923c" label="Лідів на партнера" value={avgPerActive ? avgPerActive.toFixed(1).replace(".0", "") : "—"} sub={`на активного ${label}`} />
      </div>

      <Card icon={TrendingUp} color="#38bdf8" title="Ліди й продажі від партнерів по місяцях">
        <TrendChart data={chart} height={220} storeKey="partners-chart-view" defaultView="bars" showChange={false} series={[
          { key: "leads", label: "Ліди", color: "#38bdf8", fmt: (v: number) => String(Math.round(v)) },
          { key: "sales", label: "Продажі", color: "#4ade80", fmt: (v: number) => String(Math.round(v)) },
        ]} />
      </Card>

      <Card icon={Handshake} color="#2dd4bf" title="Партнери" right={
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-[var(--accent)] cursor-pointer" /> лише активні
        </label>
      }>
        {!sorted.length ? <div className="py-8 text-center text-xs text-[var(--text-dim)]">Партнерів ще немає — додай їх у воронку «Партнери»</div> : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.05]">
                  <th className="py-2.5 pl-4 pr-4 text-left font-medium">Партнер</th>
                  <th className="py-2.5 pr-4 text-left font-medium">Стадія</th>
                  {th("period", all ? "Лідів" : "Лідів за період")}
                  {th("all", "Лідів усього")}
                  {th("won", "Продажів")}
                  <th className="py-2.5 pr-4 text-right font-medium">Конверсія</th>
                  {th("revenue", "Оборот")}
                  {th("check", "Сер. чек")}
                  <th className="py-2.5 pr-4 text-right font-medium">Лідів / міс.</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Останній лід</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((x) => {
                  const isOpen = open === x.p.id;
                  return (
                    <Fragment key={x.p.id}>
                      <tr onClick={() => setOpen(isOpen ? null : x.p.id)} className="border-b border-white/[0.04] hover:bg-white/[0.025] cursor-pointer">
                        <td className="py-2 pl-4 pr-4">
                          <div className="flex items-center gap-2">
                            {x.all ? (isOpen ? <ChevronDown size={13} className="text-[var(--text-dim)]" /> : <ChevronRight size={13} className="text-[var(--text-dim)]" />) : <span className="w-[13px]" />}
                            <div className="min-w-0">
                              <Link href={`/leads/${x.p.number}`} onClick={(e) => e.stopPropagation()} data-private="name" className="font-medium text-[var(--text)] hover:text-[var(--accent)] truncate block max-w-[240px]">{nameOf(x.p)}</Link>
                              <div className="text-[11px] text-[var(--text-dim)] truncate">{[x.p.kind, x.p.niche, x.p.fee && `винагорода: ${x.p.fee}`].filter(Boolean).join(" · ") || "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium" style={{ color: x.p.stage.color, background: `${x.p.stage.color}1a` }}>{x.p.stage.label}</span></td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold" style={{ color: x.period ? "#38bdf8" : "var(--text-dim)" }}>{x.period || "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-[var(--text)]">{x.all || "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums" style={{ color: x.won ? "#4ade80" : "var(--text-dim)" }}>{x.won || "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">{pct(x.won, x.all)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold" data-private="amount" style={{ color: x.revenue ? "#F5B530" : "var(--text-dim)" }}>{x.revenue ? eur(x.revenue) : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]" data-private="amount">{x.check ? eur(x.check) : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">{x.all ? x.perMonth.toFixed(1).replace(".0", "") : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-dim)]">{x.last ? fmtD(x.last) : "—"}</td>
                      </tr>
                      {isOpen && x.leads.length > 0 && (
                        <tr className="bg-white/[0.015] border-b border-white/[0.04]">
                          <td colSpan={10} className="px-4 py-2.5">
                            <div className="space-y-1">
                              {x.leads.map((l) => (
                                <div key={l.id} className="flex items-center gap-3 text-xs pl-6">
                                  <Link href={`/leads/${l.number}`} className="tabular-nums text-[var(--text-dim)] hover:text-[var(--accent)] w-12">#{l.number}</Link>
                                  <Link href={`/leads/${l.number}`} data-private="name" className="flex-1 min-w-0 truncate text-[var(--text)] hover:text-[var(--accent)]">{l.name || `Лід #${l.number}`}</Link>
                                  <span className="w-20 text-[var(--text-dim)] tabular-nums">{fmtD(l.created)}</span>
                                  <span className="w-40 truncate" style={{ color: l.stage.color }}>{l.stage.label}</span>
                                  <span className="w-56 truncate">
                                    {l.project ? <Link href={`/leads/${l.project.number}`} className="inline-flex items-center gap-1 hover:underline" style={{ color: l.project.stage.color }}><Briefcase size={11} />{l.project.title} · {l.project.stage.label}</Link> : <span className="text-[var(--text-dim)]">—</span>}
                                  </span>
                                  <span className="w-20 text-right tabular-nums" data-private="amount" style={{ color: l.k === "w" ? "#F5B530" : "var(--text-muted)" }}>{l.eur ? eur(l.eur) : "—"}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-[11px] text-[var(--text-dim)]">Лід рахується за партнером, якщо в картці ліда вказано «Від партнера» — або його створили кнопкою «Додати ліда» в картці партнера. Продаж — за датою виграшу, чек — сума угоди.</div>
      </Card>
    </div>
  );
}

function Tile({ icon: I, color, label, value, sub, money }: { icon: typeof Trophy; color: string; label: string; value: string; sub?: string; money?: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="flex-1 min-w-0 text-[11px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
      </div>
      <div className="relative mt-3 text-2xl font-bold tabular-nums text-[var(--text)]" data-private={money ? "amount" : undefined}>{value}</div>
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}
