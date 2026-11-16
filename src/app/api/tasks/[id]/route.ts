import { NextRequest, NextResponse } from "next/server";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { promptForDoneTask, processStepOf } from "@/lib/taskAutomationServer";
import { runTransfer, type TransferResult } from "@/lib/transferServer";
import type { TaskPrompt } from "@/lib/taskAutomation";
import type { Access } from "@/lib/access";
import type { CrmSettings } from "@/lib/crmSettings";

async function taskEditable(access: Access, settings: CrmSettings, leadId: string | null): Promise<boolean> {
  if (!leadId) return true;
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { funnelId: true } });
  return !lead || canLead(access, settings, lead.funnelId, "edit");
}

const STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  await ensureSchema();
  const { id } = await params;
  const body = await req.json();

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await taskEditable(access, accessSettings, existing.leadId))) return forbidden("Немає права редагувати угоди цієї воронки");

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description || null;
  if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null;
  if (body.remindAt !== undefined) data.remindAt = body.remindAt ? new Date(body.remindAt) : null;
  if (body.assignee !== undefined) data.assignee = body.assignee || null;
  if (PRIORITIES.has(body.priority)) data.priority = body.priority;
  if (STATUSES.has(body.status)) {
    data.status = body.status;
    if (body.status === "DONE" && existing.status !== "DONE") data.completedAt = new Date();
    if (body.status !== "DONE") data.completedAt = null;
  }
  const task = await db.task.update({ where: { id }, data });

  let prompt: TaskPrompt | null = null;
  let transferred: TransferResult | null = null;
  if (body.status === "DONE" && existing.status !== "DONE") {
    const leadId = existing.leadId
      ?? (existing.dealId ? (await db.deal.findUnique({ where: { id: existing.dealId } }))?.leadId : null)
      ?? undefined;
    await db.activity.create({
      data: { leadId, dealId: existing.dealId ?? undefined, type: "TASK_DONE", content: `Задача виконана: ${existing.title}` },
    });
    const settings = await getCrmSettings();
    prompt = await promptForDoneTask(settings, existing);
    // a task bound to a business process («Передати на допродаж підписки») hands the deal over
    const bound = processStepOf(settings, existing);
    if (bound && existing.leadId) {
      const { step, process, ruleId } = bound;
      const target = settings.funnels.find((f) => f.id === process.toFunnelId)!;
      if (step.processAsk) {
        prompt = { kind: "process", text: step.processAsk, processId: process.id, processName: process.name, target: target.name, ruleId, after: prompt };
      } else {
        const lead = await db.lead.findUnique({ where: { id: existing.leadId } });
        if (lead && lead.funnelId === process.fromFunnelId) transferred = await runTransfer(settings, process, lead, { once: true });
      }
    }
  }
  if (body.status && body.status !== "DONE" && existing.status === "DONE" && existing.leadId) {
    await db.activity.create({
      data: { leadId: existing.leadId, type: "NOTE", content: `Справу повернуто в роботу: ${existing.title}` },
    });
  }

  return NextResponse.json({ ...task, prompt, transferred });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings: accessSettings } = gate;

  const { id } = await params;
  const existing = await db.task.findUnique({ where: { id }, select: { leadId: true } });
  if (existing && !(await taskEditable(access, accessSettings, existing.leadId))) return forbidden("Немає права редагувати угоди цієї воронки");
  await db.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
