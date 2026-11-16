import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { financeGate } from "@/lib/financeServer";
import { getCrmSettings } from "@/lib/crmSettingsServer";

// Projects = deals of the funnels with «Оплати в угодах» on (e.g. «Операційка»).
export async function GET() {
  const g = await financeGate();
  if (g.error) return g.error;
  const settings = await getCrmSettings();
  const funnels = settings.funnels.filter((f) => f.payments).map((f) => f.id);
  if (!funnels.length) return NextResponse.json([]);
  const firstId = settings.funnels[0]?.id;
  const list = await db.lead.findMany({
    where: { OR: [{ funnelId: { in: funnels } }, ...(firstId && funnels.includes(firstId) ? [{ funnelId: null }] : [])] },
    select: {
      id: true, number: true, name: true, projectName: true, payer: true, phone: true, funnelId: true, status: true, amount: true, currency: true, createdAt: true,
      tasks: { where: { status: "DONE", autoRuleId: { not: null } }, select: { autoStage: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  // doneHere — ticked automatic tasks of the stage the deal is on now (for «виконано на N%»)
  return NextResponse.json(list.map(({ tasks, ...d }) => ({ ...d, doneHere: tasks.filter((t) => t.autoStage === d.status).length })));
}
