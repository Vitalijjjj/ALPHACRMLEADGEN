import { NextRequest, NextResponse } from "next/server";
import { forbidden, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";

// Settings → «Джерела лідів»: how many leads each source has, and moving all of one source to another.
// Owner only — it rewrites many leads at once.

export async function GET() {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  if (!gate.access.owner) return forbidden();
  await ensureSchema();
  const rows = await db.lead.groupBy({ by: ["source"], _count: { _all: true }, where: { source: { not: null } } });
  return NextResponse.json(rows.map((r) => ({ source: r.source, count: r._count._all })).sort((a, b) => b.count - a.count));
}

export async function POST(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  if (!gate.access.owner) return forbidden();
  await ensureSchema();
  const { from, to } = await req.json();
  const f = typeof from === "string" ? from.trim() : "";
  const t = typeof to === "string" ? to.trim() : "";
  if (!f || !t || f.toLowerCase() === t.toLowerCase()) return NextResponse.json({ error: "Вкажи два різні джерела" }, { status: 400 });
  const r = await db.lead.updateMany({ where: { source: { equals: f, mode: "insensitive" } }, data: { source: t } });
  return NextResponse.json({ count: r.count });
}
