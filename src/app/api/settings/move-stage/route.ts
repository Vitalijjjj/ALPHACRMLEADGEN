import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db } from "@/lib/db";
import { getCrmSettings, funnelWhere } from "@/lib/crmSettingsServer";
import { statusMatchValues } from "@/lib/leadOptions";

// Move all leads of a funnel from one stage to another (used before deleting a stage).
// Body: { funnelId, from, to }
export async function POST(req: NextRequest) {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;

  try {
    const { funnelId, from, to } = await req.json();
    if (typeof funnelId !== "string" || typeof from !== "string" || typeof to !== "string" || !from || !to) {
      return NextResponse.json({ error: "funnelId, from, to are required" }, { status: 400 });
    }
    const settings = await getCrmSettings();
    const res = await db.lead.updateMany({
      // also old codes that are shown on this stage (e.g. THINKING on «Комерційна пропозиція»)
      where: { AND: [funnelWhere(settings, funnelId), { status: { in: statusMatchValues(from) } }] },
      data: { status: to },
    });
    return NextResponse.json({ moved: res.count });
  } catch (e) {
    console.error("POST /api/settings/move-stage:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
