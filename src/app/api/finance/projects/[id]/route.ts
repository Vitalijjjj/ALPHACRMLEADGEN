import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { financeGate, projectLeadSelect, syncStagePaid } from "@/lib/financeServer";

// Edit a project; linking it to a deal moves all its operations into that deal's card.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGate();
  if (g.error) return g.error;
  const { id } = await params;
  const old = await db.project.findUnique({ where: { id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await req.json();
  const data: { name?: string; client?: string | null; value?: number | null; currency?: string; note?: string | null; leadId?: string | null } = {};
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (b.client !== undefined) data.client = typeof b.client === "string" && b.client.trim() ? b.client.trim() : null;
  if (b.note !== undefined) data.note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
  if (b.value !== undefined) { const v = Number(b.value); data.value = Number.isFinite(v) && v > 0 ? v : null; }
  if (["UAH", "EUR", "USD"].includes(b.currency)) data.currency = b.currency;
  if (b.leadId !== undefined) {
    const leadId = typeof b.leadId === "string" && b.leadId ? b.leadId : null;
    if (leadId && !(await db.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Угоду не знайдено" }, { status: 400 });
    }
    data.leadId = leadId;
  }
  const relink = data.leadId !== undefined && data.leadId !== old.leadId;
  const stageIds = relink
    ? (await db.transaction.findMany({ where: { projectId: id, stageId: { not: null } }, select: { stageId: true } })).map((t) => t.stageId)
    : [];
  const project = await db.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id }, data, include: { lead: { select: projectLeadSelect } } });
    if (relink) {
      await tx.transaction.updateMany({ where: { projectId: id }, data: { leadId: data.leadId, stageId: null } });
    }
    return p;
  });
  for (const sid of new Set(stageIds)) await syncStagePaid(sid);
  return NextResponse.json(project);
}

// Delete a project: its operations stay in the journal, «без проєкту».
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGate();
  if (g.error) return g.error;
  const { id } = await params;
  const stageIds = (await db.transaction.findMany({ where: { projectId: id, stageId: { not: null } }, select: { stageId: true } })).map((t) => t.stageId);
  await db.$transaction([
    db.transaction.updateMany({ where: { projectId: id }, data: { projectId: null, leadId: null, stageId: null } }),
    db.project.deleteMany({ where: { id } }),
  ]);
  for (const sid of new Set(stageIds)) await syncStagePaid(sid);
  return NextResponse.json({ ok: true });
}
