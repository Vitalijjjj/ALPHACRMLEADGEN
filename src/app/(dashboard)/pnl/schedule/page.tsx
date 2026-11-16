"use client";

import ScheduleTab from "@/components/finance/ScheduleTab";
import { usePnlShell } from "@/components/finance/pnlShell";

export default function PnlSchedulePage() {
  const { openLead } = usePnlShell();
  return <ScheduleTab onOpenLead={openLead} />;
}
