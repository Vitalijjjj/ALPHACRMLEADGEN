import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";

// «Зв'язати угоду»: a manual link between two deals, stored on both sides.
async function both(req: NextRequest, id: string) {
  const gate = await requireAccess();
  if ("error" in gate) return { error: gate.error };
  await ensureSchema();
  const { targetId } = (await req.json().catch(() => ({}))) as { targetId?: string };
  if (!targetId || targetId === id) return { error: NextResponse.json({ error: "Вибери іншу угоду" }, { status: 400 }) };
  const [a, b] = await Promise.all([
    db.lead.findUnique({ where: { id }, select: { id: true, funnelId: true, links: true, number: true } }),
    db.lead.findUnique({ where: { id: targetId }, select: { id: true, funnelId: true, links: true, number: true } }),
  ]);
  if (!a || !b) return { error: NextResponse.json({ error: "Угоду не знайдено" }, { status: 404 }) };
  if (!canLead(gate.access, gate.settings, a.funnelId, "edit") || !canLead(gate.access, gate.settings, b.funnelId, "view")) return { error: forbidden() };
  return { a, b };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await both(req, id);
  if ("error" in r) return r.error;
  const { a, b } = r;
  await db.$transaction([
    db.lead.update({ where: { id: a.id }, data: { links: [...new Set([...a.links, b.id])] } }),
    db.lead.update({ where: { id: b.id }, data: { links: [...new Set([...b.links, a.id])] } }),
    db.activity.create({ data: { leadId: a.id, type: "NOTE", content: `Зв'язано з угодою #${b.number}` } }),
    db.activity.create({ data: { leadId: b.id, type: "NOTE", content: `Зв'язано з угодою #${a.number}` } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await both(req, id);
  if ("error" in r) return r.error;
  const { a, b } = r;
  await db.$transaction([
    db.lead.update({ where: { id: a.id }, data: { links: a.links.filter((x) => x !== b.id) } }),
    db.lead.update({ where: { id: b.id }, data: { links: b.links.filter((x) => x !== a.id) } }),
  ]);
  return NextResponse.json({ ok: true });
}
