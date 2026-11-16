import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getAdSettings } from "@/lib/adTypesServer";
import { findType } from "@/lib/adTypes";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess("ads");
  if ("error" in gate) return gate.error;

  const { id } = await params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.trafficType !== undefined) {
      const type = findType(await getAdSettings(), body.trafficType)?.name;
      if (type) data.trafficType = type;
    }
    if (body.dailyBudget !== undefined) data.dailyBudget = body.dailyBudget === "" || body.dailyBudget === null ? null : parseFloat(String(body.dailyBudget));
    if (body.totalBudget !== undefined) data.totalBudget = body.totalBudget === "" || body.totalBudget === null ? null : parseFloat(String(body.totalBudget));
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.active !== undefined) data.active = !!body.active;

    await ensureSchema();
    const campaign = await db.adCampaign.update({ where: { id }, data });
    return NextResponse.json(campaign);
  } catch (e) {
    console.error("PATCH /api/ad-campaigns/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess("ads");
  if ("error" in gate) return gate.error;

  const { id } = await params;

  try {
    await ensureSchema();
    const campaign = await db.adCampaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ ok: true });

    // Відв'язуємо кампанію від лідів (sourceDetail → null), інакше автосинк
    // одразу створить її заново з тих самих лідів.
    await db.lead.updateMany({
      where: {
        source: { equals: campaign.trafficType, mode: "insensitive" },
        sourceDetail: { equals: campaign.name.trim(), mode: "insensitive" },
      },
      data: { sourceDetail: null },
    });
    await db.adCampaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/ad-campaigns/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
