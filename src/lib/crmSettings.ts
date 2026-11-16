// CRM settings, edited on the «Налаштування» page and stored in the "Setting" table (key "crm" → JSON).
// Shared by the server (API routes) and the client (hooks/components) — keep this file free of server-only imports.
//
// Model:
//   Funnel  → own list of stages (active ones are editable/reorderable)
//           → exactly one win stage (id "WON") and one loss stage (id "LOST")
//           → win/loss rules: reasons list, whether a reason is required, which lead fields must be filled
// Lead.status stores the stage id, Lead.funnelId the funnel (null = first funnel), Lead.closeReason the reason id.

import { LEAD_STATUSES, LOSS_STATUSES, LEGACY_ACTIVE_MAP } from "@/lib/leadOptions";
import { normalizeFilter, type LeadFilter } from "@/lib/leadFilter";
import { defaultTaskSettings, normalizeTaskSettings, type TaskSettings } from "@/lib/taskAutomation";
import { defaultAccess, normalizeAccess, type AccessSettings } from "@/lib/access";

export type StageKind = "active" | "win" | "loss";

export interface Stage {
  id: string;
  label: string;
  color: string;
  kind: StageKind;
  isDeal: boolean; // shown on the «Угоди» tab
  // «Обхідна» stage (like НДЗ): counted only when a lead is really moved onto it.
  // Jumping over it does not count it as passed, and leaving it continues from the stage the lead came from.
  skip: boolean;
  hint?: string; // what we do on this stage (shown on hover in the deal card)
}

export interface Reason {
  id: string;
  label: string;
}

export interface CloseRules {
  reasons: Reason[];
  reasonRequired: boolean;
  requiredFields: string[]; // keys of CLOSE_FIELDS
}

// ── Card fields per funnel ──
// Every funnel has its own blocks (sections) and an ordered list of fields.
// Built-in fields map to Lead columns (id = column key); custom ones store values in Lead.customFields.
// A built-in field that is not in the list is "deleted" from the card (data stays, it can be restored).

export type CustomFieldType = "text" | "textarea" | "number" | "select" | "multi" | "date" | "bool" | "link";

export const CUSTOM_FIELD_TYPES: { key: CustomFieldType; label: string }[] = [
  { key: "text", label: "Рядок" },
  { key: "textarea", label: "Текст" },
  { key: "number", label: "Число" },
  { key: "select", label: "Список" },
  { key: "multi", label: "Кілька варіантів" },
  { key: "date", label: "Дата" },
  { key: "bool", label: "Так / ні" },
  { key: "link", label: "Посилання" },
];

// Contact block always exists (it holds the avatar and the phone).
export const CONTACT_SECTION = "contact";

export const DEFAULT_CARD_SECTIONS: CardSection[] = [
  { id: "contact", label: "Контакт" },
  { id: "deal", label: "Про угоду" },
  { id: "project", label: "Проєкт" },
  { id: "push", label: "Пуші" },
];

// Phone is always shown (it is the main identifier of a lead), so it is not in this list.
export const BUILTIN_FIELDS: { key: string; label: string; section: string }[] = [
  { key: "telegram", label: "Telegram", section: "contact" },
  { key: "instagram", label: "Instagram", section: "contact" },
  { key: "email", label: "Email", section: "contact" },
  { key: "messenger", label: "Канал комунікації", section: "contact" },
  { key: "amount", label: "Сума", section: "deal" },
  { key: "kpAt", label: "Дата і час КП", section: "deal" },
  { key: "service", label: "Послуга", section: "deal" },
  { key: "niche", label: "Ніша", section: "deal" },
  { key: "source", label: "Джерело", section: "deal" },
  { key: "geo", label: "Місто / гео", section: "deal" },
  { key: "comment", label: "Коментар", section: "deal" },
  { key: "siteStructure", label: "Структура сайту", section: "project" },
  { key: "paymentSystem", label: "Платіжна система", section: "project" },
  { key: "projectDeadline", label: "Дедлайн проєкту", section: "project" },
  { key: "extraLang", label: "Додаткова мова", section: "project" },
  { key: "usedServices", label: "Клієнт використовує", section: "project" },
  { key: "caseUrl", label: "Посилання на готовий проєкт", section: "project" },
  { key: "pushStage", label: "Етап пушу", section: "push" },
  { key: "pushAt", label: "Дата пушу", section: "push" },
  { key: "pushComment", label: "Коментар до пушу", section: "push" },
];

export interface CardSection {
  id: string;
  label: string;
}

export interface CardField {
  id: string;            // built-in: Lead column key; custom: generated id
  builtin: boolean;
  label: string;
  section: string;       // CardSection.id
  type: CustomFieldType; // ignored for built-ins
  options: string[];     // for select / multi
}

export interface FunnelFields {
  sections: CardSection[];
  items: CardField[]; // order = order in the card
  seen: string[];     // built-ins the funnel already knows (a newly added built-in shows up once, then can be deleted)
}

// Built-ins added after funnels were first saved — they appear in existing funnels automatically.
const LATER_BUILTINS = new Set(["kpAt"]);

export function defaultFunnelFields(): FunnelFields {
  return {
    sections: DEFAULT_CARD_SECTIONS.map((x) => ({ ...x })),
    items: BUILTIN_FIELDS.map((f) => ({ id: f.key, builtin: true, label: f.label, section: f.section, type: "text" as const, options: [] })),
    seen: BUILTIN_FIELDS.map((f) => f.key),
  };
}

export interface Funnel {
  id: string;
  name: string;
  stages: Stage[];
  win: CloseRules;
  loss: CloseRules;
  fields: FunnelFields;
  payments: boolean; // блок «Оплати» (графік платежів) у картці угоди
  notify: FunnelNotify; // як нові угоди воронки показуються в дзвіночку
  partners: boolean;    // воронка партнерів: у картці — «Ліди від партнера», у лідів інших воронок — поле «Партнер»
}

// Bell: new deals of a funnel go to «Ліди», to their own tab (with this label) or nowhere.
// Funnels with payments («Операційка») always go to «Проєкти».
export interface FunnelNotify { mode: "leads" | "tab" | "off"; label: string }

export interface SavedFilter {
  id: string;
  name: string;
  filter: LeadFilter;
}

// ── Business processes: «Передача у воронку» ──
// Creates a copy of the lead in another funnel; the original stays (optionally moved to a stage).
// Rules say how each field of the NEW lead is filled. A field without a rule uses defaultFieldRule().

export type FieldRule =
  | { mode: "copy"; from: string }   // from = source field id (built-in key or custom id of the source funnel)
  | { mode: "value"; value: string } // fixed value
  | { mode: "skip" };                // leave empty

export interface TransferProcess {
  id: string;
  name: string;
  fromFunnelId: string;
  toFunnelId: string;
  toStageId: string;
  sourceStageId: string | null; // move the original lead to this stage after the transfer (null = leave as is)
  fields: Record<string, FieldRule>; // target field id → rule
}

export interface CrmSettings {
  funnels: Funnel[];
  savedFilters: SavedFilter[]; // «Мої фільтри» in the search panel
  processes: TransferProcess[];
  tasks: TaskSettings; // відповідальні + автозадачі стадій
  access: AccessSettings; // ролі користувачів (доступ до вкладок і воронок)
}

export const CRM_SETTINGS_KEY = "crm";
export const WIN_ID = "WON";
export const LOSS_ID = "LOST";

// Lead fields that can be made mandatory when a lead is closed.
export const CLOSE_FIELDS: { key: string; label: string; type: "text" | "number" }[] = [
  { key: "amount", label: "Сума", type: "number" },
  { key: "service", label: "Послуга", type: "text" },
  { key: "phone", label: "Телефон", type: "text" },
  { key: "niche", label: "Ніша", type: "text" },
  { key: "source", label: "Джерело", type: "text" },
  { key: "projectDeadline", label: "Дедлайн проєкту", type: "text" },
  { key: "comment", label: "Коментар", type: "text" },
  { key: "caseUrl", label: "Посилання на готовий проєкт", type: "text" },
];

// Palette offered in the stage editor.
export const STAGE_COLORS = [
  "#C98C0A", "#f59e0b", "#fb923c", "#f87171", "#f472b6", "#c084fc", "#a78bfa", "#818cf8",
  "#60a5fa", "#38bdf8", "#22d3ee", "#2dd4bf", "#34d399", "#22c55e", "#a3e635", "#94a3b8",
];

// «Угоди в роботі» by default: everything after qualification.
const DEFAULT_DEAL_STATUSES = new Set([
  "QUALIFIED", "SCHEDULED_PROPOSAL", "PROPOSAL", "MEETING_DONE", "INVOICE", "PREPAYMENT",
]);

// Old loss statuses (before «Програш + причина»). Leads still holding them are read as LOST with that reason.
export const LEGACY_LOSS_REASONS: Reason[] = LEAD_STATUSES
  .filter((s) => s.group === "loss")
  .map((s) => ({ id: s.value, label: s.label.replace(/^Програш — /, "") }));

function winStage(): Stage {
  return { id: WIN_ID, label: "Виграш", color: "#22c55e", kind: "win", isDeal: false, skip: false };
}
function lossStage(): Stage {
  return { id: LOSS_ID, label: "Програш", color: "#f87171", kind: "loss", isDeal: false, skip: false };
}

export function defaultFunnel(dealStatuses?: string[]): Funnel {
  const deal = dealStatuses ? new Set(dealStatuses) : DEFAULT_DEAL_STATUSES;
  return {
    id: "main",
    name: "Основна воронка",
    stages: [
      ...LEAD_STATUSES.filter((s) => s.group === "active").map((s) => ({
        id: s.value, label: s.label, color: s.accent, kind: "active" as const, isDeal: deal.has(s.value), skip: s.value === "MISSED_CALL",
      })),
      winStage(),
      lossStage(),
    ],
    win: {
      reasons: [
        { id: "price_ok", label: "Влаштувала ціна" },
        { id: "portfolio", label: "Сподобалось портфоліо" },
        { id: "referral", label: "Рекомендація" },
        { id: "fast", label: "Швидкі терміни" },
      ],
      reasonRequired: true,
      requiredFields: [],
    },
    loss: {
      reasons: LEGACY_LOSS_REASONS.map((r) => ({ ...r })),
      reasonRequired: true,
      requiredFields: [],
    },
    fields: defaultFunnelFields(),
    payments: false,
    notify: { mode: "leads", label: "" },
    partners: false,
  };
}

export function newFunnel(name: string): Funnel {
  return {
    id: newId("f"),
    name,
    stages: [
      { id: newId("s"), label: "Новий лід", color: "#C98C0A", kind: "active", isDeal: false, skip: false },
      { id: newId("s"), label: "В роботі", color: "#38bdf8", kind: "active", isDeal: true, skip: false },
      winStage(),
      lossStage(),
    ],
    win: { reasons: [], reasonRequired: true, requiredFields: [] },
    loss: { reasons: [], reasonRequired: true, requiredFields: [] },
    fields: defaultFunnelFields(),
    payments: false,
    // a new funnel gets its own tab in the bell (can be changed in its settings)
    notify: { mode: "tab", label: name },
    partners: /партн/i.test(name),
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export const DEFAULT_CRM_SETTINGS: CrmSettings = { funnels: [defaultFunnel()], savedFilters: [], processes: [], tasks: defaultTaskSettings(), access: defaultAccess() };

// ── Normalization (makes stored JSON safe to use, upgrades old shape { dealStatuses }) ──

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function normRules(raw: unknown, fallback: CloseRules): CloseRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CloseRules>;
  return {
    reasons: Array.isArray(r.reasons)
      ? r.reasons
          .filter((x): x is Reason => !!x && typeof x === "object" && typeof (x as Reason).id === "string")
          .map((x) => ({ id: x.id, label: str(x.label, "Без назви") }))
      : fallback.reasons,
    reasonRequired: typeof r.reasonRequired === "boolean" ? r.reasonRequired : fallback.reasonRequired,
    requiredFields: Array.isArray(r.requiredFields)
      ? r.requiredFields.filter((k): k is string => CLOSE_FIELDS.some((f) => f.key === k))
      : fallback.requiredFields,
  };
}

function normFields(raw: unknown): FunnelFields {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const types = new Set(CUSTOM_FIELD_TYPES.map((x) => x.key));
  const builtinKeys = new Map(BUILTIN_FIELDS.map((f) => [f.key, f]));
  const opts = (v: unknown) => (Array.isArray(v) ? v.filter((o): o is string => typeof o === "string" && !!o.trim()) : []);

  // Old shape { hidden: string[], custom: [...] } → new list
  if (!Array.isArray(r.items)) {
    const base = defaultFunnelFields();
    const hidden = new Set(Array.isArray(r.hidden) ? r.hidden : []);
    const custom = Array.isArray(r.custom) ? r.custom : [];
    const hasExtra = custom.some((c) => c && (c as CardField).section === "extra");
    return {
      seen: base.seen,
      sections: hasExtra ? [...base.sections, { id: "extra", label: "Додатково" }] : base.sections,
      items: [
        ...base.items.filter((i) => !hidden.has(i.id)),
        ...custom
          .filter((c): c is CardField => !!c && typeof c === "object" && typeof (c as CardField).id === "string")
          .map((c) => ({
            id: c.id, builtin: false, label: str(c.label, "Поле"),
            section: typeof c.section === "string" ? c.section : "extra",
            type: types.has(c.type) ? c.type : "text", options: opts(c.options),
          })),
      ],
    };
  }

  const sections: CardSection[] = (Array.isArray(r.sections) ? r.sections : [])
    .filter((x): x is CardSection => !!x && typeof x === "object" && typeof (x as CardSection).id === "string")
    .map((x) => ({ id: x.id, label: typeof x.label === "string" ? x.label : "Блок" }));
  if (!sections.some((x) => x.id === CONTACT_SECTION)) sections.unshift({ id: CONTACT_SECTION, label: "Контакт" });
  const sectionIds = new Set(sections.map((x) => x.id));

  const seen = new Set<string>();
  const items: CardField[] = [];
  for (const x of r.items as unknown[]) {
    if (!x || typeof x !== "object") continue;
    const f = x as Partial<CardField>;
    if (typeof f.id !== "string" || seen.has(f.id)) continue;
    const builtin = !!f.builtin && builtinKeys.has(f.id);
    if (f.builtin && !builtin) continue;
    seen.add(f.id);
    items.push({
      id: f.id,
      builtin,
      label: typeof f.label === "string" ? f.label : builtin ? builtinKeys.get(f.id)!.label : "Поле",
      section: typeof f.section === "string" && sectionIds.has(f.section) ? f.section : CONTACT_SECTION,
      type: !builtin && f.type && types.has(f.type) ? f.type : "text",
      options: builtin ? [] : opts(f.options),
    });
  }
  // Built-ins the funnel has never seen yet are added (into their default block, or the contact block).
  const seenRaw = Array.isArray(r.seen) ? r.seen.filter((k): k is string => typeof k === "string") : BUILTIN_FIELDS.map((f) => f.key).filter((k) => !LATER_BUILTINS.has(k));
  const seenSet = new Set(seenRaw);
  for (const b of BUILTIN_FIELDS) {
    if (seenSet.has(b.key) || seen.has(b.key)) continue;
    const section = sectionIds.has(b.section) ? b.section : CONTACT_SECTION;
    const after = b.key === "kpAt" ? items.findIndex((i) => i.builtin && i.id === "amount") : -1;
    const field: CardField = { id: b.key, builtin: true, label: b.label, section, type: "text", options: [] };
    if (after >= 0) items.splice(after + 1, 0, { ...field, section: items[after].section });
    else items.push(field);
    seen.add(b.key);
  }
  return { sections, items, seen: BUILTIN_FIELDS.map((f) => f.key) };
}

function normFunnel(raw: unknown, index: number): Funnel | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<Funnel>;
  const base = index === 0 ? defaultFunnel() : newFunnel("Воронка");
  const stagesRaw = Array.isArray(f.stages) ? f.stages : base.stages;
  const active: Stage[] = [];
  let win: Stage | null = null;
  let loss: Stage | null = null;
  for (const s of stagesRaw) {
    if (!s || typeof s !== "object" || typeof s.id !== "string") continue;
    const stage: Stage = {
      id: s.id,
      label: str(s.label, "Без назви"),
      color: str(s.color, "#94a3b8"),
      kind: s.kind === "win" || s.kind === "loss" ? s.kind : "active",
      isDeal: !!s.isDeal,
      skip: typeof s.skip === "boolean" ? s.skip : s.id === "MISSED_CALL",
      ...(typeof s.hint === "string" && s.hint.trim() ? { hint: s.hint.trim() } : {}),
    };
    if (stage.kind === "win") win ??= { ...stage, id: WIN_ID, isDeal: false };
    else if (stage.kind === "loss") loss ??= { ...stage, id: LOSS_ID, isDeal: false };
    else active.push(stage);
  }
  return {
    id: str(f.id, base.id),
    name: str(f.name, base.name),
    stages: [...(active.length ? active : base.stages.filter((s) => s.kind === "active")), win ?? winStage(), loss ?? lossStage()],
    win: normRules(f.win, base.win),
    loss: normRules(f.loss, base.loss),
    fields: normFields(f.fields),
    payments: !!f.payments,
    notify: normNotify(f.notify, str(f.name, base.name)),
    // saved before the flag existed → a funnel named «Партнери» is the partners one
    partners: typeof f.partners === "boolean" ? f.partners : /партн/i.test(str(f.name, "")),
  };
}

// saved before the setting existed → «Ліди», as it was
function normNotify(raw: unknown, name: string): FunnelNotify {
  const n = (raw && typeof raw === "object" ? raw : {}) as Partial<FunnelNotify>;
  const mode = n.mode === "tab" || n.mode === "off" ? n.mode : "leads";
  return { mode, label: typeof n.label === "string" && n.label.trim() ? n.label.trim() : name };
}

function normSavedFilters(raw: unknown): SavedFilter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object" && typeof x.id === "string")
    .map((x) => ({ id: x.id, name: str(x.name, "Фільтр"), filter: normalizeFilter(x.filter) }));
}

function normRule(raw: unknown): FieldRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.mode === "copy" && typeof r.from === "string") return { mode: "copy", from: r.from };
  if (r.mode === "value") return { mode: "value", value: typeof r.value === "string" ? r.value : "" };
  if (r.mode === "skip") return { mode: "skip" };
  return null;
}

function normProcesses(raw: unknown, funnels: Funnel[]): TransferProcess[] {
  if (!Array.isArray(raw)) return [];
  const out: TransferProcess[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || typeof x.id !== "string") continue;
    const from = funnels.find((f) => f.id === x.fromFunnelId);
    const to = funnels.find((f) => f.id === x.toFunnelId);
    if (!from || !to) continue; // funnel was deleted → process disappears
    const fields: Record<string, FieldRule> = {};
    if (x.fields && typeof x.fields === "object") {
      for (const [k, v] of Object.entries(x.fields as Record<string, unknown>)) {
        const rule = normRule(v);
        if (rule) fields[k] = rule;
      }
    }
    out.push({
      id: x.id,
      name: str(x.name, "Передача у воронку"),
      fromFunnelId: from.id,
      toFunnelId: to.id,
      toStageId: to.stages.some((s) => s.id === x.toStageId) ? x.toStageId : activeStages(to)[0].id,
      sourceStageId: typeof x.sourceStageId === "string" && from.stages.some((s) => s.id === x.sourceStageId) ? x.sourceStageId : null,
      fields,
    });
  }
  return out;
}

export function normalizeCrmSettings(raw: unknown): CrmSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as { funnels?: unknown; dealStatuses?: unknown; savedFilters?: unknown; processes?: unknown; tasks?: unknown; access?: unknown };
  const savedFilters = normSavedFilters(v.savedFilters);
  const tasks = normalizeTaskSettings(v.tasks);
  const access = normalizeAccess(v.access);
  if (Array.isArray(v.funnels) && v.funnels.length) {
    const funnels = v.funnels.map(normFunnel).filter((f): f is Funnel => !!f);
    if (funnels.length) return { funnels, savedFilters, processes: normProcesses(v.processes, funnels), tasks, access };
  }
  // old shape: { dealStatuses: [...] }
  const deal = Array.isArray(v.dealStatuses) ? v.dealStatuses.filter((s): s is string => typeof s === "string") : undefined;
  return { funnels: [defaultFunnel(deal)], savedFilters, processes: [], tasks, access };
}

// ── Helpers used by the UI ──

const LEGACY_ACTIVE: Record<string, string> = LEGACY_ACTIVE_MAP;
const LEGACY_LOSS_IDS = new Set<string>(LOSS_STATUSES);

export function getFunnel(settings: CrmSettings, funnelId: string | null | undefined): Funnel {
  return settings.funnels.find((f) => f.id === funnelId) ?? settings.funnels[0];
}

export interface ResolvedStage {
  funnel: Funnel;
  stage: Stage;
  reason: Reason | null; // only for closed leads
}

// Figure out the funnel, the stage and (for closed leads) the reason of a lead.
export function resolveStage(
  settings: CrmSettings,
  lead: { status: string; funnelId?: string | null; closeReason?: string | null }
): ResolvedStage {
  const funnel = getFunnel(settings, lead.funnelId);
  let status = LEGACY_ACTIVE[lead.status] ?? lead.status;
  let reasonId = lead.closeReason ?? null;
  if (LEGACY_LOSS_IDS.has(status)) {
    reasonId ??= status;
    status = LOSS_ID;
  }
  const stage =
    funnel.stages.find((s) => s.id === status) ??
    settings.funnels.flatMap((f) => f.stages).find((s) => s.id === status) ??
    { id: status, label: status, color: "#94a3b8", kind: "active" as const, isDeal: false, skip: false };

  let reason: Reason | null = null;
  if (stage.kind !== "active" && reasonId) {
    const rules = stage.kind === "win" ? funnel.win : funnel.loss;
    reason =
      rules.reasons.find((r) => r.id === reasonId) ??
      LEGACY_LOSS_REASONS.find((r) => r.id === reasonId) ??
      { id: reasonId, label: reasonId };
  }
  return { funnel, stage, reason };
}

export function activeStages(funnel: Funnel): Stage[] {
  return funnel.stages.filter((s) => s.kind === "active");
}
export function closeStage(funnel: Funnel, kind: "win" | "loss"): Stage {
  return funnel.stages.find((s) => s.kind === kind)!;
}

// Built-in card field of the funnel (undefined = deleted from the card).
export function cardField(funnel: Funnel, key: string): CardField | undefined {
  return funnel.fields.items.find((f) => f.builtin && f.id === key);
}

// Built-in fields whose value can be typed as a fixed value / copied into a custom field as text.
export const SIMPLE_BUILTINS = new Set([
  "telegram", "instagram", "email", "messenger", "amount", "service", "niche", "source", "geo", "comment",
  "siteStructure", "paymentSystem", "projectDeadline", "pushStage", "pushComment",
]);

// What happens to a target field when the process has no explicit rule for it:
// built-in → copied as is; custom → copied from a source field with the same name, otherwise left empty.
export function defaultFieldRule(target: CardField, source: Funnel): FieldRule {
  if (target.builtin) return { mode: "copy", from: target.id };
  const twin = source.fields.items.find((f) => f.label.trim().toLowerCase() === target.label.trim().toLowerCase());
  return twin ? { mode: "copy", from: twin.id } : { mode: "skip" };
}

export function fieldRule(p: TransferProcess, target: CardField, source: Funnel): FieldRule {
  return p.fields[target.id] ?? defaultFieldRule(target, source);
}

export function newProcess(from: Funnel, to: Funnel): TransferProcess {
  return {
    id: newId("bp"),
    name: `Передача у «${to.name}»`,
    fromFunnelId: from.id,
    toFunnelId: to.id,
    toStageId: activeStages(to)[0].id,
    sourceStageId: null,
    fields: {},
  };
}

export const partnerFunnels = (s: CrmSettings) => s.funnels.filter((f) => f.partners && !f.payments);
