// Lead filter used by the Bitrix-style search panel on the «Ліди» page.
// Every filterable lead field is described once in FILTER_FIELDS (label, section, type).
// The client keeps a LeadFilter, turns it into FilterQuery and sends it as ?f=<json>;
// the server maps it to Prisma (src/lib/leadFilterServer.ts).

import {
  LEAD_SOURCES, LEAD_SERVICES, COMMUNICATION_CHANNELS, PAYMENT_SYSTEMS, UPSELL_SERVICES, PUSH_STAGES, CALENDAR_STATUSES,
} from "@/lib/leadOptions";

export type AmountOp = "eq" | "gt" | "lt" | "range";
export type DatePreset = "" | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "range";
export type BoolValue = "" | "yes" | "no";

export interface DateFilter {
  preset: DatePreset;
  from: string; // yyyy-mm-dd (for "range")
  to: string;
}
export interface AmountFilter {
  op: AmountOp;
  from: string;
  to: string;
}

export type FieldType = "text" | "multi" | "date" | "amount" | "bool";
export type FieldSection = "lead" | "contact" | "marketing" | "dates" | "work";

export interface FilterFieldDef {
  key: string;
  label: string;
  section: FieldSection;
  type: FieldType;
  options?: string[];       // for "multi" with a fixed list (stages/reasons come from the funnel)
  placeholder?: string;
}

export const FIELD_SECTIONS: { key: FieldSection; label: string }[] = [
  { key: "lead", label: "Лід" },
  { key: "contact", label: "Контакт" },
  { key: "marketing", label: "Маркетинг" },
  { key: "dates", label: "Дати" },
  { key: "work", label: "Справи та пуші" },
];

export const FILTER_FIELDS: FilterFieldDef[] = [
  // Лід
  { key: "name", label: "Імʼя / назва", section: "lead", type: "text" },
  { key: "stages", label: "Стадії", section: "lead", type: "multi" },
  { key: "amount", label: "Сума", section: "lead", type: "amount" },
  { key: "reasons", label: "Причина закриття", section: "lead", type: "multi" },
  { key: "services", label: "Послуга", section: "lead", type: "multi", options: LEAD_SERVICES },
  { key: "niche", label: "Ніша", section: "lead", type: "text" },
  { key: "comment", label: "Коментар", section: "lead", type: "text" },
  { key: "tags", label: "Тег", section: "lead", type: "text", placeholder: "Точна назва тегу" },
  { key: "siteStructure", label: "Структура сайту", section: "lead", type: "text" },
  { key: "paymentSystems", label: "Платіжна система", section: "lead", type: "multi", options: PAYMENT_SYSTEMS },
  { key: "hasExtraLang", label: "Додаткова мова", section: "lead", type: "bool" },
  { key: "languages", label: "Мови", section: "lead", type: "text" },
  { key: "usedServices", label: "Клієнт використовує", section: "lead", type: "multi", options: UPSELL_SERVICES },
  { key: "projectDeadline", label: "Дедлайн проєкту", section: "lead", type: "text" },
  // Контакт
  { key: "phone", label: "Телефон", section: "contact", type: "text", placeholder: "Можна кінець номера, напр. 4501" },
  { key: "telegram", label: "Telegram", section: "contact", type: "text" },
  { key: "instagram", label: "Instagram", section: "contact", type: "text" },
  { key: "email", label: "Email", section: "contact", type: "text" },
  { key: "messengers", label: "Месенджер", section: "contact", type: "multi", options: COMMUNICATION_CHANNELS },
  { key: "geo", label: "Місто / гео", section: "contact", type: "text" },
  // Маркетинг
  { key: "sources", label: "Джерело", section: "marketing", type: "multi", options: LEAD_SOURCES.map((s) => s.value) },
  { key: "campaign", label: "Кампанія", section: "marketing", type: "text" },
  // Дати
  { key: "created", label: "Дата створення", section: "dates", type: "date" },
  { key: "updated", label: "Дата оновлення", section: "dates", type: "date" },
  { key: "closed", label: "Дата закриття", section: "dates", type: "date" },
  { key: "won", label: "Дата виграшу", section: "dates", type: "date" },
  { key: "lost", label: "Дата програшу", section: "dates", type: "date" },
  { key: "pushAt", label: "Дата пушу", section: "dates", type: "date" },
  { key: "calendarAt", label: "Подія в календарі", section: "dates", type: "date" },
  { key: "remindAt", label: "Нагадування", section: "dates", type: "date" },
  // Справи та пуші
  { key: "hasTasks", label: "Є справи", section: "work", type: "bool" },
  { key: "pushStages", label: "Етап пушу", section: "work", type: "multi", options: PUSH_STAGES },
  { key: "calendarStatuses", label: "Статус події календаря", section: "work", type: "multi", options: CALENDAR_STATUSES },
];

export const FIELD_BY_KEY: Record<string, FilterFieldDef> = Object.fromEntries(FILTER_FIELDS.map((f) => [f.key, f]));

export const DEFAULT_FILTER_FIELDS = ["stages", "name", "phone", "amount", "created", "closed", "sources", "campaign", "services"];

export const EMPTY_DATE: DateFilter = { preset: "", from: "", to: "" };
export const EMPTY_AMOUNT: AmountFilter = { op: "eq", from: "", to: "" };

export type FieldValue = string | string[] | DateFilter | AmountFilter;

export interface LeadFilter {
  // legacy (older saved filters): "", "active", "closed", "win", "loss"
  group: string;
  values: Record<string, FieldValue>;
}

export const EMPTY_FILTER: LeadFilter = { group: "", values: {} };

export function emptyValue(def: FilterFieldDef): FieldValue {
  switch (def.type) {
    case "multi": return [];
    case "date": return EMPTY_DATE;
    case "amount": return EMPTY_AMOUNT;
    default: return "";
  }
}

export function isValueSet(def: FilterFieldDef, v: FieldValue | undefined): boolean {
  if (v === undefined) return false;
  switch (def.type) {
    case "multi": return (v as string[]).length > 0;
    case "date": return !!(v as DateFilter).preset;
    case "amount": { const a = v as AmountFilter; return !!a.from.trim() || (a.op === "range" && !!a.to.trim()); }
    default: return !!(v as string).trim();
  }
}

export function getValue<T extends FieldValue>(f: LeadFilter, key: string): T {
  return (f.values[key] ?? emptyValue(FIELD_BY_KEY[key])) as T;
}

// Keys of fields that currently have a value.
export function activeKeys(f: LeadFilter): string[] {
  return FILTER_FIELDS.filter((d) => isValueSet(d, f.values[d.key])).map((d) => d.key);
}

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "", label: "Будь-яка дата" },
  { value: "today", label: "Сьогодні" },
  { value: "yesterday", label: "Вчора" },
  { value: "last7", label: "Останні 7 днів" },
  { value: "last30", label: "Останні 30 днів" },
  { value: "thisMonth", label: "Цей місяць" },
  { value: "lastMonth", label: "Минулий місяць" },
  { value: "range", label: "Діапазон" },
];

export const AMOUNT_OPS: { value: AmountOp; label: string }[] = [
  { value: "eq", label: "Точно" },
  { value: "gt", label: "Більше ніж" },
  { value: "lt", label: "Менше ніж" },
  { value: "range", label: "Діапазон" },
];

export const BOOL_OPTIONS: { value: BoolValue; label: string }[] = [
  { value: "", label: "Не важливо" },
  { value: "yes", label: "Так" },
  { value: "no", label: "Ні" },
];

// ── Quick filters (left column). They only fill the fields on the right and run the search. ──

export type QuickKind = "all" | "active" | "closed" | "win" | "loss" | "unreachable";

// Loss reason «Не змогли звʼязатись» — the ready-made «Не змогли дозвонитися» filter (to call them again later).
export const UNREACHABLE_REASON = "UNREACHABLE";

export const QUICK_FILTERS: { key: QuickKind; label: string }[] = [
  { key: "all", label: "Всі" },
  { key: "active", label: "В роботі" },
  { key: "closed", label: "Закриті" },
  { key: "win", label: "Виграні" },
  { key: "loss", label: "Програні" },
  { key: "unreachable", label: "Не змогли дозвонитися" },
];

// stageIds: ids of the funnel's stages by kind
export function quickFilter(kind: QuickKind, stageIds: { active: string[]; win: string[]; loss: string[] }): LeadFilter {
  const thisMonth: DateFilter = { preset: "thisMonth", from: "", to: "" };
  switch (kind) {
    case "all": return { group: "", values: {} };
    case "active": return { group: "", values: { stages: stageIds.active } };
    case "closed": return { group: "", values: { stages: [...stageIds.win, ...stageIds.loss], closed: thisMonth } };
    case "win": return { group: "", values: { stages: stageIds.win, closed: thisMonth } };
    case "loss": return { group: "", values: { stages: stageIds.loss, closed: thisMonth } };
    // all time: the whole list of leads to call again
    case "unreachable": return { group: "", values: { stages: stageIds.loss, reasons: [UNREACHABLE_REASON] } };
  }
}

// ── Phone helpers ──

// Phone as stored: only digits and a leading "+", no spaces / dashes / brackets.
export function cleanPhone(v: string): string {
  const t = v.trim();
  const plus = t.startsWith("+");
  const digits = t.replace(/\D/g, "");
  return (plus ? "+" : "") + digits;
}

// ── Date helpers (local time of the browser) ──

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export interface DateRange { gte?: string; lte?: string }

export function dateRange(f: DateFilter, now = new Date()): DateRange | null {
  const day = 86_400_000;
  switch (f.preset) {
    case "": return null;
    case "today": return { gte: startOfDay(now).toISOString(), lte: endOfDay(now).toISOString() };
    case "yesterday": {
      const y = new Date(now.getTime() - day);
      return { gte: startOfDay(y).toISOString(), lte: endOfDay(y).toISOString() };
    }
    case "last7": return { gte: startOfDay(new Date(now.getTime() - 6 * day)).toISOString() };
    case "last30": return { gte: startOfDay(new Date(now.getTime() - 29 * day)).toISOString() };
    case "thisMonth": return { gte: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    case "lastMonth": return {
      gte: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
      lte: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).toISOString(),
    };
    case "range": {
      const r: DateRange = {};
      if (f.from) r.gte = startOfDay(new Date(`${f.from}T00:00`)).toISOString();
      if (f.to) r.lte = endOfDay(new Date(`${f.to}T00:00`)).toISOString();
      return r.gte || r.lte ? r : null;
    }
  }
}

// ── Query sent to the server ──

export interface FilterQuery {
  statuses?: string[];
  text?: Record<string, string>;
  multi?: Record<string, string[]>;
  dates?: Record<string, DateRange>;
  bool?: Record<string, boolean>;
  amount?: { op: AmountOp; from?: number; to?: number };
}

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));

// statuses: final status list (stages + funnel/tab constraints) computed by the page; null = no status filter.
export function toFilterQuery(f: LeadFilter, statuses: string[] | null): FilterQuery {
  const q: FilterQuery = {};
  if (statuses) q.statuses = statuses;
  for (const def of FILTER_FIELDS) {
    if (def.key === "stages") continue; // handled via statuses
    const v = f.values[def.key];
    if (!isValueSet(def, v)) continue;
    switch (def.type) {
      case "text": (q.text ??= {})[def.key] = (v as string).trim(); break;
      case "multi": (q.multi ??= {})[def.key] = v as string[]; break;
      case "bool": (q.bool ??= {})[def.key] = v === "yes"; break;
      case "date": { const r = dateRange(v as DateFilter); if (r) (q.dates ??= {})[def.key] = r; break; }
      case "amount": {
        const a = v as AmountFilter;
        q.amount = { op: a.op, from: num(a.from), to: a.op === "range" ? num(a.to) : undefined };
        break;
      }
    }
  }
  return q;
}

// Safe parse of a stored filter (saved filters, localStorage). Unknown keys / wrong types are dropped.
export function normalizeFilter(raw: unknown): LeadFilter {
  const v = (raw && typeof raw === "object" ? raw : {}) as { group?: unknown; values?: unknown };
  const values: Record<string, FieldValue> = {};
  const src = (v.values && typeof v.values === "object" ? v.values : {}) as Record<string, unknown>;
  for (const def of FILTER_FIELDS) {
    const x = src[def.key];
    if (x === undefined) continue;
    if (def.type === "multi" && Array.isArray(x)) values[def.key] = x.filter((s): s is string => typeof s === "string");
    else if ((def.type === "text" || def.type === "bool") && typeof x === "string") values[def.key] = x;
    else if (def.type === "date" && x && typeof x === "object") {
      const d = x as Partial<DateFilter>;
      values[def.key] = {
        preset: DATE_PRESETS.some((p) => p.value === d.preset) ? (d.preset as DatePreset) : "",
        from: typeof d.from === "string" ? d.from : "",
        to: typeof d.to === "string" ? d.to : "",
      };
    } else if (def.type === "amount" && x && typeof x === "object") {
      const a = x as Partial<AmountFilter>;
      values[def.key] = {
        op: AMOUNT_OPS.some((o) => o.value === a.op) ? (a.op as AmountOp) : "eq",
        from: typeof a.from === "string" ? a.from : "",
        to: typeof a.to === "string" ? a.to : "",
      };
    }
  }
  const group = typeof v.group === "string" && ["", "active", "closed", "win", "loss"].includes(v.group) ? v.group : "";
  return { group, values };
}

export function sameFilter(a: LeadFilter, b: LeadFilter): boolean {
  const pick = (f: LeadFilter) => {
    const out: Record<string, FieldValue> = {};
    for (const k of activeKeys(f)) out[k] = Array.isArray(f.values[k]) ? [...(f.values[k] as string[])].sort() : f.values[k];
    return JSON.stringify({ g: f.group, v: out });
  };
  return pick(a) === pick(b);
}
