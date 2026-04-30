import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      lead: true,
      tasks: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(deal);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json();

    const existing = await db.deal.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.leadId      !== undefined) data.leadId      = body.leadId;
    if (body.company     !== undefined) data.company     = body.company || null;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.budget      !== undefined) data.budget      = body.budget ? parseFloat(String(body.budget)) : null;
    if (body.deadline    !== undefined) data.deadline    = body.deadline ? new Date(body.deadline) : null;
    if (body.status      !== undefined) data.status      = body.status;

    const deal = await db.deal.update({ where: { id }, data });

    if (body.status && body.status !== existing.status) {
      await db.activity.create({
        data: {
          dealId: id,
          leadId: existing.leadId,
          type: "STATUS_CHANGE",
          content: `Статус клієнта: ${existing.status} → ${body.status}`,
        },
      });
    }

    return NextResponse.json(deal);
  } catch (e) {
    console.error("PATCH /api/deals/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.deal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
