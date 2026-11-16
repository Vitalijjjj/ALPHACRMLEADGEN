"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PnlHomeTab from "@/components/finance/PnlHomeTab";
import DashHeader from "@/components/dashboard/DashHeader";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import { useFinance } from "@/components/finance/useFinance";
import { periodOf } from "@/lib/finance";
import { useAccess } from "@/lib/useAccess";
import { canPage } from "@/lib/access";

// Дашборд → «Фінансовий огляд»: money of a month — turnover, profit, plan / fact, debts, accounts.
export default function FinanceOverviewPage() {
  const { access } = useAccess();
  const router = useRouter();
  const { fin } = useFinance();
  const startDay = fin.monthStartDay;
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: periodOf(new Date(), startDay) }));
  return (
    <div className="space-y-4">
      <DashHeader tab="finance" right={<PeriodPicker value={period} onChange={setPeriod} startDay={startDay} align="right" />} />
      <PnlHomeTab value={period} onPick={(p) => setPeriod({ mode: "period", p })} canEdit={canPage(access, "pnl")} onOpenProjects={() => router.push("/projects")} />
    </div>
  );
}
