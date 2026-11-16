import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { financeGate, parseRecurring, runRecurring } from "@/lib/financeServer";

// Edit / switch on-off. Switching on starts write-offs from today (paused months are not charged).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGate();
  if (g.error) return g.error;
  const { id } = await params;
  const old = await db.recurring.findUnique({ where: { id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await parseRecurring(await req.json(), true);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  const turnedOn = r.data!.active === true && !old.active;
  const item = await db.recurring.update({ where: { id }, data: { ...(r.data as Prisma.RecurringUpdateInput), ...(turnedOn ? { activeFrom: new Date() } : {}) } });
  await runRecurring(true);
  return NextResponse.json(item);
}

// Delete: already written-off expenses stay in the journal.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGate();
  if (g.error) return g.error;
  const { id } = await params;
  await db.recurring.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
