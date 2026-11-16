import { NextRequest, NextResponse } from "next/server";
import { canLead, forbidden, requireAccess, visibleLeadsWhere } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";

const leadSelect = {
  id: true, name: true, number: true, phone: true, status: true, funnelId: true,
  niche: true, instagram: true, telegram: true, source: true, calendarAt: true, calendarStatus: true, kpAt: true,
} as const;

export async function GET(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId") ?? undefined;
  const dealId = searchParams.get("dealId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const open = searchParams.get("open") === "1";

  const tasks = await db.task.findMany({
    where: {
      ...(leadId ? { leadId } : {}),
      ...(dealId ? { dealId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(open ? { status: { not: "DONE" as const } } : {}),
      // tasks of deals in funnels the user may see (+ tasks without a deal)
      ...(visibleLeadsWhere(access, accessSettings) ? { OR: [{ leadId: null }, { lead: visibleLeadsWhere(access, accessSettings)! }] } : {}),
    },
    include: {
      lead: { select: leadSelect },
      deal: { select: { id: true, company: true } },
    },
    orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  await ensureSchema();
  const body = await req.json();
  const { title, description, deadline, remindAt, status, priority, leadId, dealId, assignee } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (leadId) {
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { funnelId: true } });
    if (lead && !canLead(access, accessSettings, lead.funnelId, "edit")) return forbidden("Немає права редагувати угоди цієї воронки");
  }

  const task = await db.task.create({
    data: {
      title: title.trim(),
      description: description || null,
      deadline: deadline ? new Date(deadline) : null,
      remindAt: remindAt ? new Date(remindAt) : null,
      status: status ?? "TODO",
      priority: priority ?? "MEDIUM",
      leadId: leadId || null,
      dealId: dealId || null,
      assignee: assignee || null,
    },
    include: { lead: { select: leadSelect } },
  });

  if (leadId) {
    await db.activity.create({
      data: { leadId, type: "TASK_CREATED", content: `Задача створена: ${task.title}` },
    });
  }
  if (dealId) {
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    await db.activity.create({
      data: {
        dealId,
        leadId: deal?.leadId ?? undefined,
        type: "TASK_CREATED",
        content: `Задача створена: ${task.title}`,
      },
    });
  }

  return NextResponse.json(task, { status: 201 });
}
