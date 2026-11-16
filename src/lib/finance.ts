// Finances («Оплати»): accounts, money journal, payment schedules of deals.
// Logic follows the company finance sheet:
//   • a month runs from the 10th to the 10th (period "2026-10" = 10.10 … 10.11). The owners split the money
//     (dividends) around the 10th and that closes the month: on the 10th, everything before the split is the
//     old month, everything after it is the new one (no split yet → still the old month);
//   • every operation is converted to UAH at the rate of its date;
//   • 6% tax only on income to a ФОП account that is not «2 група»;
//   • fixed monthly taxes (ЄСВ × ФОПів + єдиний + військовий) are accrued every month;
//   • crypto («поза банком») counts in P&L like any money, it is only shown apart on «Рахунки»;
//   • «Сплатили податки» moves money off an account but is not a P&L cost (taxes are accrued above);
//   • a project's profit = received − its 6% tax − contractors − expenses booked on it;
//     business expenses without a project are overhead: they hit company P&L, not a project margin.
// Shared by the server and the client.

export type TxKind = "income" | "contractor" | "expense" | "tax" | "transfer" | "owner";

export const TX_KINDS: { key: TxKind; label: string; short: string; color: string; sign: 1 | -1 | 0 }[] = [
  { key: "income", label: "Отримали оплату", short: "Дохід", color: "#22c55e", sign: 1 },
  { key: "contractor", label: "Оплатили підряднику", short: "Підрядник", color: "#ef4444", sign: -1 },
  { key: "expense", label: "Витрати бізнесу", short: "Витрати", color: "#f97316", sign: -1 },
  { key: "tax", label: "Сплатили податки", short: "Податки", color: "#eab308", sign: -1 },
  { key: "transfer", label: "Переказ між рахунками", short: "Переказ", color: "#38bdf8", sign: 0 },
  { key: "owner", label: "Дивіденди власникам", short: "Дивіденди", color: "#a855f7", sign: -1 },
];
// Quick types of the operation form and the «Тип» column of the cashflow (kind + fixed category).
export type TxPreset = "income" | "acquiring" | "contractor" | "expense" | "tax" | "owner" | "ads" | "transfer";
export const TX_PRESETS: { key: TxPreset; label: string; short: string; kind: TxKind; category?: string; color: string; group: "in" | "out" | "move" }[] = [
  { key: "income", label: "Дохід (проєкт)", short: "Дохід", kind: "income", color: "#22c55e", group: "in" },
  { key: "acquiring", label: "Еквайринг", short: "Еквайринг", kind: "income", category: "Еквайринг", color: "#4ade80", group: "in" },
  { key: "contractor", label: "Витрата (підряд)", short: "Підряд", kind: "contractor", color: "#ef4444", group: "out" },
  { key: "expense", label: "Витрата (бізнес)", short: "Бізнес", kind: "expense", color: "#f97316", group: "out" },
  { key: "ads", label: "Реклама", short: "Реклама", kind: "expense", category: "Реклама", color: "#ec4899", group: "out" },
  { key: "tax", label: "Податок", short: "Податок", kind: "tax", color: "#eab308", group: "out" },
  { key: "owner", label: "Дивіденди", short: "Дивіденди", kind: "owner", color: "#a855f7", group: "out" },
  { key: "transfer", label: "Переказ між рахунками", short: "Переказ", kind: "transfer", color: "#38bdf8", group: "move" },
];
export const PRESET_META = Object.fromEntries(TX_PRESETS.map((p) => [p.key, p])) as Record<TxPreset, (typeof TX_PRESETS)[number]>;
export function presetOf(t: { kind: string; category?: string | null }): TxPreset {
  if (t.kind === "income") return t.category === "Еквайринг" ? "acquiring" : "income";
  if (t.kind === "expense") return t.category === "Реклама" ? "ads" : "expense";
  return (t.kind in { contractor: 1, tax: 1, owner: 1, transfer: 1 } ? t.kind : "expense") as TxPreset;
}

export const TX_META = Object.fromEntries(TX_KINDS.map((k) => [k.key, k])) as Record<TxKind, (typeof TX_KINDS)[number]>;
export const isTxKind = (v: unknown): v is TxKind => typeof v === "string" && v in TX_META;

export const CURRENCIES = ["UAH", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type AccountKind = "fop" | "paypal" | "crypto" | "card" | "company" | "other";
export const ACCOUNT_KINDS: { key: AccountKind; label: string; color: string }[] = [
  { key: "fop", label: "ФОП", color: "#C98C0A" },
  { key: "company", label: "Гроші компанії", color: "#22c55e" },
  { key: "card", label: "Карти", color: "#a78bfa" },
  { key: "paypal", label: "PayPal", color: "#60a5fa" },
  { key: "crypto", label: "Крипта", color: "#f97316" },
  { key: "other", label: "Інше", color: "#a1a1aa" },
];
export const KIND_META = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.key, k])) as Record<AccountKind, (typeof ACCOUNT_KINDS)[number]>;

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  group: string;      // «ФОП Копча Артур», «Гроші компанії», «Карти»…
  start: number;      // стартовий залишок (у валюті рахунку)
  tax6: boolean;      // 6% з надходжень (ФОП 3 групи)
  offBooks: boolean;  // поза обліком (крипта)
  archived?: boolean;
  kind?: AccountKind;       // для іконок і групування
  anyCurrency?: boolean;    // приймає будь-яку валюту, рахується в гривні (PayPal)
  requisites?: string;      // старі реквізити одним текстом (не використовується)
  req?: Requisites;         // реквізити рахунку — показ, копіювання, інвойс
  invoiceNo?: number;       // номер останнього інвойсу на цей рахунок
}

// Requisites of an account: what a client needs to pay + what goes into the invoice.
export interface Requisites {
  receiver?: string;  // Одержувач / Receiver
  iban?: string;
  swift?: string;
  taxId?: string;     // ЄДРПОУ / ІПН
  address?: string;
  wallet?: string;    // крипто-адреса
  network?: string;   // TRC 20…
  purpose?: string;   // призначення платежу
  note?: string;      // примітка для клієнта
  signName?: string;  // ім'я в інвойсі (KOPCHA ARTUR)
  phone?: string;
  email?: string;
}
export const REQ_KEYS = ["receiver", "iban", "swift", "taxId", "address", "wallet", "network", "purpose", "note", "signName", "phone", "email"] as const;
export interface Payer { name: string; details: string }
function normReq(v: unknown): Requisites | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Requisites = {};
  for (const k of REQ_KEYS) { const x = (v as Record<string, unknown>)[k]; if (typeof x === "string" && x.trim()) out[k] = x; }
  return Object.keys(out).length ? out : undefined;
}

export function inferKind(a: Pick<Account, "name" | "group" | "offBooks">): AccountKind {
  if (a.offBooks || /крипт/i.test(a.name)) return "crypto";
  if (/^фоп/i.test(a.group)) return "fop";
  if (/paypal/i.test(a.name)) return "paypal";
  if (/компан/i.test(a.name) || /компан/i.test(a.group)) return "company";
  if (/карт/i.test(a.name)) return "card";
  return "other";
}
export const kindOf = (a: Account): AccountKind => a.kind ?? inferKind(a);

// Monthly taxes of one ФОП (all its accounts share one group): written off automatically on the 9th,
// so they land in the month that closes on the 10th.
export interface FopTax {
  group: string;      // група рахунків («ФОП Артур»)
  accountId: string;  // з якого рахунку списувати
  esv: number;        // ЄСВ
  single: number;     // єдиний податок (2 група)
  military: number;   // військовий збір (2 група)
  fopGroup: 2 | 3;    // група ФОП
  limit: number;      // річний ліміт доходу (до переходу на загальну систему)
  active: boolean;
  since: string;      // yyyy-mm-dd — з якого дня списувати
}

export interface FinanceSettings {
  accounts: Account[];
  fops: FopTax[];
  taxRealFrom: string;            // з цього місяця податки — реальні операції (попап 6%, автосписання 9-го); раніше — нараховувались
  monthStartDay: number;          // 10 → місяць з 10-го по 10-те (виплати власникам 10-го — у попередній місяць)
  taxes: { esv: number; fops: number; single: number; military: number }; // фіксовані за місяць, грн
  plan: Record<string, number>;   // план чистого прибутку на місяць ("2026-10" → 265000)
  planTurnover: Record<string, number>; // план обороту (усі надходження) на місяць
  planIncome: Record<string, number>;   // план доходу (оборот − витрати) на місяць
  planProjects: Record<string, number>; // план: скільки нових проєктів закрити за місяць
  planCheck: Record<string, number>;    // план середнього чеку проєкту, ₴
  owners: string[];
  categories: string[];           // категорії витрат бізнесу
  contractors: string[];          // підрядники (випадаючий список «Кому»)
  adPlatforms: string[];          // рекламні майданчики (Meta, Google…)
  payers: Payer[];                // клієнти з інвойсів (Payer: назва + реквізити)
}

export const FINANCE_KEY = "finance";

// what a tax operation is (кешфлоу → «Податок»)
export const TAX6_CAT = "Податок 6%";
export const TAX_CATS = [TAX6_CAT, "ЄСВ", "Єдиний податок", "Військовий збір", "Інше"];
export const ACQUIRING = "Еквайринг";
export const CONV_CAT = "Конвертація";       // internal: EUR / USD ФОП → UAH ФОП
export const WD_CAT = "Вивід з ФОП";         // internal: UAH ФОП → company card
export const ADS_CAT = "Реклама";
export const TAX_DAY = 9;               // фіксовані податки списуються 9-го — у місяць, що закривається 10-го
export const TAX_REAL_FROM = "2026-11";
export const FOP_TAX_SINCE = "2026-11-10";
// річні ліміти доходу ФОП на 2026 рік: 834 / 1167 мінімальних зарплат (8 647 ₴ на 01.01.2026); редагуються в «Рахунках»
export const FOP_LIMIT = { 2: 7_211_598, 3: 10_091_049 } as const;

export const DEFAULT_CATEGORIES = ["Реклама", "Підписки / ПЗ", "Зв'язок", "Команда / зарплата", "Бухгалтерія", "Офіс / техніка", "Банк / комісії", "Інше"];
// постійні витрати — те, що платимо з місяця в місяць незалежно від проєктів (решта — змінні)
export const FIXED_CATS = ["Підписки / ПЗ", "Зв'язок", "Бухгалтерія", "Офіс / техніка", "Банк / комісії"];

const acc = (id: string, name: string, currency: Currency, group: string, extra: Partial<Account> = {}): Account =>
  ({ id, name, currency, group, start: 0, tax6: false, offBooks: false, ...extra });

export function defaultFinance(): FinanceSettings {
  return {
    accounts: [
      acc("a_art_uah", "ФОП Копча Артур", "UAH", "ФОП Копча Артур", { tax6: true, kind: "fop" }),
      acc("a_art_usd", "ФОП Копча Артур", "USD", "ФОП Копча Артур", { tax6: true, kind: "fop" }),
      acc("a_art_eur", "ФОП Копча Артур", "EUR", "ФОП Копча Артур", { tax6: true, kind: "fop" }),
      acc("a_vit_fop2", "ФОП Гураль Віталій", "UAH", "ФОП Гураль Віталій", { kind: "fop" }),
      acc("a_paypal", "PayPal Копча Артур", "UAH", "PayPal", { kind: "paypal", anyCurrency: true }),
      acc("a_vit_crypto", "Крипта Гураль Віталій", "USD", "Крипта", { offBooks: true, kind: "crypto" }),
      acc("a_art_crypto", "Крипта Копча Артур", "USD", "Крипта", { offBooks: true, kind: "crypto" }),
      acc("a_card_art", "Карта Копча Артур", "UAH", "Карти", { kind: "card" }),
      acc("a_card_vit", "Карта Гураль Віталій", "UAH", "Карти", { kind: "card" }),
      acc("a_card_alina", "Карта Аліна Чопей", "UAH", "Карти", { kind: "card" }),
      acc("a_card_larysa", "Карта Гураль Лариса", "UAH", "Карти", { kind: "card" }),
      acc("a_comp_art", "Гроші компанії «Артур»", "UAH", "Гроші компанії", { kind: "company" }),
      acc("a_comp_vit", "Гроші компанії «Віталій»", "UAH", "Гроші компанії", { kind: "company" }),
    ],
    fops: [],
    taxRealFrom: TAX_REAL_FROM,
    monthStartDay: 10,
    taxes: { esv: 1922.34, fops: 2, single: 1729.4, military: 864.7 },
    plan: {},
    planTurnover: {},
    planIncome: {},
    planProjects: {},
    planCheck: {},
    owners: ["Артур Копча", "Віталій Гураль"],
    categories: DEFAULT_CATEGORIES,
    contractors: ["Андрій", "Лідія", "Аліна"],
    adPlatforms: ["Meta", "Google", "TikTok"],
    payers: [],
  };
}

const strList = (v: unknown, d: string[]) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))] : d;
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function normalizeFinance(raw: unknown): FinanceSettings {
  const d = defaultFinance();
  if (!raw || typeof raw !== "object") return d;
  const v = raw as Partial<FinanceSettings>;
  const accounts = Array.isArray(v.accounts)
    ? v.accounts.filter((a) => a && typeof a.id === "string" && typeof a.name === "string").map((a) => ({
        id: a.id,
        name: a.name.trim() || "Рахунок",
        currency: (CURRENCIES as readonly string[]).includes(a.currency) ? a.currency : "UAH",
        group: typeof a.group === "string" && a.group.trim() ? a.group.trim() : "Інше",
        start: num(a.start),
        tax6: !!a.tax6,
        offBooks: !!a.offBooks,
        archived: !!a.archived,
        kind: ACCOUNT_KINDS.some((k) => k.key === a.kind) ? a.kind : inferKind({ name: a.name, group: a.group ?? "", offBooks: !!a.offBooks }),
        anyCurrency: !!a.anyCurrency,
        requisites: typeof a.requisites === "string" ? a.requisites : "",
        req: normReq(a.req),
        invoiceNo: num(a.invoiceNo),
      }))
    : d.accounts;
  const t = (v.taxes ?? {}) as Partial<FinanceSettings["taxes"]>;
  const planOf = (src: unknown) => {
    const out: Record<string, number> = {};
    if (src && typeof src === "object") for (const [k, x] of Object.entries(src)) if (/^\d{4}-\d{2}$/.test(k) && typeof x === "number" && Number.isFinite(x)) out[k] = x;
    return out;
  };
  const plan = planOf(v.plan);
  const accs = accounts.length ? accounts : d.accounts;
  return {
    accounts: accs,
    fops: normalizeFops(v.fops, accs),
    taxRealFrom: typeof v.taxRealFrom === "string" && /^\d{4}-\d{2}$/.test(v.taxRealFrom) ? v.taxRealFrom : TAX_REAL_FROM,
    monthStartDay: Math.min(28, Math.max(1, Math.round(num(v.monthStartDay, d.monthStartDay)))),
    taxes: { esv: num(t.esv, d.taxes.esv), fops: num(t.fops, d.taxes.fops), single: num(t.single, d.taxes.single), military: num(t.military, d.taxes.military) },
    plan,
    planTurnover: planOf(v.planTurnover),
    planIncome: planOf(v.planIncome),
    planProjects: planOf(v.planProjects),
    planCheck: planOf(v.planCheck),
    owners: Array.isArray(v.owners) ? v.owners.filter((x): x is string => typeof x === "string" && !!x.trim()) : d.owners,
    categories: strList(v.categories, d.categories),
    contractors: strList(v.contractors, d.contractors),
    adPlatforms: strList(v.adPlatforms, d.adPlatforms),
    payers: Array.isArray(v.payers)
      ? v.payers.filter((x) => x && typeof x.name === "string" && x.name.trim()).map((x) => ({ name: x.name.trim(), details: typeof x.details === "string" ? x.details : "" }))
      : [],
  };
}

// ФОП groups = account groups whose name starts with «ФОП». 2nd group (no 6%) also pays єдиний + військовий.
export function defaultFop(group: string, accounts: Account[]): FopTax {
  const list = accounts.filter((a) => a.group === group && !a.archived);
  const second = !list.some((a) => a.tax6);
  const pay = list.find((a) => a.currency === "UAH") ?? list[0];
  return {
    group, accountId: pay?.id ?? "", esv: 1902.34, single: second ? 1729.4 : 0, military: second ? 864.7 : 0,
    fopGroup: second ? 2 : 3, limit: second ? FOP_LIMIT[2] : FOP_LIMIT[3], active: true, since: FOP_TAX_SINCE,
  };
}
export const fopGroups = (accounts: Account[]) => [...new Set(accounts.filter((a) => !a.archived && /^фоп/i.test(a.group)).map((a) => a.group))];

function normalizeFops(raw: unknown, accounts: Account[]): FopTax[] {
  const list = Array.isArray(raw) ? raw : [];
  return fopGroups(accounts).map((g) => {
    const d = defaultFop(g, accounts);
    const x = list.find((f) => f && typeof f === "object" && (f as FopTax).group === g) as Partial<FopTax> | undefined;
    if (!x) return d;
    return {
      group: g,
      accountId: accounts.some((a) => a.id === x.accountId) ? x.accountId! : d.accountId,
      esv: num(x.esv, d.esv), single: num(x.single, d.single), military: num(x.military, d.military),
      fopGroup: x.fopGroup === 2 || x.fopGroup === 3 ? x.fopGroup : d.fopGroup,
      limit: num(x.limit, d.limit),
      active: x.active === undefined ? true : !!x.active,
      since: typeof x.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.since) ? x.since : d.since,
    };
  });
}

// legacy accrual (months before `taxRealFrom`)
// Name of a project (deal of «Операційка»): its own project name, else the linked sheet project, else «Проєкт #N».
// The deal's `name` is the contact person.
export const projectTitle = (d: { number: number; projectName?: string | null }, sheetName?: string | null) =>
  d.projectName?.trim() || sheetName?.trim() || `Проєкт #${d.number}`;

// Short account name for tables: «Гроші компанії (біла карта Віталія)» → «Біла · Віталій», «Артур ФОП UAH» → «ФОП Артур».
export function accountShort(a: Pick<Account, "name" | "group" | "currency">): string {
  const card = /біла карта\s+([^\s)]+)/i.exec(a.name);
  if (card) return `Біла · ${card[1].replace(/ія$/i, "ій")}`;
  const comp = /^гроші компанії\s*[«"(]?([^»")]+)[»")]?/i.exec(a.name);
  if (comp) return `Компанія · ${comp[1].trim()}`;
  return a.name.replace(/\s*\b(UAH|EUR|USD)\b/g, "").replace(/\s*\d\s*група/i, "").trim() || a.name;
}

export const fixedTaxes = (f: FinanceSettings) => f.taxes.esv * f.taxes.fops + f.taxes.single + f.taxes.military;

// ── periods: a month runs from `startDay` to `startDay - 1` of the next month ──

export function periodOf(date: Date | string, startDay = 10): string {
  const d = new Date(date);
  let y = d.getFullYear();
  let m = d.getMonth(); // 0-based
  if (d.getDate() < startDay) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function periodRange(period: string, startDay = 10): { from: Date; to: Date } {
  const [y, m] = period.split("-").map(Number);
  return { from: new Date(y, m - 1, startDay), to: new Date(y, m, startDay) }; // [from, to)
}

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function shiftPeriod(period: string, by: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── money ──

export function fmtMoney(v: number, currency: string = "UAH", digits = 0): string {
  const sign = v < 0 ? "−" : "";
  const s = Math.abs(v).toLocaleString("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ /g, " ");
  const sym = currency === "UAH" ? "₴" : currency === "EUR" ? "€" : currency === "USD" ? "$" : currency;
  return currency === "UAH" ? `${sign}${s} ${sym}` : `${sign}${sym}${s}`;
}

export interface TxLike {
  id?: string;
  date: string | Date;
  kind: string;
  amount: number;
  currency: string;
  amountUah: number;
  accountId: string;
  toAccountId?: string | null;
  leadId?: string | null;
  projectId?: string | null;
  category?: string | null;
  period?: string | null;
  createdAt?: string | Date | null;
  autoPeriod?: string;   // month worked out by assignPeriods() (needs the whole journal)
}

// Month of a single operation without the rest of the journal (dividends on the 10th close the old month,
// anything else on the 10th counts as the old month until we know the split already happened).
export function autoPeriod(kind: string, date: Date | string, startDay = 10): string {
  const p = periodOf(date, startDay);
  return new Date(date).getDate() === startDay ? shiftPeriod(p, -1) : p;
}
export const txPeriod = (t: TxLike, startDay = 10) => t.period || t.autoPeriod || autoPeriod(t.kind, t.date, startDay);

// order of operations in time: date, then when it was entered
const orderKey = (t: Pick<TxLike, "date" | "createdAt">) => [new Date(t.date).getTime(), t.createdAt ? new Date(t.createdAt).getTime() : 0] as const;
const after = (a: readonly [number, number], b: readonly [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

// Moment of the dividend split that closes `old` (first dividend paid for it within 5 days before the boundary 10th, or on it).
function splitMoment(txs: TxLike[], old: string, startDay: number): readonly [number, number] | null {
  const boundary = periodRange(old, startDay).to; // 10th 00:00 of the next month
  const fromT = boundary.getTime() - 5 * 86_400_000;
  const toT = boundary.getTime() + 86_400_000;
  let best: readonly [number, number] | null = null;
  for (const t of txs) {
    if (t.kind !== "owner") continue;
    const d = new Date(t.date).getTime();
    if (d < fromT || d >= toT) continue;
    if ((t.period || periodOf(new Date(d - (new Date(d).getDate() === startDay ? 86_400_000 : 0)), startDay)) !== old) continue;
    const k = orderKey(t);
    if (!best || after(best, k)) best = k;
  }
  return best;
}

// Month of every operation of the journal (sets `autoPeriod`). On the 10th: before the split → old month, after → new.
export function assignPeriods<T extends TxLike>(txs: T[], startDay = 10): T[] {
  const cache = new Map<string, readonly [number, number] | null>();
  return txs.map((t) => {
    if (t.period) return t;
    const d = new Date(t.date);
    const base = periodOf(d, startDay);
    if (d.getDate() !== startDay) return { ...t, autoPeriod: base };
    const old = shiftPeriod(base, -1);
    if (t.kind === "owner") return { ...t, autoPeriod: old };
    if (!cache.has(old)) cache.set(old, splitMoment(txs, old, startDay));
    const split = cache.get(old)!;
    return { ...t, autoPeriod: split && after(orderKey(t), split) ? base : old };
  });
}

// Month for a new operation dated `date` (entered now), given the journal.
export function periodForNew(txs: TxLike[], kind: string, date: Date, startDay = 10): { period: string; boundary: boolean; split: boolean } {
  const base = periodOf(date, startDay);
  if (date.getDate() !== startDay) return { period: base, boundary: false, split: false };
  const old = shiftPeriod(base, -1);
  if (kind === "owner") return { period: old, boundary: true, split: false };
  const split = !!splitMoment(txs, old, startDay);
  return { period: split ? base : old, boundary: true, split };
}

// «з 10-го по 10-те» — the month rule in words, for hints.
export const periodRule = (startDay = 10) => `місяць — з ${startDay}-го по ${startDay}-те: ${startDay}-го ділимо гроші, ці виплати власникам ідуть у місяць, що закривається`;

type TaxFin = Pick<FinanceSettings, "accounts" | "taxRealFrom" | "monthStartDay">;
const realTax = (t: TxLike, fin: TaxFin) => t.kind === "tax" && txPeriod(t, fin.monthStartDay) >= fin.taxRealFrom;
const isTax6 = (t: TxLike) => t.category === TAX6_CAT;

// Should this income get a 6% tax operation? (ФОП 3 групи, from the month taxes are real operations)
export function needsTax6(t: TxLike, fin: TaxFin): boolean {
  if (t.kind !== "income") return false;
  const a = fin.accounts.find((x) => x.id === t.accountId);
  return !!a?.tax6 && txPeriod(t, fin.monthStartDay) >= fin.taxRealFrom;
}

// Accrued 6% of an income to a ФОП 3 групи account — only for months before taxes became real operations.
export function txTax(t: TxLike, fin: TaxFin): number {
  if (t.kind !== "income" || txPeriod(t, fin.monthStartDay) >= fin.taxRealFrom) return 0;
  const a = fin.accounts.find((x) => x.id === t.accountId);
  return a?.tax6 ? Math.round(t.amountUah * 6) / 100 : 0;
}

// Balance of every account in its own currency (start + incoming − outgoing; transfers both ways).
export function accountBalances(accounts: Account[], txs: TxLike[], rates: { EUR: number; USD: number }): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(accounts.map((a) => [a.id, a.start]));
  const inCur = (t: TxLike, cur: string) =>
    t.currency === cur ? t.amount : cur === "UAH" ? t.amountUah : t.amountUah / (cur === "EUR" ? rates.EUR : rates.USD);
  for (const t of txs) {
    const from = accounts.find((a) => a.id === t.accountId);
    if (from) out[from.id] += (t.kind === "income" ? 1 : -1) * inCur(t, from.currency);
    if (t.kind === "transfer" && t.toAccountId) {
      const to = accounts.find((a) => a.id === t.toAccountId);
      if (to) out[to.id] += inCur(t, to.currency);
    }
  }
  return out;
}

export interface PeriodTotals {
  income: number;
  contractor: number;
  expense: number;
  owner: number;
  tax6: number;     // 6% з ФОП 3 групи
  taxFixed: number; // ЄСВ + єдиний + військовий за місяці
  tax: number;      // tax6 + taxFixed
  taxPaid: number;  // сплачено до taxRealFrom (рух грошей, не витрата P&L — тоді податки нараховувались)
  costs: number;    // contractor + expense + tax
  profit: number;   // income − costs  (= дивіденди, які можна поділити)
  // P&L by projects: projects («Операційка») → their margin → other company costs → profit
  projIncome: number;     // оплати проєктів
  otherIncome: number;    // надходження без проєкту
  projContractor: number; // підрядники проєктів
  projExpense: number;    // витрати, записані на проєкти
  compContractor: number; // підрядники без проєкту (команда, PM…)
  compExpense: number;    // інші витрати компанії
  margin: number;         // income − projContractor − projExpense − tax6
}

const onProject = (t: TxLike) => !!(t.leadId || t.projectId);

// Totals of a set of operations (UAH, crypto included). `fixedMonths` — how many months of fixed taxes to accrue.
export function totals(txs: TxLike[], fin: FinanceSettings, fixedMonths: number): PeriodTotals {
  const sum = (k: TxKind, proj?: boolean) => txs.filter((t) => t.kind === k && (proj === undefined || onProject(t) === proj)).reduce((s, t) => s + t.amountUah, 0);
  const income = sum("income");
  const contractor = sum("contractor");
  const expense = sum("expense");
  const owner = sum("owner");
  // taxes: accrued before `taxRealFrom`, real operations («Податок») from it
  let real6 = 0, realFixed = 0, taxPaid = 0;
  for (const t of txs) {
    if (t.kind !== "tax") continue;
    if (!realTax(t, fin)) taxPaid += t.amountUah;
    else if (isTax6(t)) real6 += t.amountUah;
    else realFixed += t.amountUah;
  }
  const tax6 = txs.reduce((s, t) => s + txTax(t, fin), 0) + real6;
  const taxFixed = fixedTaxes(fin) * Math.max(0, fixedMonths) + realFixed;
  const tax = tax6 + taxFixed;
  const costs = contractor + expense + tax;
  const projContractor = sum("contractor", true);
  const projExpense = sum("expense", true);
  return {
    income, contractor, expense, owner, tax6, taxFixed, tax, taxPaid, costs, profit: income - costs,
    projIncome: sum("income", true), otherIncome: sum("income", false),
    projContractor, projExpense, compContractor: contractor - projContractor, compExpense: expense - projExpense,
    margin: income - projContractor - projExpense - tax6,
  };
}

// Periods from `from` to `to` inclusive ("2026-08" … "2026-11").
export function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to && out.length < 240; p = shiftPeriod(p, 1)) out.push(p);
  return out;
}

// First month with any operation (null when the journal is empty).
export function firstPeriod(txs: TxLike[], startDay = 10): string | null {
  let min: string | null = null;
  for (const t of txs) { const p = txPeriod(t, startDay); if (!min || p < min) min = p; }
  return min;
}

// Months of accrued fixed taxes in a range: from the first operation up to the current one, before taxes became real.
export function fixedMonthsIn(periods: string[], first: string | null, current: string, realFrom = TAX_REAL_FROM): number {
  if (!first) return 0;
  return periods.filter((p) => p >= first && p <= current && p < realFrom).length;
}

// ── projects ──

export interface ProjectMoney {
  income: number;
  tax: number;        // 6% з надходжень проєкту
  contractor: number;
  expense: number;    // витрати бізнесу, записані на проєкт
  costs: number;      // contractor + expense
  cash: number;       // прибуток по касі = income − tax − costs
}

export function projectMoney(txs: TxLike[], fin: TaxFin): ProjectMoney {
  let income = 0, tax = 0, contractor = 0, expense = 0;
  for (const t of txs) {
    if (t.kind === "income") { income += t.amountUah; tax += txTax(t, fin); }
    else if (t.kind === "tax" && realTax(t, fin)) tax += t.amountUah;
    else if (t.kind === "contractor") contractor += t.amountUah;
    else if (t.kind === "expense") expense += t.amountUah;
  }
  const costs = contractor + expense;
  return { income, tax, contractor, expense, costs, cash: income - tax - costs };
}

// ── payment schedule of a deal ──

export interface StageLike {
  id: string;
  idx: number;
  title?: string | null;
  amount: number;
  dueDate: string | null;
  paidAt: string | null;
  note?: string | null;
}

export type StageStatus = "paid" | "overdue" | "soon" | "future";

export const STAGE_STATUS: Record<StageStatus, { label: string; color: string }> = {
  paid: { label: "Отримано", color: "#22c55e" },
  overdue: { label: "Прострочено", color: "#ef4444" },
  soon: { label: "Очікуємо", color: "#eab308" },
  future: { label: "Майбутня", color: "#60a5fa" },
};

// like the sheet: paid → overdue (date passed) → soon (≤ 14 days) → future
export function stageStatus(s: Pick<StageLike, "paidAt" | "dueDate">, now = new Date()): StageStatus {
  if (s.paidAt) return "paid";
  if (!s.dueDate) return "future";
  const d = new Date(s.dueDate);
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d < day) return "overdue";
  return d.getTime() - day.getTime() <= 14 * 86_400_000 ? "soon" : "future";
}

export interface PaymentSummary {
  count: number;
  paidCount: number;
  paid: number;
  left: number;
  planned: number;
  next: StageLike | null;
  overdue: number;
  matchesTotal: boolean | null; // schedule sum == deal amount (null when the deal has no amount)
}

export function paymentSummary(stages: StageLike[], total: number | null | undefined): PaymentSummary {
  const sorted = [...stages].sort((a, b) => a.idx - b.idx);
  const paidList = sorted.filter((s) => s.paidAt);
  const paid = paidList.reduce((s, x) => s + x.amount, 0);
  const planned = sorted.reduce((s, x) => s + x.amount, 0);
  const next = sorted.find((s) => !s.paidAt) ?? null;
  const overdue = sorted.filter((s) => stageStatus(s) === "overdue").reduce((s, x) => s + x.amount, 0);
  const base = total ?? planned;
  return {
    count: sorted.length,
    paidCount: paidList.length,
    paid,
    left: Math.max(0, base - paid),
    planned,
    next,
    overdue,
    matchesTotal: total ? Math.round(planned) === Math.round(total) : null,
  };
}

export function newId(prefix = "a"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// ── Periodicity of automatic write-offs (subscriptions / salaries) ──
export type Every = "month" | "quarter" | "year";
export const EVERY: { key: Every; label: string; short: string; perYear: number }[] = [
  { key: "month", label: "Щомісяця", short: "міс", perYear: 12 },
  { key: "quarter", label: "Щокварталу", short: "кв", perYear: 4 },
  { key: "year", label: "Щороку", short: "рік", perYear: 1 },
];
export const everyOf = (v: unknown): Every => (v === "quarter" || v === "year" ? v : "month");
// is a write-off due in month m (0–11)? anchor = month of the write-off (1–12) for quarter / year
export function dueInMonth(every: Every, anchor: number | null | undefined, m: number): boolean {
  if (every === "month") return true;
  const a = ((anchor ?? 1) - 1 + 12) % 12;
  return every === "year" ? m === a : (m - a + 12) % 3 === 0;
}
