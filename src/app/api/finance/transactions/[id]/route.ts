import { NextRequest, NextResponse } from "next/server";
import { canPage } from "@/lib/access";
import { forbidden, requireAccess } from "@/lib/accessServer";
import { db, ensureSchema } from "@/lib/db";
import { CURRENCIES, isTxKind } from "@/lib/finance";
import { getFinance, rateOn, resolveProject, syncStagePaid, txCategory } from "@/lib/financeServer";

async function gatePage() {
  const gate = await requireAccess();
  if ("error" in gate) return { error: gate.error };
  if (!canPage(gate.access, "pnl")) return { error: forbidden("Немає доступу до фінансів") };
  await ensureSchema();
  return { ok: true, name: gate.access.name };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gatePage();
  if (g.error) return g.error;
  const { id } = await params;
  const old = await db.transaction.findUnique({ where: { id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await req.json();
  const fin = await getFinance();

  const kind = isTxKind(b.kind) ? b.kind : old.kind;
  const amount = b.amount !== undefined ? Number(b.amount) : old.amount;
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Вкажи суму більше нуля" }, { status: 400 });
  const accountId = fin.accounts.some((a) => a.id === b.accountId) ? b.accountId : old.accountId;
  const currency = (CURRENCIES as readonly string[]).includes(b.currency) ? b.currency : old.currency;
  const date = b.date ? new Date(b.date) : old.date;
  const rateChanged = b.rate !== undefined || currency !== old.currency || date.getTime() !== old.date.getTime();
  const rate = currency === "UAH" ? 1 : Number(b.rate) > 0 ? Number(b.rate) : rateChanged ? await rateOn(currency, date) : old.rate;
  const relink = old.parentId ? false : b.projectId !== undefined || b.leadId !== undefined || kind !== old.kind;
  const link = relink
    ? await resolveProject(kind, b.projectId !== undefined ? b.projectId : old.projectId, b.leadId !== undefined ? b.leadId : old.leadId)
    : { projectId: old.projectId, leadId: old.leadId };

  const tx = await db.transaction.update({
    where: { id },
    data: {
      kind, amount, currency, rate, date, accountId,
      amountUah: Math.round(amount * rate * 100) / 100,
      toAccountId: kind === "transfer" ? (b.toAccountId ?? old.toAccountId) : null,
      leadId: link.leadId,
      projectId: link.projectId,
      ...(b.counterparty !== undefined ? { counterparty: b.counterparty?.trim() || null } : {}),
      ...(b.comment !== undefined ? { comment: b.comment?.trim() || null } : {}),
      ...(b.category !== undefined || kind !== old.kind ? { category: txCategory(kind, b.category !== undefined ? b.category : old.category) } : {}),
      ...(kind !== "expense" ? { adCampaignId: null } : b.adCampaignId !== undefined ? { adCampaignId: typeof b.adCampaignId === "string" && b.adCampaignId ? b.adCampaignId : null } : {}),
      ...(b.period !== undefined ? { period: /^\d{4}-\d{2}$/.test(b.period ?? "") ? b.period : null } : {}),
      ...(kind !== "income" || link.leadId !== old.leadId ? { stageId: null } : {}),
    },
  });
  // its 6% tax follows the income to the same project
  if (relink) await db.transaction.updateMany({ where: { parentId: id }, data: { leadId: tx.leadId, projectId: tx.projectId } });
  await syncStagePaid(old.stageId);
  if (tx.stageId !== old.stageId) await syncStagePaid(tx.stageId);
  return NextResponse.json(tx);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gatePage();
  if (g.error) return g.error;
  const { id } = await params;
  const old = await db.transaction.findUnique({ where: { id } });
  if (!old) return NextResponse.json({ ok: true });
  await db.transaction.deleteMany({ where: { OR: [{ id }, { parentId: id }] } }); // with its 6% tax
  await syncStagePaid(old.stageId);
  return NextResponse.json({ ok: true });
}
