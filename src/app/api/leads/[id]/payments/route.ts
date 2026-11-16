import { NextRequest, NextResponse } from "next/server";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";

// Payment schedule of a deal («Оплати» in the card): GET the stages, PUT the whole list.
async function load(id: string, action: "view" | "edit") {
  const gate = await requireAccess();
  if ("error" in gate) return { error: gate.error };
  await ensureSchema();
  const lead = await db.lead.findUnique({ where: { id }, select: { id: true, funnelId: true } });
  if (!lead) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!canLead(gate.access, gate.settings, lead.funnelId, action)) return { error: forbidden() };
  return { lead };
}

const list = (leadId: string) => db.paymentStage.findMany({ where: { leadId }, orderBy: [{ idx: "asc" }, { createdAt: "asc" }] });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await load(id, "view");
  if (g.error) return g.error;
  return NextResponse.json(await list(id));
}

interface StageIn { id?: string; title?: string | null; amount: number; dueDate?: string | null; note?: string | null }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await load(id, "edit");
  if (g.error) return g.error;
  const body = (await req.json()) as { stages?: StageIn[] };
  const incoming = (Array.isArray(body.stages) ? body.stages : []).filter((s) => Number(s.amount) > 0).slice(0, 24);

  const existing = await list(id);
  const keep = new Set(incoming.map((s) => s.id).filter(Boolean));
  const removed = existing.filter((s) => !keep.has(s.id)).map((s) => s.id);

  await db.$transaction([
    // payments recorded for a removed stage stay in the journal, just without the stage
    db.transaction.updateMany({ where: { stageId: { in: removed } }, data: { stageId: null } }),
    db.paymentStage.deleteMany({ where: { id: { in: removed } } }),
    ...incoming.map((s, idx) => {
      const data = {
        idx,
        title: s.title?.trim() || null,
        amount: Math.round(Number(s.amount) * 100) / 100,
        dueDate: s.dueDate ? new Date(s.dueDate) : null,
        note: s.note?.trim() || null,
      };
      return s.id && existing.some((e) => e.id === s.id)
        ? db.paymentStage.update({ where: { id: s.id }, data })
        : db.paymentStage.create({ data: { ...data, leadId: id } });
    }),
  ]);
  return NextResponse.json(await list(id));
}
