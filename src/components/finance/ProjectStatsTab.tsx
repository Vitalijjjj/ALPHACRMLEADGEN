"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Briefcase, Coins, Gauge, Hourglass, Layers, Trophy, TrendingUp } from "lucide-react";
import { fmtMoney, periodOf, projectTitle, shiftPeriod } from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";
import type { PeriodValue } from "@/components/finance/PeriodPicker";
import { useFx } from "@/lib/useFx";
import { usePnlShell } from "@/components/finance/pnlShell";
import TrendChart from "@/components/finance/TrendChart";
import { Card } from "@/components/finance/PnlHomeTab";

interface StatDeal {
  id: string; number: number; name: string; projectName: string | null; status: string; kind: "active" | "win" | "loss";
  amount: number | null; currency: string | null; createdAt: string; closedAt: string | null; enteredAt: string; stageMs: Record<string, number>;
}
interface StatsData { stages: { id: string; label: string; color: string; kind: string }[]; deals: StatDeal[] }

const DAY = 86_400_000;
const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const days = (ms: number) => {
  const d = ms / DAY;
  if (d < 1) { const h = Math.round(ms / 3_600_000); return h < 1 ? "< 1 год" : `${h} год`; }
  return `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)} дн.`;
};
const cnt = (v: number) => String(Math.round(v));

// «Проєкти» of the analytics page: deals of «Операційка» — pipeline by stages, time on stages, value, growth by month.
export default function ProjectStatsTab({ value, startDay, onPick }: { value: PeriodValue; startDay: number; onPick: (p: string) => void }) {
  const { fx } = useFx();
  const { openLead } = usePnlShell();
  const [now] = useState(() => Date.now());
  const q = useQuery({
    queryKey: ["project-stats"],
    queryFn: async (): Promise<StatsData> => {
      const res = await fetch("/api/finance/project-stats");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    staleTime: 30_000,
  });
  if (q.isLoading || !q.data) return <div className="py-16 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>;
  const { stages, deals } = q.data;
  const uah = (d: StatDeal) => (!d.amount ? 0 : d.currency === "UAH" || !d.currency ? d.amount : d.amount * (d.currency === "EUR" ? fx.eurUah : fx.usdUah));

  // does a date fall into the picked period (finance months, like the rest of the analytics page)
  const inV = (iso: string | null) => {
    if (!iso) return false;
    if (value.mode === "all") return true;
    if (value.mode === "period") return periodOf(new Date(iso), startDay) === value.p;
    const day = localDate(new Date(iso));
    return day >= value.from && day <= value.to;
  };
  const pKey = (iso: string) => periodOf(new Date(iso), startDay);

  const active = deals.filter((d) => d.kind === "active");
  const won = deals.filter((d) => d.kind === "win");
  const lost = deals.filter((d) => d.kind === "loss");
  const portfolio = active.reduce((s, d) => s + uah(d), 0);
  // the picked period
  const fresh = deals.filter((d) => inV(d.createdAt));
  const valued = fresh.filter((d) => d.amount);
  const avgValue = valued.length ? valued.reduce((s, d) => s + uah(d), 0) / valued.length : 0;
  const wonP = won.filter((d) => inV(d.closedAt));
  const lostP = lost.filter((d) => inV(d.closedAt));
  const cycles = wonP.map((d) => new Date(d.closedAt!).getTime() - new Date(d.createdAt).getTime());
  const avgCycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;
  const winRate = wonP.length + lostP.length ? wonP.length / (wonP.length + lostP.length) : null;
  // vs the previous month (only when one month is picked)
  const prevP = value.mode === "period" ? shiftPeriod(value.p, -1) : null;
  const prevN = prevP ? deals.filter((d) => pKey(d.createdAt) === prevP).length : 0;
  const growth = prevP && prevN ? (fresh.length - prevN) / prevN : null;

  // pipeline: active stages + win / loss
  const flow = stages.map((st) => {
    const here = deals.filter((d) => d.status === st.id);
    const times = deals.map((d) => d.stageMs[st.id]).filter((v): v is number => !!v);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const longest = here.filter((d) => d.kind === "active").map((d) => ({ d, ms: now - new Date(d.enteredAt).getTime() })).sort((a, b) => b.ms - a.ms)[0] ?? null;
    return { st, here, value: here.reduce((s, d) => s + uah(d), 0), avg, longest };
  });
  const maxHere = Math.max(1, ...flow.map((f) => f.here.length));
  const avgAll = flow.filter((f) => f.st.kind === "active" && f.avg).reduce((s, f) => s + (f.avg ?? 0), 0);

  // stuck: active deals by time on the current stage vs that stage's average
  const stuck = active
    .map((d) => {
      const ms = now - new Date(d.enteredAt).getTime();
      const f = flow.find((x) => x.st.id === d.status);
      return { d, ms, over: f?.avg ? ms / f.avg : null, stage: f?.st };
    })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6);

  // 12 finance months ending with the picked one (or the current one)
  const lastP = value.mode === "period" ? value.p : periodOf(new Date(now), startDay);
  const months = Array.from({ length: 12 }, (_, i) => {
    const k = shiftPeriod(lastP, i - 11);
    const [yy, mm] = k.split("-").map(Number);
    const born = deals.filter((x) => pKey(x.createdAt) === k);
    const bornV = born.filter((x) => x.amount);
    return {
      p: k, name: `${MONTHS_SHORT[mm - 1]} ${String(yy).slice(2)}`,
      fresh: born.length,
      won: won.filter((x) => x.closedAt && pKey(x.closedAt) === k).length,
      lost: lost.filter((x) => x.closedAt && pKey(x.closedAt) === k).length,
      check: bornV.length ? Math.round(bornV.reduce((s, x) => s + uah(x), 0) / bornV.length) : 0,
    };
  });
  const firstUsed = months.findIndex((m) => m.fresh || m.won || m.lost);
  const shown = firstUsed < 0 ? months.slice(-6) : months.slice(Math.min(firstUsed, 6));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Tile icon={Briefcase} color="#38bdf8" label="В роботі" value={String(active.length)} sub={`на ${fmtMoney(portfolio)}`} />
        <Tile icon={TrendingUp} color="#22c55e" label="Всього нових" value={String(fresh.length)}
          sub={growth === null ? (prevP ? `минулого місяця ${prevN}` : "за вибраний час") : <span style={{ color: growth >= 0 ? "#4ade80" : "#f87171" }}>{growth >= 0 ? "▲" : "▼"} {Math.round(Math.abs(growth) * 100)}% до минулого ({prevN})</span>} />
        <Tile icon={Coins} color="#C98C0A" label="Середня вартість" value={avgValue ? fmtMoney(avgValue) : "—"} sub={valued.length ? `з ${valued.length} нових із сумою` : "немає нових із сумою"} />
        <Tile icon={Trophy} color="#a855f7" label="Здано" value={String(wonP.length)} sub={winRate === null ? "немає закритих" : `${Math.round(winRate * 100)}% закритих успішно · програш ${lostP.length}`} />
        <Tile icon={Hourglass} color="#f472b6" label="Середній цикл" value={avgCycle ? days(avgCycle) : "—"} sub="від старту до здачі" />
        <Tile icon={Gauge} color="#fbbf24" label="Шлях по стадіях" value={avgAll ? days(avgAll) : "—"} sub="сума середніх часів стадій" />
      </div>

      <Card icon={Layers} color="#38bdf8" title="Де зараз проєкти · скільки часу на стадії">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[minmax(150px,1.1fr)_minmax(160px,1.4fr)_110px_110px_minmax(150px,1fr)] gap-x-4 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-white/[0.06]">
              <span>Стадія</span><span>Зараз</span><span className="text-right">Сума</span><span className="text-right">Сер. час</span><span>Найдовше зараз</span>
            </div>
            {flow.map(({ st, here, value, avg, longest }) => (
              <div key={st.id} className="grid grid-cols-[minmax(150px,1.1fr)_minmax(160px,1.4fr)_110px_110px_minmax(150px,1fr)] gap-x-4 items-center py-2.5 border-b border-white/[0.04] last:border-0">
                <span className="flex items-center gap-2 min-w-0 text-sm text-[var(--text)]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: st.color }} /><span className="truncate">{st.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(here.length / maxHere) * 100}%`, background: st.color, opacity: st.kind === "active" ? 0.9 : 0.5 }} />
                  </span>
                  <span className="w-6 text-right text-sm font-semibold tabular-nums text-[var(--text)]">{here.length}</span>
                </span>
                <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{value ? fmtMoney(value) : "—"}</span>
                <span className="text-right text-sm tabular-nums" style={{ color: avg ? "var(--text)" : "var(--text-dim)" }}>{st.kind === "active" && avg ? days(avg) : "—"}</span>
                <span className="min-w-0 text-xs">
                  {longest ? (
                    <button onClick={() => openLead(longest.d.id)} className="w-full flex items-center gap-1.5 text-left cursor-pointer hover:text-[var(--accent)] text-[var(--text-muted)]">
                      <span className="truncate">{projectTitle(longest.d)}</span>
                      <span className="shrink-0 tabular-nums text-[var(--text-dim)]">{days(longest.ms)}</span>
                    </button>
                  ) : <span className="text-[var(--text-dim)]">—</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 text-[10px] text-[var(--text-dim)]">Сер. час — скільки в середньому проєкти стояли на стадії (з історії змін стадій; проходження «одним стрибком» не враховано)</div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2.5">
        <Card icon={TrendingUp} color="#22c55e" title="Проєкти по місяцях">
          <TrendChart data={shown} onPick={onPick} storeKey="projects-chart-view" height={260} series={[
            { key: "fresh", label: "Нові", color: "#38bdf8", fmt: cnt },
            { key: "won", label: "Здано", color: "#22c55e", fmt: cnt },
            { key: "lost", label: "Програш", color: "#ef4444", fmt: cnt },
          ]} />
        </Card>
        <Card icon={AlarmClock} color="#fbbf24" title="Довго стоять на стадії">
          {!stuck.length && <div className="py-6 text-center text-xs text-[var(--text-dim)]">Проєктів у роботі немає</div>}
          <div className="space-y-1">
            {stuck.map(({ d, ms, over, stage }) => (
              <button key={d.id} onClick={() => openLead(d.id)} className="w-full flex items-center gap-2.5 px-2 py-2 -mx-2 rounded-lg text-left hover:bg-white/[0.03] cursor-pointer">
                <span className="w-1.5 self-stretch rounded-full" style={{ background: stage?.color ?? "#666" }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text)] truncate">{projectTitle(d)}</span>
                  <span className="block text-[11px] text-[var(--text-dim)] truncate">{stage?.label ?? "—"}{d.amount ? ` · ${fmtMoney(d.amount, d.currency ?? "EUR")}` : ""}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums" style={{ color: over && over > 1.5 ? "#f87171" : over && over > 1 ? "#fbbf24" : "var(--text)" }}>{days(ms)}</span>
                  {over && <span className="block text-[10px] tabular-nums text-[var(--text-dim)]">{over >= 1 ? `×${over.toFixed(1)} від середнього` : "в межах норми"}</span>}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card icon={Coins} color="#C98C0A" title="Середній чек нових проєктів по місяцях">
        <TrendChart data={shown} onPick={onPick} storeKey="projects-value-view" height={240} series={[
          { key: "check", label: "Середній чек", color: "#C98C0A" },
        ]} />
      </Card>
    </div>
  );
}

function Tile({ icon: I, color, label, value, sub }: { icon: typeof Coins; color: string; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
      </div>
      <div className="relative mt-3 text-2xl font-bold tabular-nums text-[var(--text)] truncate">{value}</div>
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}
