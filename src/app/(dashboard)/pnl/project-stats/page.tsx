"use client";

import { useState } from "react";
import ProjectStatsTab from "@/components/finance/ProjectStatsTab";
import DashHeader from "@/components/dashboard/DashHeader";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import { useFinance } from "@/components/finance/useFinance";
import { periodOf } from "@/lib/finance";

// Дашборд → «Проєкти»: deals of «Операційка» — stages, time on stages, value, growth by month.
export default function ProjectStatsPage() {
  const { fin } = useFinance();
  const startDay = fin.monthStartDay;
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: periodOf(new Date(), startDay) }));
  return (
    <div className="space-y-4">
      <DashHeader tab="projects" right={<PeriodPicker value={period} onChange={setPeriod} startDay={startDay} align="right" />} />
      <ProjectStatsTab value={period} startDay={startDay} onPick={(p) => setPeriod({ mode: "period", p })} />
    </div>
  );
}
