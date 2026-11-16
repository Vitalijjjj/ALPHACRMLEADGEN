"use client";

import { useMemo } from "react";
import { ADS_CAT, FIXED_CATS, TAX6_CAT, firstPeriod, fixedMonthsIn, periodOf, projectTitle, periodsBetween, projectMoney, totals, txPeriod, txTax, type FinanceSettings, type PeriodTotals, type ProjectMoney, type TxLike } from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";
import type { PeriodValue } from "@/components/finance/PeriodPicker";
import { useFx } from "@/lib/useFx";
import { useDeals, useFinance, useProjects, useTransactions, type DealRow, type ProjectRow, type TxRow } from "@/components/finance/useFinance";

export const ALL = "all";

export interface ProjectStat extends ProjectMoney {
  key: string;                 // deal id · "p:<sheet project id>" · "none"
  type: "deal" | "sheet" | "none";
  deal: DealRow | null;        // the «Операційка» deal (a real project)
  project: ProjectRow | null;  // sheet project not linked to a deal yet
  sheetNames: string[];        // sheet projects linked to this deal
  name: string;
  value: number;               // вартість, ₴
  valueCur: number;            // вартість у валюті договору
  currency: string;
  left: number;                // залишилось отримати, ₴
  contractProfit: number | null;
  margin: number | null;
  lastDate: string | null;
}

// Everything the P&L pages need: settings, the whole journal, projects (deals), periods.
export function usePnlData() {
  const { fin, loaded, save } = useFinance();
  const { fx } = useFx();
  const txQ = useTransactions();
  const projectsQ = useProjects();
  const dealsQ = useDeals();
  const txs = useMemo(() => txQ.data ?? [], [txQ.data]);
  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const deals = useMemo(() => dealsQ.data ?? [], [dealsQ.data]);
  const nowP = periodOf(new Date(), fin.monthStartDay);
  const first = firstPeriod(txs, fin.monthStartDay);
  const periods = first ? periodsBetween(first, nowP) : [nowP];
  const toUah = (v: number, cur: string | null | undefined) => (!cur || cur === "UAH" ? v : v * (cur === "EUR" ? fx.eurUah : fx.usdUah));
  return {
    fin, save, fx, txs, projects, deals, nowP, first, periods, toUah,
    loading: txQ.isLoading || projectsQ.isLoading || dealsQ.isLoading || !loaded,
    inPeriod: (p: string) => (p === ALL ? txs : txs.filter((t) => txPeriod(t, fin.monthStartDay) === p)),
    // operations of a picker value (finance month · all time · any dates) + the finance months it touches
    inValue: (v: PeriodValue) => txs.filter((t) => {
      if (v.mode === "all") return true;
      if (v.mode === "period") return txPeriod(t, fin.monthStartDay) === v.p;
      const day = localDate(new Date(t.date));
      return day >= v.from && day <= v.to;
    }),
    periodsOf: (v: PeriodValue): string[] => {
      if (v.mode === "period") return [v.p];
      if (v.mode === "all") return periods;
      const a = periodOf(new Date(`${v.from}T12:00`), fin.monthStartDay), b = periodOf(new Date(`${v.to}T12:00`), fin.monthStartDay);
      return periodsBetween(a, b < a ? a : b);
    },
  };
}

// ── P&L breakdown: виручка → змінні → валовий → постійні → EBITDA → податки → чистий ──
export interface PnlSplit {
  t: PeriodTotals;
  turnover: number;
  variable: number;
  gross: number;
  fixed: number;
  ebitda: number;
  tax6: number;
  esv: number;
  otherTax: number;
  tax: number;
  net: number;
  owner: number;
  ads: number;
  avgCheck: number | null;
  projects: number;
  varBy: Map<string, number>;
  fixBy: Map<string, number>;
}
const onProject = (t: TxLike) => !!(t.leadId || t.projectId);
export const isFixedCost = (t: TxLike) => t.kind === "expense" && !onProject(t) && !!t.category && FIXED_CATS.includes(t.category);
// whom / what a cost row is about (for the drill-down)
function costKey(t: TxLike & { counterparty?: string | null }): string {
  if (t.category === ADS_CAT) return "Реклама";
  if (t.kind === "contractor") return t.counterparty || "Підрядники";
  if (isFixedCost(t)) return t.counterparty || t.category || "Інше";
  if (t.category === "Команда / зарплата") return t.counterparty || "Команда";
  if (onProject(t)) return t.counterparty || t.category || "Витрати проєктів";
  return t.category || "Без категорії";
}
export function pnlSplit(txs: (TxLike & { counterparty?: string | null })[], fin: FinanceSettings, periods: string[], first: string | null, nowP: string): PnlSplit {
  const months = fixedMonthsIn(periods, first, nowP, fin.taxRealFrom);
  const t = totals(txs, fin, months);
  const varBy = new Map<string, number>(), fixBy = new Map<string, number>();
  let variable = 0, fixed = 0, ads = 0, esvReal = 0, otherReal = 0, real6 = 0;
  const paid = new Set<string>();
  let projIncome = 0;
  for (const x of txs) {
    if (x.kind === "income" && onProject(x)) { projIncome += x.amountUah; paid.add(x.leadId ?? x.projectId!); }
    if (x.kind === "contractor" || x.kind === "expense") {
      const k = costKey(x);
      if (x.category === ADS_CAT) ads += x.amountUah;
      if (isFixedCost(x)) { fixed += x.amountUah; fixBy.set(k, (fixBy.get(k) ?? 0) + x.amountUah); }
      else { variable += x.amountUah; varBy.set(k, (varBy.get(k) ?? 0) + x.amountUah); }
    }
    if (x.kind === "tax" && txPeriod(x, fin.monthStartDay) >= fin.taxRealFrom) {
      if (x.category === TAX6_CAT) real6 += x.amountUah;
      else if (x.category === "ЄСВ") esvReal += x.amountUah;
      else otherReal += x.amountUah;
    }
  }
  // fixed taxes of the months before they became real operations — accrued
  const accrued = Math.max(0, months);
  const tax6 = txs.reduce((s, x) => s + txTax(x, fin), 0) + real6;
  const esv = fin.taxes.esv * fin.taxes.fops * accrued + esvReal;
  const otherTax = (fin.taxes.single + fin.taxes.military) * accrued + otherReal;
  const tax = tax6 + esv + otherTax;
  const turnover = t.income;
  const gross = turnover - variable;
  const ebitda = gross - fixed;
  return {
    t, turnover, variable, gross, fixed, ebitda, tax6, esv, otherTax, tax, net: ebitda - tax, owner: t.owner, ads,
    avgCheck: paid.size ? projIncome / paid.size : null, projects: paid.size, varBy, fixBy,
  };
}

// Project table: every «Операційка» deal + sheet projects not linked yet + money without a project.
export function projectStats(deals: DealRow[], projects: ProjectRow[], txs: TxRow[], fin: FinanceSettings, toUah: (v: number, c: string | null | undefined) => number): ProjectStat[] {
  const byKey = new Map<string, TxRow[]>();
  for (const t of txs) {
    if (t.kind !== "income" && t.kind !== "contractor" && t.kind !== "expense") continue;
    const k = t.leadId ?? (t.projectId ? `p:${t.projectId}` : "none");
    if (k === "none" && t.kind === "expense") continue; // studio overhead → only in P&L
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const make = (key: string, type: ProjectStat["type"], name: string, valueCur: number, currency: string, deal: DealRow | null, project: ProjectRow | null): ProjectStat => {
    const list = byKey.get(key) ?? [];
    const m = projectMoney(list, fin);
    const value = toUah(valueCur, currency);
    const contractProfit = value > 0 ? value - m.costs - m.tax : null;
    // debt in the contract currency (rate changes are not debt); ≤2% leftovers are rate noise
    const paidCur = list.filter((t) => t.kind === "income").reduce((s, t) => s + (t.currency === currency ? t.amount : t.amountUah / toUah(1, currency)), 0);
    const leftCur = valueCur - paidCur;
    return {
      ...m, key, type, deal, project, name, value, valueCur, currency,
      sheetNames: deal ? projects.filter((p) => p.leadId === deal.id).map((p) => p.name) : [],
      left: leftCur > valueCur * 0.02 ? toUah(leftCur, currency) : 0,
      contractProfit,
      margin: contractProfit !== null && value > 0 ? contractProfit / value : null,
      lastDate: list.reduce<string | null>((d, t) => (!d || t.date > d ? t.date : d), null),
    };
  };
  const rows: ProjectStat[] = deals.map((d) => {
    const linked = projects.filter((p) => p.leadId === d.id);
    const name = projectTitle(d, linked[0]?.name);
    // a deal without its own amount takes the value of the linked sheet project
    const sheet = linked.find((p) => p.value);
    return d.amount
      ? make(d.id, "deal", name, d.amount, d.currency ?? "EUR", d, null)
      : make(d.id, "deal", name, sheet?.value ?? 0, sheet?.currency ?? "UAH", d, null);
  });
  const dealIds = new Set(deals.map((d) => d.id));
  for (const p of projects) if (!p.leadId || !dealIds.has(p.leadId)) rows.push(make(`p:${p.id}`, "sheet", p.name, p.value ?? 0, p.currency, null, p));
  if (byKey.has("none")) rows.unshift(make("none", "none", "— Без проєкту —", 0, "UAH", null, null));
  return rows;
}

export const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`);
