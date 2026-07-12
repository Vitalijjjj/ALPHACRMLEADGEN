import Link from "next/link";
import { Megaphone } from "lucide-react";
import { AD_TRAFFIC_ACCENT } from "@/lib/leadOptions";
import type { CampaignStatsResult, CampaignStatRow } from "@/lib/adStats";
import { CARD } from "@/components/dashboard/DashboardCharts";

function money(v: number | null, digits = 2): string {
  if (v == null) return "—";
  return `€${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
}

const num = "px-3 py-2.5 text-right tabular-nums";

function Cells({ r, muted }: { r: Pick<CampaignStatRow, "leads" | "targeted" | "proposals" | "won" | "spent" | "costPerLead" | "costPerProposal" | "costPerSale">; muted?: boolean }) {
  return (
    <>
      <td className={`${num} font-semibold`} style={{ color: muted ? "var(--text)" : "var(--text)" }}>{r.leads}</td>
      <td className={num} style={{ color: "#22c55e" }}>{r.targeted}</td>
      <td className={num} style={{ color: "#a78bfa" }}>{r.proposals}</td>
      <td className={num} style={{ color: "#22d3ee" }}>{r.won}</td>
      <td className={num} style={{ color: "var(--accent)" }}>{money(r.spent, 0)}</td>
      <td className={`${num} text-[var(--text-muted)]`}>{money(r.costPerLead)}</td>
      <td className={`${num} text-[var(--text-muted)]`}>{money(r.costPerProposal)}</td>
      <td className={`${num} text-[var(--text-muted)]`}>{money(r.costPerSale)}</td>
      <td className={`${num} text-[var(--text-muted)]`}>
        {r.leads > 0 ? `${Math.round((r.won / r.leads) * 100)}%` : "—"}
      </td>
    </>
  );
}

export default function CampaignStatsTable({ stats }: { stats: CampaignStatsResult }) {
  return (
    <div style={CARD} className="overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Рекламні кампанії</p>
          <p className="text-xs text-[var(--text-muted)]">
            Ліди та витрати за період {stats.periodLabel}
          </p>
        </div>
        <Link
          href="/ads"
          className="text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ color: "var(--accent)", textShadow: "0 0 10px var(--accent-glow)" }}
        >
          Керувати →
        </Link>
      </div>

      {stats.groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Megaphone size={18} className="text-[var(--text-dim)]" />
          <p className="text-sm text-[var(--text-muted)]">За цей період немає лідів з рекламних кампаній</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <th className="text-left font-medium px-5 py-2.5">Кампанія</th>
                <th className="text-right font-medium px-3 py-2.5">Ліди</th>
                <th className="text-right font-medium px-3 py-2.5">Цільові</th>
                <th className="text-right font-medium px-3 py-2.5">КП</th>
                <th className="text-right font-medium px-3 py-2.5">Продажі</th>
                <th className="text-right font-medium px-3 py-2.5">Відкручено</th>
                <th className="text-right font-medium px-3 py-2.5">Ціна ліда</th>
                <th className="text-right font-medium px-3 py-2.5">Ціна КП</th>
                <th className="text-right font-medium px-3 py-2.5">Ціна продажу</th>
                <th className="text-right font-medium px-3 py-2.5">Конв. в продаж</th>
              </tr>
            </thead>
            <tbody>
              {stats.groups.map((g) => {
                const accent = AD_TRAFFIC_ACCENT[g.type] ?? "#C98C0A";
                return [
                  /* ── Група: тип трафіку з підсумком ── */
                  <tr key={g.type} style={{ background: `${accent}0a`, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-5 py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-semibold border"
                        style={{ color: accent, borderColor: `${accent}40`, background: `${accent}14` }}
                      >
                        {g.type}
                      </span>
                    </td>
                    <Cells r={g.totals} />
                  </tr>,
                  /* ── Кампанії всередині типу ── */
                  ...g.rows.map((r) => (
                    <tr
                      key={r.key}
                      className="hover:bg-white/[0.02] transition-colors"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2 pl-4">
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ background: r.isFallback ? "var(--text-dim)" : accent }} />
                          <span className={r.isFallback ? "text-[var(--text-muted)] italic" : "text-[var(--text)]"}>
                            {r.name}
                          </span>
                          {!r.isFallback && (
                            <span className="text-[10px] text-[var(--text-dim)] whitespace-nowrap">
                              {r.budgetLabel}{!r.active && " · вимкнена"}
                            </span>
                          )}
                        </div>
                      </td>
                      <Cells r={r} />
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
