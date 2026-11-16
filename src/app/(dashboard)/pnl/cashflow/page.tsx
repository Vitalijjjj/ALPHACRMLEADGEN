"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CashflowTab from "@/components/finance/CashflowTab";
import { usePnlShell } from "@/components/finance/pnlShell";

function Cashflow() {
  const { openLead } = usePnlShell();
  const view = useSearchParams().get("view");
  return <CashflowTab onOpenLead={openLead} mode={view === "transfers" ? "transfers" : "cash"} />;
}

export default function PnlCashflowPage() {
  return <Suspense><Cashflow /></Suspense>;
}
