import { NextRequest, NextResponse } from "next/server";
import { canPage } from "@/lib/access";
import { canLead, forbidden, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { CURRENCIES, TX_META, fmtMoney, isTxKind } from "@/lib/finance";
import { getFinance, rateOn, resolveProject, runFopTaxes, runRecurring, syncStagePaid, txCategory } from "@/lib/financeServer";

const leadSelect = { id: true, number: true, name: true, projectName: true, phone: true, funnelId: true, amount: true, currency: true } as const;
const projectSelect = { id: true, name: true, leadId: true } as const;

// Money journal. GET — all operations (vkladka «Оплати»), or one deal's (?leadId=, for its card).
export async function GET(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings } = gate;
  await ensureSchema();
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (leadId) {
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { funnelId: true } });
    if (!lead || !canLead(access, settings, lead.funnelId, "view")) return forbidden();
  } else if (!canPage(access, "pnl")) return forbidden("Немає доступу до фінансів");

  await runRecurring();
  await runFopTaxes();
  const list = await db.transaction.findMany({
    where: leadId ? { OR: [{ leadId }, { project: { leadId } }] } : {},
    include: { lead: { select: leadSelect }, project: { select: projectSelect } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(list);
}

// New operation. From «Оплати» (the page) or «Внести оплату» in a deal card (needs edit on that funnel).
export async function POST(req: NextRequest) {
  const gate = await requireAccess();
  if ("error" in gate) return gate.error;
  const { access, settings } = gate;
  await ensureSchema();
  const b = await req.json();

  if (!isTxKind(b.kind)) return NextResponse.json({ error: "Невідомий тип операції" }, { status: 400 });
  const pageOk = canPage(access, "pnl");
  // only finance users may create a project; deal editors work through their deal
  // a 6% tax follows its income: same project / deal
  const parent = (b.kind === "tax" || b.kind === "transfer") && typeof b.parentId === "string" && b.parentId
    ? await db.transaction.findUnique({ where: { id: b.parentId }, select: { id: true, leadId: true, projectId: true } })
    : null;
  // a 6% tax belongs to its income's project; conversions / withdrawals are company-level moves
  const link = parent && b.kind === "tax" ? { projectId: parent.projectId, leadId: parent.leadId } : await resolveProject(b.kind, pageOk ? b.projectId : null, b.leadId);
  const lead = link.leadId ? await db.lead.findUnique({ where: { id: link.leadId }, select: { id: true, number: true, name: true, phone: true, funnelId: true } }) : null;
  if (!pageOk && !(lead && canLead(access, settings, lead.funnelId, "edit"))) return forbidden("Немає права вносити оплати");

  const fin = await getFinance();
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Вкажи суму більше нуля" }, { status: 400 });
  const account = fin.accounts.find((a) => a.id === b.accountId);
  if (!account) return NextResponse.json({ error: "Вибери рахунок" }, { status: 400 });
  if (b.kind === "transfer" && !fin.accounts.some((a) => a.id === b.toAccountId && a.id !== account.id)) {
    return NextResponse.json({ error: "Вибери рахунок, куди переказ" }, { status: 400 });
  }
  const currency = (CURRENCIES as readonly string[]).includes(b.currency) ? b.currency : account.currency;
  const date = b.date ? new Date(b.date) : new Date();
  const rate = currency === "UAH" ? 1 : Number(b.rate) > 0 ? Number(b.rate) : await rateOn(currency, date);

  // a payment stage: of this deal, or a planned payment without a project
  const stage = b.kind === "income" && typeof b.stageId === "string" && b.stageId
    ? await db.paymentStage.findUnique({ where: { id: b.stageId }, select: { id: true, leadId: true } })
    : null;
  const stageId = stage && (stage.leadId ? stage.leadId === lead?.id : true) ? stage.id : null;

  const tx = await db.transaction.create({
    data: {
      date,
      kind: b.kind,
      amount,
      currency,
      rate,
      amountUah: Math.round(amount * rate * 100) / 100,
      accountId: account.id,
      toAccountId: b.kind === "transfer" ? b.toAccountId : null,
      leadId: lead?.id ?? null,
      projectId: link.projectId,
      stageId,
      counterparty: typeof b.counterparty === "string" && b.counterparty.trim() ? b.counterparty.trim() : null,
      comment: typeof b.comment === "string" && b.comment.trim() ? b.comment.trim() : null,
      category: txCategory(b.kind, b.category),
      parentId: parent?.id ?? null,
      adCampaignId: b.kind === "expense" && typeof b.adCampaignId === "string" && b.adCampaignId ? b.adCampaignId : null,
      period: typeof b.period === "string" && /^\d{4}-\d{2}$/.test(b.period) ? b.period : null,
      createdBy: access.name,
    },
    include: { lead: { select: leadSelect }, project: { select: projectSelect } },
  });
  await syncStagePaid(tx.stageId);
  if (lead) {
    await db.activity.create({
      data: {
        leadId: lead.id,
        type: "NOTE",
        content: `${TX_META[tx.kind as keyof typeof TX_META].label}: ${fmtMoney(amount, currency)} · ${account.name}${tx.comment ? ` · ${tx.comment}` : ""}`,
      },
    });
  }
  return NextResponse.json(tx, { status: 201 });
}
