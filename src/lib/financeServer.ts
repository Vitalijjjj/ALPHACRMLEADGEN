import { db, ensureSchema } from "@/lib/db";
import { canPage } from "@/lib/access";
import { forbidden, requireAccess } from "@/lib/accessServer";
import { getFx } from "@/lib/fxServer";
import { CURRENCIES, FINANCE_KEY, TAX_DAY, dueInMonth, everyOf, normalizeFinance, type FinanceSettings } from "@/lib/finance";

export async function getFinance(): Promise<FinanceSettings> {
  await ensureSchema();
  const row = await db.setting.findUnique({ where: { key: FINANCE_KEY } });
  return normalizeFinance(row?.value);
}

export async function saveFinance(v: FinanceSettings): Promise<FinanceSettings> {
  const clean = normalizeFinance(v);
  await db.setting.upsert({
    where: { key: FINANCE_KEY },
    create: { key: FINANCE_KEY, value: clean as object },
    update: { value: clean as object },
  });
  return clean;
}

// NBU rate of a currency to UAH on a date (cached per day); falls back to the current stored rate.
const rateCache = new Map<string, number>();
export async function rateOn(currency: string, date: Date): Promise<number> {
  if (currency === "UAH") return 1;
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const key = `${currency}:${ymd}`;
  const hit = rateCache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${currency}&date=${ymd}&json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const list = (await res.json()) as { rate?: number }[];
    const r = list[0]?.rate;
    if (typeof r === "number" && r > 0) {
      rateCache.set(key, r);
      return r;
    }
  } catch {
    /* NBU is down → current rate */
  }
  const fx = await getFx();
  return currency === "EUR" ? fx.eurUah : fx.usdUah;
}

// A stage counts as paid while at least one income operation points at it.
export async function syncStagePaid(stageId: string | null | undefined) {
  if (!stageId) return;
  const tx = await db.transaction.findFirst({ where: { stageId, kind: "income" }, orderBy: { date: "asc" }, select: { date: true } });
  await db.paymentStage.updateMany({ where: { id: stageId }, data: { paidAt: tx?.date ?? null } });
}

// Category is kept for business expenses (Реклама…), incomes (Еквайринг) and taxes (6%, ЄСВ…).
export function txCategory(kind: string, v: unknown): string | null {
  if (kind !== "expense" && kind !== "income" && kind !== "tax" && kind !== "transfer") return null;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Kinds that belong to a project (transfers, owner payouts and tax payments are company-level).
export const PROJECT_KINDS = new Set(["income", "contractor", "expense"]);

// Which project + deal an operation goes to. A project = a deal in «Операційка»; an imported
// (sheet) project linked to a deal brings its deal. Transfers, dividends and tax payments are company-level.
export async function resolveProject(kind: string, projectId: unknown, leadId: unknown) {
  if (!PROJECT_KINDS.has(kind)) return { projectId: null, leadId: null };
  if (typeof projectId === "string" && projectId) {
    const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, leadId: true } });
    if (p) return { projectId: p.id, leadId: p.leadId ?? (typeof leadId === "string" && leadId ? leadId : null) };
  }
  if (typeof leadId === "string" && leadId) {
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) return { projectId: null, leadId: null };
    const p = await db.project.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
    return { projectId: p?.id ?? null, leadId: lead.id };
  }
  return { projectId: null, leadId: null };
}

export const projectLeadSelect = { id: true, number: true, name: true, phone: true, funnelId: true, status: true, amount: true, currency: true } as const;

// Finance pages («Оплати» or «P&L»).
export async function financeGate() {
  const gate = await requireAccess();
  if ("error" in gate) return { error: gate.error };
  if (!canPage(gate.access, "pnl")) return { error: forbidden("Немає доступу до фінансів") };
  await ensureSchema();
  return { name: gate.access.name };
}


// ── Автосписання (співробітники, підписки) ──
// Every active item creates one expense per calendar month on its day (from the moment it was switched on).
// Runs lazily whenever the finance journal is read (at most once a minute per server instance).
export const RECURRING_BY = "Автосписання";
let lastRun = 0;
export async function runRecurring(force = false) {
  if (!force && Date.now() - lastRun < 60_000) return 0;
  lastRun = Date.now();
  await ensureSchema();
  const items = await db.recurring.findMany({ where: { active: true, payMode: "monthly" } });
  const now = new Date();
  let made = 0;
  for (const it of items) {
    const from = new Date(it.activeFrom);
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const every = everyOf(it.every);
    for (let y = from.getFullYear(), m = from.getMonth(); y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()); m === 11 ? (y++, m = 0) : m++) {
      if (!dueInMonth(every, it.month ?? from.getMonth() + 1, m)) continue; // quarterly / yearly — only in their months
      const last = new Date(y, m + 1, 0).getDate();
      const due = new Date(y, m, Math.min(Math.max(1, it.day), last), 12);
      if (due < fromDay || due > now) continue;
      const exists = await db.transaction.findFirst({
        where: { recurringId: it.id, date: { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) } },
        select: { id: true },
      });
      if (exists) continue;
      // a fixed hryvnia amount (card charges in $ / €) → its own rate; otherwise NBU of that day
      const rate = it.currency !== "UAH" && it.uahAmount && it.amount > 0 ? Math.round((it.uahAmount / it.amount) * 10000) / 10000 : await rateOn(it.currency, due);
      await db.transaction.create({
        data: {
          date: due, kind: "expense", amount: it.amount, currency: it.currency, rate,
          amountUah: Math.round(it.amount * rate * 100) / 100,
          accountId: it.accountId, counterparty: it.name,
          category: it.category ?? (it.type === "employee" ? "Команда / зарплата" : "Підписки / ПЗ"),
          comment: it.type === "employee" ? `Зарплата${it.role ? ` · ${it.role}` : ""}` : `Підписка${it.role ? ` · ${it.role}` : ""}`,
          recurringId: it.id, createdBy: RECURRING_BY,
        },
      });
      made++;
    }
  }
  return made;
}

// Validate a Recurring body (full for create, partial for update).
export async function parseRecurring(b: Record<string, unknown>, partial: boolean) {
  const fin = await getFinance();
  const data: Record<string, unknown> = {};
  if (!partial || b.type !== undefined) data.type = b.type === "employee" ? "employee" : "subscription";
  // per-project people: no amount / day / account, never written off automatically
  const project = b.payMode === "project";
  if (!partial || b.payMode !== undefined) data.payMode = project ? "project" : "monthly";
  if (project) {
    if (!partial || b.name !== undefined) {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name) return { error: "Вкажи ім'я" };
      data.name = name;
    }
    if (b.role !== undefined) data.role = typeof b.role === "string" && b.role.trim() ? b.role.trim() : null;
    if (b.note !== undefined) data.note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
    data.active = false;
    if (!partial) { data.amount = 0; data.currency = "UAH"; data.accountId = fin.accounts[0]?.id ?? ""; data.day = 10; }
    return { data };
  }
  if (!partial || b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) return { error: "Вкажи назву" };
    data.name = name;
  }
  if (b.role !== undefined) data.role = typeof b.role === "string" && b.role.trim() ? b.role.trim() : null;
  if (b.note !== undefined) data.note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
  if (!partial || b.amount !== undefined) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Вкажи суму більше нуля" };
    data.amount = amount;
  }
  if (!partial || b.currency !== undefined) data.currency = (CURRENCIES as readonly string[]).includes(String(b.currency)) ? b.currency : "UAH";
  if (!partial || b.accountId !== undefined) {
    if (!fin.accounts.some((a) => a.id === b.accountId)) return { error: "Вибери рахунок, з якого списувати" };
    data.accountId = b.accountId;
  }
  if (!partial || b.day !== undefined) data.day = Math.min(31, Math.max(1, Math.round(Number(b.day) || 10)));
  if (!partial || b.every !== undefined) data.every = everyOf(b.every);
  if (b.uahAmount !== undefined) data.uahAmount = Number(b.uahAmount) > 0 ? Math.round(Number(b.uahAmount) * 100) / 100 : null;
  if (b.month !== undefined) data.month = Number(b.month) >= 1 && Number(b.month) <= 12 ? Math.round(Number(b.month)) : null;
  if (b.category !== undefined) data.category = typeof b.category === "string" && b.category.trim() ? b.category.trim() : null;
  if (b.active !== undefined) data.active = !!b.active;
  return { data };
}



// ── Автоподатки ФОПів (ЄСВ, єдиний, військовий) ──
// Every active ФОП gets its fixed taxes as «Податок» operations on the 9th of every month (from `since`),
// so they land in the month that closes on the 10th. Marker in `recurringId`: "fop:<group>:<what>".
export const FOP_TAX_BY = "Автоподатки";
let lastTaxRun = 0;
export async function runFopTaxes(force = false) {
  if (!force && Date.now() - lastTaxRun < 60_000) return 0;
  lastTaxRun = Date.now();
  const fin = await getFinance();
  const now = new Date();
  let made = 0;
  for (const f of fin.fops) {
    if (!f.active || !f.accountId) continue;
    const parts = ([["esv", "ЄСВ", f.esv], ["single", "Єдиний податок", f.single], ["military", "Військовий збір", f.military]] as const).filter(([, , v]) => v > 0);
    if (!parts.length) continue;
    const since = new Date(`${f.since}T00:00`);
    for (let y = since.getFullYear(), m = since.getMonth(); y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()); m === 11 ? (y++, m = 0) : m++) {
      const due = new Date(y, m, TAX_DAY, 12);
      if (due < since || due > now) continue;
      for (const [key, label, amount] of parts) {
        const marker = `fop:${f.group}:${key}`;
        const exists = await db.transaction.findFirst({
          where: { recurringId: marker, date: { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) } },
          select: { id: true },
        });
        if (exists) continue;
        await db.transaction.create({
          data: {
            date: due, kind: "tax", amount, currency: "UAH", rate: 1, amountUah: amount,
            accountId: f.accountId, counterparty: "ДПС", category: label,
            comment: `${f.group} · ${label}`, recurringId: marker, createdBy: FOP_TAX_BY,
          },
        });
        made++;
      }
    }
  }
  return made;
}
