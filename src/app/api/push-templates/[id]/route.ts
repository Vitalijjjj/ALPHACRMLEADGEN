import { NextRequest, NextResponse } from "next/server";
import { requireAccess } from "@/lib/accessServer";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess("pushes");
  if ("error" in gate) return gate.error;

  const { id } = await params;
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title?.trim() || null;
    if (body.category !== undefined) data.category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
    if (body.text !== undefined) {
      const text = (body.text ?? "").trim();
      if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
      data.text = text;
    }
    const item = await db.pushTemplate.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (e) {
    console.error("PATCH /api/push-templates/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAccess("pushes");
  if ("error" in gate) return gate.error;

  const { id } = await params;
  try {
    await db.pushTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/push-templates/[id]:", e);
    return NextResponse.json({ error: "DB error", detail: String(e) }, { status: 500 });
  }
}
