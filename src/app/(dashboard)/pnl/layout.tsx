"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import LeadDrawer from "@/components/leads/LeadDrawer";
import { pnlSection } from "@/components/finance/pnlNav";
import { PnlShellCtx } from "@/components/finance/pnlShell";


// «P&L» group: one header for every section + a deal drawer any section can open.
export default function PnlLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const s = pnlSection(path);
  const Icon = s.icon;
  const ledger = s.href === "/pnl/cashflow"; // working sheets — title only
  // the page draws its own header (title + buttons); the «Дашборд» reports — always
  const own = ["/pnl", "/pnl/overview", "/pnl/project-stats"].includes(path) || ["/pnl/accounts", "/pnl/schedule", "/pnl/team", "/pnl/subscriptions"].includes(s.href);
  const [leadId, setLeadId] = useState<string | null>(null);
  return (
    <PnlShellCtx.Provider value={{ openLead: setLeadId }}>
      <div className="p-3 sm:p-6 space-y-4">
        {!own && <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><Icon size={17} /></div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text)] leading-tight">{!ledger && <span className="text-[var(--text-dim)] font-normal">P&amp;L · </span>}{s.label}</h1>
            {!ledger && <p className="text-xs text-[var(--text-muted)]">{s.hint}</p>}
          </div>
        </div>}
        {children}
      </div>
      {leadId && <LeadDrawer key={leadId} leadId={leadId} onClose={() => setLeadId(null)} onUpdate={() => {}} onOpenLead={setLeadId} />}
    </PnlShellCtx.Provider>
  );
}
