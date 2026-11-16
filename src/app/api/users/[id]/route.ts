import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, ensureSchema } from "@/lib/db";
import { forbidden, getAccess, unauthorized } from "@/lib/accessServer";

const select = { id: true, email: true, name: true, roleId: true, active: true, createdAt: true } as const;

// Change name / role / active, or set a new password. Owner only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (!access) return unauthorized();
  if (!access.owner) return forbidden();
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.roleId !== undefined) data.roleId = body.roleId || null;
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 6) return NextResponse.json({ error: "Пароль — щонайменше 6 символів" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }
  await ensureSchema();
  return NextResponse.json(await db.user.update({ where: { id }, data, select }));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (!access) return unauthorized();
  if (!access.owner) return forbidden();
  const { id } = await params;
  await ensureSchema();
  await db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
