import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { resolveStage } from "@/lib/crmSettings";

// Lead counts per funnel and stage — the settings page uses it to warn before deleting a stage/funnel.
// Response: { [funnelId]: { total, stages: { [stageId]: n }, unknown: { [rawStatus]: n } } }
// «unknown» = leads whose status is not a stage of their funnel (deleted stage, very old code like CLOSE).
export async function GET() {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;

  try {
    const settings = await getCrmSettings();
    const groups = await db.lead.groupBy({ by: ["funnelId", "status"], _count: { _all: true } });
    const out: Record<string, { total: number; stages: Record<string, number>; unknown: Record<string, number> }> = {};
    for (const g of groups) {
      const { funnel, stage } = resolveStage(settings, { status: g.status, funnelId: g.funnelId });
      const entry = (out[funnel.id] ??= { total: 0, stages: {}, unknown: {} });
      entry.total += g._count._all;
      if (funnel.stages.some((s) => s.id === stage.id)) entry.stages[stage.id] = (entry.stages[stage.id] ?? 0) + g._count._all;
      else entry.unknown[g.status] = (entry.unknown[g.status] ?? 0) + g._count._all;
    }
    return NextResponse.json(out);
  } catch (e) {
    console.error("GET /api/settings/stats:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
