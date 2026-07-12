import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { normalizeTrafficType } from "@/lib/leadOptions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.trafficType !== undefined) {
      const type = normalizeTrafficType(body.trafficType);
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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await ensureSchema();
    await db.adCampaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/ad-campaigns/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
