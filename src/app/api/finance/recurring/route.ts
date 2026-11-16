import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { financeGate, parseRecurring, runRecurring } from "@/lib/financeServer";

// Співробітники / підписки with automatic monthly write-off.
export async function GET() {
  const g = await financeGate();
  if (g.error) return g.error;
  await runRecurring();
  const items = await db.recurring.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  const stats = await db.transaction.groupBy({ by: ["recurringId"], where: { recurringId: { in: items.map((i) => i.id) } }, _count: true, _sum: { amountUah: true }, _max: { date: true } });
  const by = new Map(stats.map((s) => [s.recurringId, s]));
  // people: everything paid to them this year (auto salary + contractor / expense operations to their name)
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const names = items.filter((i) => i.type === "employee").map((i) => i.name);
  const paid = names.length ? await db.transaction.groupBy({
    by: ["counterparty"], where: { counterparty: { in: names }, kind: { in: ["contractor", "expense"] }, date: { gte: yearStart } }, _count: true, _sum: { amountUah: true },
  }) : [];
  const paidBy = new Map(paid.map((p) => [p.counterparty, p]));
  return NextResponse.json(items.map((i) => ({
    ...i, charges: by.get(i.id)?._count ?? 0, chargedUah: by.get(i.id)?._sum.amountUah ?? 0, lastCharge: by.get(i.id)?._max.date ?? null,
    ...(i.type === "employee" ? { paidYearUah: paidBy.get(i.name)?._sum.amountUah ?? 0, paidCount: paidBy.get(i.name)?._count ?? 0 } : {}),
  })));
}

export async function POST(req: NextRequest) {
  const g = await financeGate();
  if (g.error) return g.error;
  const r = await parseRecurring(await req.json(), false);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  const item = await db.recurring.create({ data: { ...(r.data as Prisma.RecurringCreateInput), activeFrom: new Date() } });
  await runRecurring(true);
  return NextResponse.json(item, { status: 201 });
}
