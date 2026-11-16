"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEALS_KEY, PROJECTS_KEY, SCHEDULE_KEY, TX_KEY } from "@/components/finance/useFinance";
import LeadDrawer from "@/components/leads/LeadDrawer";
import dynamic from "next/dynamic";

// remembered view / filters live in this browser → render on the client only
const ProjectsTab = dynamic(() => import("@/components/finance/ProjectsTab"), { ssr: false });
import { useAccess } from "@/lib/useAccess";
import { canPage } from "@/lib/access";

// «Проєкти» (under CRM): deals of «Операційка» — list or kanban, a click opens the deal card.
export default function ProjectsPage() {
  const { access } = useAccess();
  const [leadId, setLeadId] = useState<string | null>(null);
  const qc = useQueryClient();
  // the card may change the name, stage, payments → fresh list after closing
  const close = () => { setLeadId(null); for (const k of [DEALS_KEY, PROJECTS_KEY, TX_KEY, SCHEDULE_KEY]) qc.invalidateQueries({ queryKey: k }); };
  return (
    <div className="p-3 sm:p-6">
      <ProjectsTab canEdit={canPage(access, "pnl")} onOpenLead={setLeadId} />
      {leadId && <LeadDrawer key={leadId} leadId={leadId} onClose={close} onUpdate={() => {}} onOpenLead={setLeadId} />}
    </div>
  );
}
