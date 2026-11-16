import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, ensureSchema } from "@/lib/db";
import { forbidden, getAccess, unauthorized } from "@/lib/accessServer";

const select = { id: true, email: true, name: true, roleId: true, active: true, createdAt: true } as const;

// Team members — only the owner manages them.
export async function GET() {
  const access = await getAccess();
  if (!access) return unauthorized();
  if (!access.owner) return forbidden();
  await ensureSchema();
  return NextResponse.json(await db.user.findMany({ select, orderBy: { createdAt: "asc" } }));
}

export async function POST(req: NextRequest) {
  const access = await getAccess();
  if (!access) return unauthorized();
  if (!access.owner) return forbidden();
  const { email, name, password, roleId } = await req.json();
  const mail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(mail)) return NextResponse.json({ error: "Вкажи правильний email" }, { status: 400 });
  if (typeof password !== "string" || password.length < 6) return NextResponse.json({ error: "Пароль — щонайменше 6 символів" }, { status: 400 });
  if (process.env.ADMIN_EMAIL && mail === process.env.ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Це email власника" }, { status: 400 });
  }
  await ensureSchema();
  if (await db.user.findUnique({ where: { email: mail } })) return NextResponse.json({ error: "Користувач з таким email уже є" }, { status: 400 });
  const user = await db.user.create({
    data: { email: mail, name: (typeof name === "string" && name.trim()) || mail, passwordHash: await bcrypt.hash(password, 10), roleId: roleId || null },
    select,
  });
  return NextResponse.json(user, { status: 201 });
}
