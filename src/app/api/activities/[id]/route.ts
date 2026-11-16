import { NextRequest, NextResponse } from "next/server";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { db } from "@/lib/db";

// Edit / pin a comment of a deal (only NOTE records).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings } = gate;
  const { id } = await params;
  const a = await db.activity.findUnique({ where: { id }, select: { type: true, lead: { select: { funnelId: true } } } });
  if (!a || a.type !== "NOTE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (a.lead && !canLead(access, settings, a.lead.funnelId, "edit")) return forbidden("Немає права редагувати угоди цієї воронки");

  const body = await req.json();
  const data: { content?: string; editedAt?: Date; pinned?: boolean } = {};
  if (typeof body.content === "string") {
    if (!body.content.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });
    data.content = body.content.trim();
    data.editedAt = new Date();
  }
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  const updated = await db.activity.update({ where: { id }, data });
  return NextResponse.json(updated);
}
