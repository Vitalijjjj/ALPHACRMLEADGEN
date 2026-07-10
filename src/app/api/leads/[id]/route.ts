import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await ensureSchema();
    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" } },
        deals: true,
      },
    });

    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch (e) {
    console.error("GET /api/leads/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

function parseWarsawDate(raw: string): Date {
  // datetime-local gives "YYYY-MM-DDTHH:mm" (16 chars) — treat as Europe/Warsaw UTC+2
  return new Date(raw.length === 16 ? raw + ":00+02:00" : raw);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json();

    await ensureSchema();
    const existing = await db.lead.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Build a clean update object with only known schema fields
    const data: Record<string, unknown> = {};

    if (body.name        !== undefined) data.name        = body.name;
    if (body.instagram   !== undefined) data.instagram   = body.instagram ? body.instagram.replace(/^@/, "").trim() : null;
    if (body.telegram    !== undefined) data.telegram    = body.telegram ? body.telegram.replace(/^@/, "").trim() : null;
    if (body.phone       !== undefined) data.phone       = body.phone || null;
    if (body.email       !== undefined) data.email       = body.email || null;
    if (body.comment     !== undefined) data.comment     = body.comment || null;
    if (body.source       !== undefined) data.source       = body.source || null;
    if (body.sourceDetail !== undefined) data.sourceDetail = body.sourceDetail || null;
    if (body.geo         !== undefined) data.geo         = body.geo || null;
    if (body.niche       !== undefined) data.niche       = body.niche || null;
    if (body.amount      !== undefined) data.amount      = body.amount ? parseFloat(body.amount) : null;
    if (body.status      !== undefined) data.status      = body.status;
    if (body.siteStructure    !== undefined) data.siteStructure    = body.siteStructure || null;
    if (body.hasExtraLang     !== undefined) data.hasExtraLang     = !!body.hasExtraLang;
    if (body.languages        !== undefined) data.languages        = body.hasExtraLang ? (body.languages || null) : null;
    if (body.service          !== undefined) data.service          = body.service || null;
    if (body.paymentSystem    !== undefined) data.paymentSystem    = body.paymentSystem || null;
    if (body.usedServices     !== undefined) data.usedServices     = Array.isArray(body.usedServices) ? body.usedServices : [];
    if (body.projectDeadline  !== undefined) data.projectDeadline  = body.projectDeadline || null;
    if (body.pushAt           !== undefined) data.pushAt           = body.pushAt ? parseWarsawDate(body.pushAt) : null;
    if (body.pushComment      !== undefined) data.pushComment      = body.pushComment || null;
    if (body.remindAt         !== undefined) data.remindAt         = body.remindAt ? new Date(body.remindAt) : null;
    if (body.pushStage        !== undefined) data.pushStage        = body.pushStage || null;
    if (body.messenger        !== undefined) data.messenger        = body.messenger || null;
    if (body.calendarAt       !== undefined) data.calendarAt       = body.calendarAt ? parseWarsawDate(body.calendarAt) : null;
    if (body.calendarStatus   !== undefined) data.calendarStatus   = body.calendarStatus || null;
    if (body.createdAt        !== undefined) data.createdAt        = body.createdAt ? new Date(body.createdAt) : undefined;

    const lead = await db.lead.update({ where: { id }, data });

    if (body.status && body.status !== existing.status) {
      await db.activity.create({
        data: {
          leadId: id,
          type: "STATUS_CHANGE",
          content: `Статус змінено: ${existing.status} → ${body.status}`,
        },
      });
    }

    return NextResponse.json(lead);
  } catch (e) {
    console.error("PATCH /api/leads/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
