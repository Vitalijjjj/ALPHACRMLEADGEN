"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PnlTableTab from "@/components/finance/PnlTableTab";
import DashHeader from "@/components/dashboard/DashHeader";
import { useFinance } from "@/components/finance/useFinance";
import { periodOf } from "@/lib/finance";

// Дашборд → «P&L»: the month-by-month table of a year.
export default function PnlTablePage() {
  const { fin } = useFinance();
  const [year, setYear] = useState(() => Number(periodOf(new Date(), fin.monthStartDay).slice(0, 4)));
  const thisYear = new Date().getFullYear();
  return (
    <div className="space-y-4">
      <DashHeader tab="pnl" right={
        <div className="h-[38px] flex items-center gap-0.5 p-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <button onClick={() => setYear(year - 1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Попередній рік"><ChevronLeft size={15} /></button>
          <span className="px-3 text-sm font-semibold tabular-nums text-[var(--text)]">{year} рік</span>
          <button disabled={year >= thisYear} onClick={() => setYear(year + 1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer disabled:opacity-30 disabled:cursor-default" aria-label="Наступний рік"><ChevronRight size={15} /></button>
        </div>
      } />
      <PnlTableTab year={year} />
    </div>
  );
}
