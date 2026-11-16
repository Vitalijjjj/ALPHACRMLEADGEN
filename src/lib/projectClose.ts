import { db } from "@/lib/db";

// A project («Операційка», a funnel with payments) is finished as won only when it has
// the link to the live site (for «Кейси») and its money is in: payments recorded, no unpaid stage left.
export async function projectCloseBlockers(lead: { id: string; caseUrl: string | null }, nextCaseUrl?: unknown): Promise<string[]> {
  const out: string[] = [];
  const url = nextCaseUrl !== undefined ? String(nextCaseUrl ?? "").trim() : lead.caseUrl?.trim() ?? "";
  if (!url) out.push("додай посилання на готовий проєкт (кейс)");
  const [income, paid, unpaid] = await Promise.all([
    db.transaction.count({ where: { leadId: lead.id, kind: "income" } }),
    db.paymentStage.count({ where: { leadId: lead.id, paidAt: { not: null } } }),
    db.paymentStage.findMany({ where: { leadId: lead.id, paidAt: null }, select: { title: true, idx: true }, orderBy: { idx: "asc" } }),
  ]);
  if (!income && !paid) out.push("додай оплати проєкту (вкладка «Оплати»)");
  if (unpaid.length) out.push(`не оплачено ${unpaid.length === 1 ? "етап" : "етапи"}: ${unpaid.map((s, i) => s.title || `Етап ${s.idx + 1 || i + 1}`).join(", ")}`);
  return out;
}
