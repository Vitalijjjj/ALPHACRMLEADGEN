import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { financeGate, projectLeadSelect } from "@/lib/financeServer";

// Projects / clients of the finance module (vkladka «Проєкти» on P&L).
export async function GET() {
  const g = await financeGate();
  if (g.error) return g.error;
  const list = await db.project.findMany({ include: { lead: { select: projectLeadSelect } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const g = await financeGate();
  if (g.error) return g.error;
  const b = await req.json();
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Вкажи назву проєкту" }, { status: 400 });
  const value = Number(b.value);
  const project = await db.project.create({
    data: {
      name,
      client: typeof b.client === "string" && b.client.trim() ? b.client.trim() : null,
      value: Number.isFinite(value) && value > 0 ? value : null,
      currency: ["UAH", "EUR", "USD"].includes(b.currency) ? b.currency : "UAH",
      leadId: typeof b.leadId === "string" && b.leadId ? b.leadId : null,
      createdBy: g.name ?? null,
    },
    include: { lead: { select: projectLeadSelect } },
  });
  return NextResponse.json(project, { status: 201 });
}
