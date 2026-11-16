import { NextRequest, NextResponse } from "next/server";
import { canLead, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema, lastLeadNumber } from "@/lib/db";

// /leads/5 → which lead is #5. Answers { id } or { deleted: true } (number was used, lead removed) or { missing: true }.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const n = parseInt((await params).number, 10);
  if (!Number.isFinite(n) || n < 1) return NextResponse.json({ missing: true }, { status: 404 });

  await ensureSchema();
  const lead = await db.lead.findUnique({ where: { number: n }, select: { id: true, funnelId: true } });
  if (lead && canLead(gate.access, gate.settings, lead.funnelId, "view")) return NextResponse.json({ id: lead.id });
  if (lead) return NextResponse.json({ forbidden: true }, { status: 403 });
  const last = await lastLeadNumber();
  return NextResponse.json(n <= last ? { deleted: true } : { missing: true }, { status: 404 });
}
