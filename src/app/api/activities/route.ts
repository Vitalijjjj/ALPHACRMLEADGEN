import { NextRequest, NextResponse } from "next/server";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  const { leadId, dealId, content } = await req.json();

  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });
  if (!leadId && !dealId) return NextResponse.json({ error: "leadId or dealId required" }, { status: 400 });
  if (leadId) {
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { funnelId: true } });
    if (lead && !canLead(access, accessSettings, lead.funnelId, "edit")) return forbidden("Немає права редагувати угоди цієї воронки");
  }

  const activity = await db.activity.create({
    data: { leadId, dealId, type: "NOTE", content },
  });

  return NextResponse.json(activity, { status: 201 });
}
