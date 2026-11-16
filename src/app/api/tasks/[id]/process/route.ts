import { NextRequest, NextResponse } from "next/server";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { getCrmSettings } from "@/lib/crmSettingsServer";
import { processStepOf } from "@/lib/taskAutomationServer";
import { runTransfer } from "@/lib/transferServer";

// «Так» on the question of a process task («Клієнт дуже задоволений?» → передати Артуру на апсейл)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const { id } = await params;
  const task = await db.task.findUnique({ where: { id } });
  if (!task?.leadId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const lead = await db.lead.findUnique({ where: { id: task.leadId } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canLead(gate.access, gate.settings, lead.funnelId, "edit")) return forbidden("Немає права редагувати угоди цієї воронки");
  const settings = await getCrmSettings();
  const bound = processStepOf(settings, task);
  if (!bound) return NextResponse.json({ error: "У задачі немає бізнес-процесу" }, { status: 400 });
  if (lead.funnelId !== bound.process.fromFunnelId) return NextResponse.json({ error: "Угода вже в іншій воронці" }, { status: 400 });
  return NextResponse.json(await runTransfer(settings, bound.process, lead, { once: true }));
}
