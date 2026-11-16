import { NextRequest, NextResponse } from "next/server";
import { projectCloseBlockers } from "@/lib/projectClose";
import { cleanPhone } from "@/lib/leadFilter";
import { asCurrency } from "@/lib/currency";
import { db, ensureSchema } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { logStatusChange } from "@/lib/stageFlowServer";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { syncMeetingTasks, syncStageTasks } from "@/lib/taskAutomationServer";
import { getFunnel } from "@/lib/crmSettings";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

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
    if (!canLead(access, accessSettings, lead.funnelId, "view")) return forbidden("Немає доступу до цієї воронки");

    // Linked leads: where it came from and where it was passed to (business processes)
    const linkSelect = { id: true, number: true, name: true, projectName: true, amount: true, currency: true, phone: true, funnelId: true, status: true, closeReason: true, createdAt: true } as const;
    const [sourceLead, transfers, linked, samePhone] = await Promise.all([
      lead.sourceLeadId ? db.lead.findUnique({ where: { id: lead.sourceLeadId }, select: linkSelect }) : null,
      db.lead.findMany({ where: { sourceLeadId: lead.id }, select: linkSelect, orderBy: { createdAt: "asc" } }),
      // linked by hand (either side may hold the link)
      db.lead.findMany({ where: { OR: [{ id: { in: lead.links } }, { links: { has: lead.id } }], NOT: { id: lead.id } }, select: linkSelect, orderBy: { createdAt: "asc" } }),
      // same phone in other deals → suggest linking
      lead.phone ? db.lead.findMany({ where: { phone: lead.phone, NOT: { id: lead.id } }, select: linkSelect, orderBy: { createdAt: "asc" }, take: 20 }) : [],
    ]);
    const known = new Set([lead.sourceLeadId, ...transfers.map((t) => t.id), ...linked.map((l) => l.id)]);
    return NextResponse.json({ ...lead, sourceLead, transfers, linked, suggested: samePhone.filter((x) => !known.has(x.id)) });
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
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  const { id } = await params;

  try {
    const body = await req.json();

    await ensureSchema();
    const existing = await db.lead.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canLead(access, accessSettings, existing.funnelId, "edit")) return forbidden("Немає права редагувати угоди цієї воронки");
    // moving to another funnel = adding there
    if (body.funnelId !== undefined && (body.funnelId || null) !== (existing.funnelId || null) && !canLead(access, accessSettings, body.funnelId, "create")) {
      return forbidden("Немає права додавати угоди в цю воронку");
    }

    // Build a clean update object with only known schema fields
    const data: Record<string, unknown> = {};

    if (body.name        !== undefined) data.name        = body.name;
    if (body.projectName !== undefined) data.projectName = typeof body.projectName === "string" && body.projectName.trim() ? body.projectName.trim() : null;
    if (body.payer !== undefined) data.payer = typeof body.payer === "string" && body.payer.trim() ? body.payer.trim() : null;
    if (body.instagram   !== undefined) data.instagram   = body.instagram ? body.instagram.replace(/^@/, "").trim() : null;
    if (body.telegram    !== undefined) data.telegram    = body.telegram ? body.telegram.replace(/^@/, "").trim() : null;
    if (body.phone       !== undefined) data.phone       = body.phone ? cleanPhone(String(body.phone)) || null : null;
    if (body.email       !== undefined) data.email       = body.email || null;
    if (body.comment     !== undefined) data.comment     = body.comment || null;
    if (body.source       !== undefined) data.source       = body.source || null;
    if (body.sourceDetail !== undefined) data.sourceDetail = body.sourceDetail || null;
    if (body.geo         !== undefined) data.geo         = body.geo || null;
    if (body.niche       !== undefined) data.niche       = body.niche || null;
    if (body.amount      !== undefined) data.amount      = body.amount ? parseFloat(String(body.amount).replace(/\s/g, "").replace(",", ".")) || null : null;
    if (body.currency    !== undefined) data.currency    = asCurrency(body.currency);
    if (body.status      !== undefined) data.status      = body.status;
    if (body.siteStructure    !== undefined) data.siteStructure    = body.siteStructure || null;
    if (body.hasExtraLang     !== undefined) data.hasExtraLang     = !!body.hasExtraLang;
    if (body.languages        !== undefined) data.languages        = body.hasExtraLang ? (body.languages || null) : null;
    if (body.service          !== undefined) data.service          = body.service || null;
    if (body.paymentSystem    !== undefined) data.paymentSystem    = body.paymentSystem || null;
    if (body.usedServices     !== undefined) data.usedServices     = Array.isArray(body.usedServices) ? body.usedServices : [];
    if (body.projectDeadline  !== undefined) data.projectDeadline  = body.projectDeadline || null;
    // the live site of the project (for «Кейси») — «https://» is added when missing
    if (body.caseUrl !== undefined) {
      const u = String(body.caseUrl ?? "").trim();
      data.caseUrl = u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : null;
    }
    if (body.pushAt           !== undefined) data.pushAt           = body.pushAt ? parseWarsawDate(body.pushAt) : null;
    if (body.pushComment      !== undefined) data.pushComment      = body.pushComment || null;
    if (body.remindAt         !== undefined) data.remindAt         = body.remindAt ? new Date(body.remindAt) : null;
    if (body.pushStage        !== undefined) data.pushStage        = body.pushStage || null;
    if (body.messenger        !== undefined) data.messenger        = body.messenger || null;
    if (body.calendarAt       !== undefined) data.calendarAt       = body.calendarAt ? parseWarsawDate(body.calendarAt) : null;
    if (body.kpAt             !== undefined) data.kpAt             = body.kpAt ? new Date(body.kpAt) : null; // ISO (real instant)
    if (body.calendarStatus   !== undefined) data.calendarStatus   = body.calendarStatus || null;
    if (body.funnelId         !== undefined) data.funnelId         = body.funnelId || null;
    if (body.closeReason      !== undefined) data.closeReason      = body.closeReason || null;
    if (body.partnerId        !== undefined) data.partnerId        = typeof body.partnerId === "string" && body.partnerId ? body.partnerId : null;
    // Funnel fields: merge the sent keys into what is stored (null / "" removes a key)
    if (body.customFields && typeof body.customFields === "object") {
      const merged: Record<string, unknown> = { ...((existing.customFields as Record<string, unknown>) ?? {}) };
      for (const [k, v] of Object.entries(body.customFields as Record<string, unknown>)) {
        if (v === null || v === "" || (Array.isArray(v) && !v.length)) delete merged[k];
        else merged[k] = v;
      }
      data.customFields = merged;
    }
    // a project can't be finished without its case link and its payments
    if (body.status === "WON" && existing.status !== "WON" && getFunnel(accessSettings, existing.funnelId).payments) {
      const blockers = await projectCloseBlockers(existing, body.caseUrl);
      if (blockers.length) return NextResponse.json({ error: `Проєкт не можна завершити: ${blockers.join("; ")}`, blockers }, { status: 400 });
    }
    // Closing stamps the close date; reopening (moving to a working stage) clears reason and date.
    if (body.status !== undefined && body.status !== existing.status) {
      const closing = body.status === "WON" || body.status === "LOST";
      data.closedAt = closing ? new Date() : null;
      if (!closing && body.closeReason === undefined) data.closeReason = null;
    }
    if (body.createdAt        !== undefined) data.createdAt        = body.createdAt ? new Date(body.createdAt) : undefined;

    const lead = await db.lead.update({ where: { id }, data });

    if (body.funnelId !== undefined && (body.funnelId || null) !== (existing.funnelId || null)) {
      await db.activity.create({
        data: { leadId: id, type: "NOTE", content: `Перенесено у воронку «${body.funnelName ?? body.funnelId ?? "Основна"}»` },
      });
    }

    if (body.status && body.status !== existing.status) {
      // Logs every passed stage (jump forward = all stages in between, except обхідні like НДЗ)
      const settings = await getCrmSettings();
      await logStatusChange(db, settings, { id, status: existing.status, funnelId: lead.funnelId }, body.status);
      // Automatic tasks: drop the unfinished ones of the old stage, create the ones of the new stage
      await syncStageTasks(db, settings, lead);
    }
    if (body.kpAt !== undefined) await syncMeetingTasks(db, id, lead.kpAt);
    // the live site added to the project later → the deals handed over from it (Підписка / Апсейл) get it too
    if (body.caseUrl !== undefined && lead.caseUrl && lead.caseUrl !== existing.caseUrl) {
      await db.lead.updateMany({ where: { sourceLeadId: id, OR: [{ caseUrl: null }, { caseUrl: existing.caseUrl ?? "" }] }, data: { caseUrl: lead.caseUrl } });
    }

    return NextResponse.json(lead);
  } catch (e) {
    console.error("PATCH /api/leads/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  const { id } = await params;
  const existing = await db.lead.findUnique({ where: { id }, select: { funnelId: true } });
  if (!existing) return NextResponse.json({ ok: true });
  if (!canLead(access, accessSettings, existing.funnelId, "delete")) return forbidden("Немає права видаляти угоди цієї воронки");
  await db.lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
