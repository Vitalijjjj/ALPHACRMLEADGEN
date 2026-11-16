import { NextRequest, NextResponse } from "next/server";
import { canPage } from "@/lib/access";
import { CURRENCIES } from "@/lib/finance";
import { canLead, forbidden, requireAccess, visibleLeadsWhere } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";

const leadSelect = { id: true, number: true, name: true, projectName: true, payer: true, phone: true, funnelId: true, status: true, amount: true, currency: true } as const;

// «Графік оплат»: every stage of every deal (the ones this user may see) + planned payments without a project.
export async function GET() {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  if (!canPage(gate.access, "pnl")) return forbidden("Немає доступу до фінансів");
  await ensureSchema();
  const where = visibleLeadsWhere(gate.access, gate.settings);
  const payIds = gate.settings.funnels.filter((f) => f.payments).map((f) => f.id);
  const stages = await db.paymentStage.findMany({
    where: { OR: [{ lead: where ? { AND: [where, { funnelId: { in: payIds } }] } : { funnelId: { in: payIds } } }, { leadId: null }] },
    include: { lead: { select: leadSelect } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { idx: "asc" }],
  });
  return NextResponse.json(stages);
}

// «Запланувати оплату»: a future payment of a project (added as its next stage) or without a project.
export async function POST(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  await ensureSchema();
  const b = await req.json();
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount > 0)) return NextResponse.json({ error: "Вкажи суму більше нуля" }, { status: 400 });
  const dueDate = b.dueDate ? new Date(b.dueDate) : null;
  const title = typeof b.title === "string" && b.title.trim() ? b.title.trim() : null;
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;

  if (typeof b.leadId === "string" && b.leadId) {
    const lead = await db.lead.findUnique({ where: { id: b.leadId }, select: { id: true, funnelId: true } });
    if (!lead) return NextResponse.json({ error: "Проєкт не знайдено" }, { status: 404 });
    if (!canPage(gate.access, "pnl") && !canLead(gate.access, gate.settings, lead.funnelId, "edit")) return forbidden();
    const idx = await db.paymentStage.count({ where: { leadId: lead.id } });
    const st = await db.paymentStage.create({ data: { leadId: lead.id, idx, title, amount, dueDate, note }, include: { lead: { select: leadSelect } } });
    return NextResponse.json(st);
  }
  if (!canPage(gate.access, "pnl")) return forbidden("Немає доступу до фінансів");
  const currency = (CURRENCIES as readonly string[]).includes(b.currency) ? b.currency : "UAH";
  const payer = typeof b.payer === "string" && b.payer.trim() ? b.payer.trim() : null;
  const st = await db.paymentStage.create({ data: { leadId: null, idx: 0, title, amount, dueDate, note, currency, payer }, include: { lead: { select: leadSelect } } });
  return NextResponse.json(st);
}

// remove a planned payment without a project (project stages are edited in the deal card)
export async function DELETE(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  if (!canPage(gate.access, "pnl")) return forbidden("Немає доступу до фінансів");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id" }, { status: 400 });
  await db.transaction.updateMany({ where: { stageId: id }, data: { stageId: null } });
  await db.paymentStage.deleteMany({ where: { id, leadId: null } });
  return NextResponse.json({ ok: true });
}
