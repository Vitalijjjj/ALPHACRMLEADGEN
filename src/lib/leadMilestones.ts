import { getFunnel, resolveStage, WIN_ID, type CrmSettings } from "@/lib/crmSettings";
import { canonicalStage, replayStages, type StageLog } from "@/lib/stageFlow";
import { statusMatchValues, TARGETED_STATUSES } from "@/lib/leadOptions";

// When a lead reached each step of the sales funnel (from the stage history; jumps pass the stages in between).
// Every step is counted on ITS day: targeted — the day it became targeted, КП — the day of the КП, sale — the day of the sale.
export interface Milestones {
  tAt: Date | null; // became targeted (цільовий)
  qAt: Date | null; // «Кваліфіковано»
  pAt: Date | null; // commercial proposal (КП)
  wAt: Date | null; // sale (the day the deal was won)
  kind: "active" | "win" | "loss";
  stageId: string;
}

const TARGETED = new Set(TARGETED_STATUSES.map(canonicalStage));
const QUALIFIED = new Set(statusMatchValues("QUALIFIED").map(canonicalStage));
const PROPOSAL = new Set(statusMatchValues("PROPOSAL").map(canonicalStage));

export function milestones(
  crm: CrmSettings,
  lead: { status: string; funnelId: string | null; closeReason?: string | null; createdAt: Date; closedAt: Date | null; activities: StageLog[] },
): Milestones {
  const r = replayStages(getFunnel(crm, lead.funnelId), lead.status, lead.activities, lead.createdAt);
  const first = (set: Set<string>) => {
    let best: number | null = null;
    for (const id of r.visited) if (set.has(id)) { const t = r.at.get(id); if (t !== undefined && (best === null || t < best)) best = t; }
    return best === null ? null : new Date(best);
  };
  const { stage } = resolveStage(crm, lead);
  const wAt = stage.kind === "win" ? lead.closedAt ?? (r.at.has(WIN_ID) ? new Date(r.at.get(WIN_ID)!) : lead.createdAt) : null;
  // a won lead was targeted / got a КП at the latest on the day of the sale
  const cap = (d: Date | null) => (d && wAt && d > wAt ? wAt : d);
  return { tAt: cap(first(TARGETED)), qAt: cap(first(QUALIFIED)), pAt: cap(first(PROPOSAL)), wAt, kind: stage.kind, stageId: stage.id };
}
