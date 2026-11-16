import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getCrmSettings, funnelWhere } from "@/lib/crmSettingsServer";

// Move several leads to another funnel (and a stage of that funnel).
// Body: { ids: string[] | fromFunnelId: string, funnelId: string, status: string }
export async function POST(req: NextRequest) {
  const gate = await requireAccess("settings");
  if ("error" in gate) return gate.error;

  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
    const from = typeof body.fromFunnelId === "string" ? body.fromFunnelId : null;
    if (!ids.length && !from) return NextResponse.json({ error: "ids or fromFunnelId required" }, { status: 400 });

    await ensureSchema();
    const settings = await getCrmSettings();
    const funnel = settings.funnels.find((f) => f.id === body.funnelId);
    if (!funnel) return NextResponse.json({ error: "Unknown funnel" }, { status: 400 });
    if (from && !settings.funnels.some((f) => f.id === from)) return NextResponse.json({ error: "Unknown source funnel" }, { status: 400 });
    const stage = funnel.stages.find((s) => s.id === body.status) ?? funnel.stages.find((s) => s.kind === "active")!;

    const leads = await db.lead.findMany({ where: from ? funnelWhere(settings, from) : { id: { in: ids } }, select: { id: true, status: true } });
    const closing = stage.kind !== "active";
    await db.$transaction([
      db.lead.updateMany({
        where: { id: { in: leads.map((l) => l.id) } },
        data: {
          funnelId: funnel.id,
          status: stage.id,
          ...(closing ? { closedAt: new Date() } : { closedAt: null, closeReason: null }),
        },
      }),
      db.activity.createMany({
        data: leads.map((l) => ({ leadId: l.id, type: "NOTE" as const, content: `Перенесено у воронку «${funnel.name}»` })),
      }),
      db.activity.createMany({
        data: leads
          .filter((l) => l.status !== stage.id)
          .map((l) => ({ leadId: l.id, type: "STATUS_CHANGE" as const, content: `Статус змінено: ${l.status} → ${stage.id}` })),
      }),
    ]);

    return NextResponse.json({ moved: leads.length });
  } catch (e) {
    console.error("POST /api/leads/transfer:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
