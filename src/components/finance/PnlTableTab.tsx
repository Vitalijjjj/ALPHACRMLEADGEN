"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { fmtMoney, txPeriod } from "@/lib/finance";
import { pnlSplit, usePnlData, type PnlSplit } from "@/components/finance/pnlData";

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const OPEN_KEY = "pnl-collapsed";

type Kind = "revenue" | "minus" | "total" | "pct" | "result" | "muted" | "left";
type RowDef = { key: string; label: string; get: (s: PnlSplit) => number | null; kind: Kind; hint?: string; group?: "var" | "fix"; parent?: string };

// parent rows (total / result) fold their child rows; «Змінні» / «Постійні» unfold whom the money went to
const ROWS: RowDef[] = [
  { key: "rev", label: "Виручка", get: (s) => s.turnover, kind: "revenue", hint: "Загальний оборот — усі надходження за місяць" },
  { key: "avg", label: "Середній чек", get: (s) => s.avgCheck, kind: "muted", parent: "rev", hint: "Оплати по проєктах ÷ кількість проєктів, які платили в цьому місяці" },
  { key: "var", label: "Змінні витрати", get: (s) => s.variable, kind: "minus", group: "var", hint: "Підрядники, команда, реклама, витрати проєктів" },
  { key: "gross", label: "Валовий дохід", get: (s) => s.gross, kind: "total", hint: "Виручка − змінні витрати" },
  { key: "gm", label: "Валова маржинальність", get: (s) => (s.turnover ? s.gross / s.turnover : null), kind: "pct", parent: "gross" },
  { key: "fix", label: "Постійні витрати", get: (s) => s.fixed, kind: "minus", group: "fix", hint: "Підписки, сервер, зв'язок, бухгалтер, банк" },
  { key: "ebitda", label: "EBITDA", get: (s) => s.ebitda, kind: "total", hint: "Валовий дохід − постійні витрати" },
  { key: "tax", label: "Податки", get: (s) => s.tax, kind: "minus", hint: "До листопада 2026 — нараховані, з листопада — реальні операції" },
  { key: "tax6", label: "Податок 6%", get: (s) => s.tax6, kind: "minus", parent: "tax" },
  { key: "esv", label: "ЄСВ", get: (s) => s.esv, kind: "minus", parent: "tax" },
  { key: "otax", label: "Єдиний + військовий", get: (s) => s.otherTax, kind: "minus", parent: "tax" },
  { key: "net", label: "Чистий дохід", get: (s) => s.net, kind: "result", hint: "EBITDA − податки" },
  { key: "ros", label: "Рентабельність бізнесу", get: (s) => (s.turnover ? s.net / s.turnover : null), kind: "pct", parent: "net" },
  { key: "div", label: "Дивіденди", get: (s) => s.owner, kind: "minus" },
  { key: "left", label: "Залишилось на рахунках", get: (s) => s.net - s.owner, kind: "left", hint: "Чистий дохід − дивіденди" },
];
const HAS_KIDS = new Set(ROWS.filter((r) => r.parent).map((r) => r.parent!));

// «P&L» of a year: Виручка → змінні → валовий → постійні → EBITDA → податки → чистий → дивіденди.
export default function PnlTableTab({ year }: { year: number }) {
  const d = usePnlData();
  const { fin, first, nowP } = d;
  // folded rows (remembered); «var» / «fix» start folded, other parents start open
  const [closed, setClosed] = useState<Set<string>>(new Set(["var", "fix"]));
  useEffect(() => {
    try {
      const v = localStorage.getItem(OPEN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remembered folds
      if (v) setClosed(new Set(JSON.parse(v) as string[]));
    } catch { /* ignore */ }
  }, []);
  const toggle = (k: string) => setClosed((o) => {
    const n = new Set(o);
    if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  const periods = MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const cols = periods.map((p, i) => {
    const txs = d.inPeriod(p);
    const empty = p > nowP || !first || p < first || !txs.length;
    return { p, i, empty, s: pnlSplit(txs, fin, [p], first, nowP) };
  });
  const yearTxs = d.txs.filter((x) => periods.includes(txPeriod(x, fin.monthStartDay)));
  const sum = pnlSplit(yearTxs, fin, periods, first, nowP);

  const groupKeys = (g: "var" | "fix") => [...(g === "var" ? sum.varBy : sum.fixBy).entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const visible = ROWS.filter((r) => !r.parent || !closed.has(r.parent));

  const cell = (v: number | null, kind: Kind, sub = false) => {
    if (v === null || (v === 0 && kind !== "result" && kind !== "left")) return <span className="text-[var(--text-dim)]/50">—</span>;
    if (kind === "pct") return <span style={{ color: v >= 0.5 ? "#4ade80" : v >= 0.2 ? "#fbbf24" : "#f87171" }}>{Math.round(v * 100)}%</span>;
    if (kind === "minus") return <span className={sub ? "text-[var(--text-dim)]" : "text-[var(--text-muted)]"}>−{fmtMoney(v)}</span>;
    if (kind === "revenue") return <span className="font-semibold text-[#4ade80]">{fmtMoney(v)}</span>;
    if (kind === "result") return <span className="font-bold" style={{ color: v >= 0 ? "#C98C0A" : "#f87171" }}>{fmtMoney(v)}</span>;
    if (kind === "left") return <span className="font-semibold" style={{ color: v >= 0 ? "#38bdf8" : "#f87171" }}>{fmtMoney(v)}</span>;
    if (kind === "muted") return <span className="text-[var(--text-muted)]">{fmtMoney(v)}</span>;
    return <span className={`font-semibold ${v < 0 ? "text-[#f87171]" : "text-[var(--text)]"}`}>{fmtMoney(v)}</span>;
  };

  if (d.loading) return <div className="py-16 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>;

  const LW = 270, TW = 150, MW = 128, NW = 46;
  const minW = LW + TW + cols.reduce((s, c) => s + (c.empty ? NW : MW), 0);
  const rowBg = (k: Kind) => (k === "result" ? "bg-[#C98C0A]/[0.06]" : k === "revenue" ? "bg-[#22c55e]/[0.04]" : "");
  const stickyBg = (k: Kind) => (k === "result" ? "bg-[#16130b]" : k === "revenue" ? "bg-[#0e1510]" : "bg-[var(--surface)]");
  const totalBg = "bg-[#141416]";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-separate border-spacing-0 table-fixed" style={{ minWidth: minW }}>
            <colgroup>
              <col style={{ width: LW }} />
              <col style={{ width: TW }} />
              {cols.map((c) => <col key={c.p} style={{ width: c.empty ? NW : undefined }} />)}
            </colgroup>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">
                <th className="sticky left-0 z-20 bg-[var(--surface)] text-left font-medium py-3.5 pl-5 pr-3 border-b border-[var(--border)]">Стаття</th>
                <th className={`sticky z-20 ${totalBg} text-right font-semibold py-3.5 pr-4 text-[var(--text-muted)] border-b border-r border-[var(--border)]`} style={{ left: LW }}>Разом {year}</th>
                {cols.map((c) => (
                  <th key={c.p} title={MONTHS[c.i]} className={`font-medium py-3.5 border-b border-[var(--border)] ${c.empty ? "text-center px-0 opacity-45 normal-case" : "text-right pr-4"} ${c.p === nowP ? "text-[var(--accent)]" : ""}`}>
                    {c.empty ? MONTHS_SHORT[c.i] : MONTHS[c.i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const kids = HAS_KIDS.has(r.key) || !!r.group;
                const isOpen = !closed.has(r.key);
                const strong = r.kind === "result" || r.kind === "total" || r.kind === "revenue" || r.kind === "left" || r.key === "tax";
                const sep = !r.parent && (r.kind === "total" || r.kind === "result" || r.key === "tax" || r.key === "div");
                const border = `border-b ${sep ? "border-t border-t-white/[0.08]" : ""} border-white/[0.045]`;
                const subKeys = r.group ? groupKeys(r.group) : [];
                return (
                  <Fragment key={r.key}>
                    <tr className={`${rowBg(r.kind)} hover:bg-white/[0.025]`}>
                      <td className={`sticky left-0 z-10 ${stickyBg(r.kind)} py-3 pr-3 ${border} ${r.parent ? "pl-11 text-[13px] text-[var(--text-muted)]" : "pl-5"} ${strong ? "font-semibold text-[var(--text)]" : r.parent ? "" : "text-[var(--text-muted)]"}`} title={r.hint}>
                        {kids ? (
                          <button onClick={() => toggle(r.key)} className="inline-flex items-center gap-1.5 cursor-pointer hover:text-[var(--text)] -ml-5">
                            <ChevronRight size={14} className={`text-[var(--text-dim)] transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
                            {r.label}
                            {r.group && <span className="text-[11px] text-[var(--text-dim)] font-normal">{subKeys.length}</span>}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1">{r.label}{r.hint && !r.parent && <Info size={11} className="text-[var(--text-dim)] cursor-help" />}</span>
                        )}
                      </td>
                      <td className={`sticky z-10 ${totalBg} py-3 pr-4 text-right ${border} border-r border-r-[var(--border)]`} style={{ left: LW }}>{cell(r.get(sum), r.kind)}</td>
                      {cols.map((c) => (
                        <td key={c.p} className={`py-3 ${c.empty ? "px-0 text-center" : "pr-4 text-right"} ${border}`}>
                          {c.empty ? <span className="text-[var(--text-dim)]/30">·</span> : cell(r.get(c.s), r.kind)}
                        </td>
                      ))}
                    </tr>
                    {r.group && isOpen && subKeys.map((k) => {
                      const by = (s: PnlSplit) => (r.group === "var" ? s.varBy : s.fixBy).get(k) ?? 0;
                      return (
                        <tr key={`${r.key}:${k}`} className="hover:bg-white/[0.02]">
                          <td className="sticky left-0 z-10 bg-[var(--surface)] py-2 pl-11 pr-3 border-b border-white/[0.03] text-[13px] text-[var(--text-muted)] truncate" title={k}>{k}</td>
                          <td className={`sticky z-10 ${totalBg} py-2 pr-4 text-right text-[13px] border-b border-white/[0.03] border-r border-r-[var(--border)]`} style={{ left: LW }}>{cell(by(sum), "minus", true)}</td>
                          {cols.map((c) => <td key={c.p} className={`py-2 text-[13px] border-b border-white/[0.03] ${c.empty ? "" : "pr-4 text-right"}`}>{c.empty ? "" : cell(by(c.s), "minus", true)}</td>)}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] text-[11px] text-[var(--text-dim)]">
          Місяць — з {fin.monthStartDay}-го по {fin.monthStartDay}-те. Клік по стрілці — згорнути / розгорнути рядки. Постійні витрати — «Підписки / ПЗ», «Зв&apos;язок», «Бухгалтерія», «Офіс / техніка», «Банк / комісії» без проєкту; решта — змінні.
        </div>
      </div>

    </div>
  );
}
