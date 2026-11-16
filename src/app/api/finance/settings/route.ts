import { NextRequest, NextResponse } from "next/server";
import { canPage } from "@/lib/access";
import { forbidden, requireAccess } from "@/lib/accessServer";
import { getFinance, saveFinance } from "@/lib/financeServer";

// Accounts, taxes, plan. Read by anyone signed in (the deal card needs the accounts), changed on «Оплати».
export async function GET() {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  return NextResponse.json(await getFinance());
}

export async function PUT(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  if (!canPage(gate.access, "pnl")) return forbidden("Немає доступу до фінансів");
  return NextResponse.json(await saveFinance(await req.json()));
}
