import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAccess } from "@/lib/accessServer";
import { db } from "@/lib/db";
import { getAdSettings, saveAdSettings } from "@/lib/adTypesServer";
import { normalizeAdSettings } from "@/lib/adTypes";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getAdSettings());
}

// Save the list of traffic types; a renamed type carries its campaigns over ({ rename: { from, to } }).
export async function PUT(req: NextRequest) {
  const gate = await requireAccess("ads");
  if ("error" in gate) return gate.error;
  const body = await req.json();
  const next = normalizeAdSettings(body);
  const prev = await getAdSettings();
  const r = body?.rename as { from?: string; to?: string } | undefined;
  if (r?.from && r?.to && r.from !== r.to) {
    await db.adCampaign.updateMany({ where: { trafficType: r.from }, data: { trafficType: r.to } });
  }
  // a type that still has campaigns can't disappear
  for (const t of prev.types) {
    if (next.types.some((x) => x.name === t.name) || (r?.from === t.name && r?.to)) continue;
    const n = await db.adCampaign.count({ where: { trafficType: t.name } });
    if (n) return NextResponse.json({ error: `У типі «${t.name}» є кампанії (${n}) — спершу видали або перенеси їх` }, { status: 400 });
  }
  return NextResponse.json(await saveAdSettings(next));
}
