import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";
import { normalizeTrafficType } from "@/lib/leadOptions";
import { syncCampaignsFromLeads } from "@/lib/adStats";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await ensureSchema();
    await syncCampaignsFromLeads();
    const campaigns = await db.adCampaign.findMany({
      orderBy: [{ trafficType: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(campaigns);
  } catch (e) {
    console.error("GET /api/ad-campaigns:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const trafficType = normalizeTrafficType(body.trafficType) ?? "Таргет";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    await ensureSchema();
    const campaign = await db.adCampaign.create({
      data: {
        name,
        trafficType,
        dailyBudget: body.dailyBudget != null && body.dailyBudget !== "" ? parseFloat(String(body.dailyBudget)) : null,
        totalBudget: body.totalBudget != null && body.totalBudget !== "" ? parseFloat(String(body.totalBudget)) : null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        active: body.active !== undefined ? !!body.active : true,
      },
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (e) {
    console.error("POST /api/ad-campaigns:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
