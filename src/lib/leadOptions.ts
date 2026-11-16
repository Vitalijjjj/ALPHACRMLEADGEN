// Single source of truth for Lead options: statuses, sources, services, channels.
// Statuses are stored in the DB as plain strings (no enum) — adding one here needs no migration.

export type LeadStatusGroup = "active" | "win" | "loss";

export interface LeadStatusDef {
  value: string;
  label: string;
  accent: string; // hex — used for status buttons in the drawer
  badge: string; // tailwind classes — used by <Badge/>
  group: LeadStatusGroup;
}

// Ordered funnel (default stages of the main funnel; editable in Налаштування).
// Older stage codes still found in the DB are mapped onto these via LEGACY_STATUS_ALIASES.
export const LEAD_STATUSES: LeadStatusDef[] = [
  { value: "NEW_LEAD",           label: "Новий лід",             accent: "#C98C0A", badge: "bg-amber-500/15 text-amber-400 border-amber-500/20",       group: "active" },
  { value: "QUALIFICATION",      label: "Кваліфікація",          accent: "#38bdf8", badge: "bg-sky-500/15 text-sky-400 border-sky-500/20",             group: "active" },
  { value: "QUALIFIED",          label: "Кваліфіковано",         accent: "#22d3ee", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",          group: "active" },
  { value: "MISSED_CALL",        label: "НДЗ",                   accent: "#fb923c", badge: "bg-orange-500/15 text-orange-400 border-orange-500/20",    group: "active" },
  { value: "SCHEDULED_PROPOSAL", label: "Зустріч призначена",    accent: "#818cf8", badge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",    group: "active" },
  { value: "PROPOSAL",           label: "Комерційна пропозиція", accent: "#a78bfa", badge: "bg-violet-500/15 text-violet-400 border-violet-500/20",    group: "active" },
  { value: "MEETING_DONE",       label: "Зустріч проведена",     accent: "#c084fc", badge: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20", group: "active" },
  { value: "INVOICE",            label: "Інвойс",                accent: "#eab308", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",    group: "active" },
  { value: "PREPAYMENT",         label: "Передоплата отримана",  accent: "#2dd4bf", badge: "bg-teal-500/15 text-teal-400 border-teal-500/20",          group: "active" },
  { value: "WON",                label: "Виграш — Продаж",   accent: "#22c55e", badge: "bg-green-500/15 text-green-400 border-green-500/20",       group: "win" },
  { value: "NOT_INTERESTED",     label: "Програш — Не цікаво",              accent: "#f87171", badge: "bg-red-500/15 text-red-400 border-red-500/20", group: "loss" },
  { value: "COMPETITORS",        label: "Програш — Працюють з іншими",      accent: "#f87171", badge: "bg-red-500/15 text-red-400 border-red-500/20", group: "loss" },
  { value: "DUPLICATE",          label: "Програш — Дубль",                  accent: "#f87171", badge: "bg-red-500/15 text-red-400 border-red-500/20", group: "loss" },
  { value: "UNREACHABLE",        label: "Програш — Не змогли звʼязатись",   accent: "#f87171", badge: "bg-red-500/15 text-red-400 border-red-500/20", group: "loss" },
  { value: "NOT_TARGET",         label: "Програш — не ЦА",                  accent: "#f87171", badge: "bg-red-500/15 text-red-400 border-red-500/20", group: "loss" },
  { value: "TOO_EXPENSIVE",      label: "Програш — Дорого",                 accent: "#f87171", badge: "bg-red-500/15 text-red-400 border-red-500/20", group: "loss" },
];

// Short labels used in the drawer's status buttons (кнопки статусів) — compact wording.
export const LEAD_STATUS_SHORT: Record<string, string> = {
  WON: "Виграш",
  NOT_INTERESTED: "Не цікаво",
  COMPETITORS: "Працюють з іншими",
  DUPLICATE: "Дубль",
  UNREACHABLE: "Не дозвонились",
  NOT_TARGET: "не ЦА",
  TOO_EXPENSIVE: "Дорого",
};

export const LEAD_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, s.label])
);

export const LEAD_STATUS_BADGE: Record<string, string> = {
  ...Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s.badge])),
  LOST: "bg-red-500/15 text-red-400 border-red-500/20", // single «Програш» stage (reason stored separately)
};

// Compact labels for chips/badges — drop the "Виграш — " / "Програш — " prefix.
export const LEAD_STATUS_BADGE_LABEL: Record<string, string> = {
  ...Object.fromEntries(
    LEAD_STATUSES.map((s) => [s.value, LEAD_STATUS_SHORT[s.value] ?? s.label.replace(/^(Виграш|Програш) — /, "")])
  ),
  LOST: "Програш",
};

export const WON_STATUSES = LEAD_STATUSES.filter((s) => s.group === "win").map((s) => s.value);
export const LOSS_STATUSES = LEAD_STATUSES.filter((s) => s.group === "loss").map((s) => s.value);
// Historical alias kept for older data.
export const LOSS_STATUSES_ALL = [...LOSS_STATUSES, "LOST"];

// Old status values that may still exist in the DB (pre-migration enum) → their current equivalent.
export const LEGACY_STATUS_ALIASES: Record<string, string[]> = {
  NEW_LEAD: ["NEW"],
  // stages removed in the Nov 2026 funnel rework → their closest new stage
  QUALIFICATION: ["CONTACTED", "WRITTEN", "CALL_BACK", "TARGETED"],
  SCHEDULED_PROPOSAL: ["SET_PROPOSAL"],
  PROPOSAL: ["NEGOTIATION", "TOUCH_1", "TOUCH_2", "TOUCH_3", "INTERESTED", "THINKING"],
  MEETING_DONE: ["SEND_REPORT"],
  NOT_INTERESTED: ["LOST"],
  // «Програш» is now one stage + reason; old per-reason loss statuses still count as LOST.
  LOST: LOSS_STATUSES,
};

// Old working-stage code → current stage code (for display; DB values are not changed).
export const LEGACY_ACTIVE_MAP: Record<string, string> = Object.fromEntries(
  ["NEW_LEAD", "QUALIFICATION", "SCHEDULED_PROPOSAL", "PROPOSAL", "MEETING_DONE"].flatMap((cur) =>
    (LEGACY_STATUS_ALIASES[cur] ?? []).map((old) => [old, cur])
  )
);

// All DB values a status filter should match (current value + legacy aliases).
export function statusMatchValues(status: string): string[] {
  return [status, ...(LEGACY_STATUS_ALIASES[status] ?? [])];
}

// Вкладка Potential: ліди на «гарячих» стадіях (КП, Інвойс, дотики, Думає, Цікаво).
// Додатково туди потрапляють усі ліди із запланованим пушем (pushAt) — незалежно від статусу.
export const POTENTIAL_STATUSES = [
  "PROPOSAL", "MEETING_DONE", "INVOICE", "PREPAYMENT", // + old codes via statusMatchValues
];

// "Цільові" (qualified) leads — everything past first contact that is still in play or won.
export const TARGETED_STATUSES = [
  "QUALIFICATION", "QUALIFIED", "MEETING_DONE", "PREPAYMENT",
  "CONTACTED", "TARGETED", "SCHEDULED_PROPOSAL", "SET_PROPOSAL", "PROPOSAL", "INVOICE",
  "SEND_REPORT", "TOUCH_1", "TOUCH_2", "TOUCH_3",
  "INTERESTED", "THINKING", "CLOSE", "WON", "NEGOTIATION",
];

export const LEAD_SOURCES: { value: string; detail?: string }[] = [
  { value: "IG органіка Артур" },
  { value: "IG органіка Вітал" },
  { value: "IG Розсилки",      detail: "Нікнейм акаунту" },
  { value: "Таргет",           detail: "Назва кампанії" },
  { value: "Автопрозвон",      detail: "Назва кампанії" },
  { value: "Мессенджер" },
  { value: "Контекст" },
  { value: "Сайт" },
  { value: "Сарафанне радіо",  detail: "Від якого клієнта" },
  { value: "Партнерка",        detail: "Хто партнер" },
];

// Джерела, що є платними типами трафіку — для них існують рекламні кампанії (AdCampaign).
// "Таргет" — денний бюджет; "Автопрозвон" — загальний бюджет + дата початку/закінчення.
export const AD_TRAFFIC_TYPES = ["Таргет", "Автопрозвон"] as const;
export type AdTrafficType = (typeof AD_TRAFFIC_TYPES)[number];

export const AD_TRAFFIC_ACCENT: Record<string, string> = {
  "Таргет": "#C98C0A",
  "Автопрозвон": "#22d3ee",
};

export function normalizeTrafficType(source: string | null | undefined): AdTrafficType | null {
  if (!source) return null;
  const found = AD_TRAFFIC_TYPES.find((t) => t.toLowerCase() === source.trim().toLowerCase());
  return found ?? null;
}

export const LEAD_SERVICES = [
  "АІ лендос",
  "АІ корпоративний",
  "АІ каталог",
  "ШБ лендинг",
  "ШБ Корпоративний",
  "ШБ Інтернет магазин",
  "Індив Інтернет магазин",
];

// Channel where the conversation with the client happens (stored in Lead.messenger).
export const COMMUNICATION_CHANNELS = ["WhatsApp", "Telegram", "Viber"];

export const CHANNEL_ACCENT: Record<string, string> = {
  WhatsApp: "#22c55e",
  Telegram: "#26A5E4",
  Viber: "#7360f2",
};

// Display name for a lead. If the name is empty → «Угода #4501» (last 4 digits of the phone).
// A "name" that is really a phone number (site forms put the phone there) is not a name.
export function isPhoneLike(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  return /^[+\d\s().-]+$/.test(t) && t.replace(/\D/g, "").length >= 7;
}

// The lead has a real title (not empty and not just a phone number).
export function hasRealName(lead: { name?: string | null }): boolean {
  return !!lead.name?.trim() && !isPhoneLike(lead.name);
}

// Title of a lead everywhere: its name, otherwise «Угода #<number>» (never the phone).
export function leadDisplayName(lead: { name?: string | null; phone?: string | null; id?: string; number?: number | null }): string {
  if (hasRealName(lead)) return lead.name!.trim();
  if (lead.number) return `Угода #${lead.number}`;
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  if (digits) return `Угода #${digits.slice(-4)}`;
  return lead.id ? `Угода #${lead.id.slice(-4).toUpperCase()}` : "Угода";
}

// Option lists shared by forms, the lead card and the filter panel.
export const PAYMENT_SYSTEMS = ["MonoPay", "LiqPay", "WayForPay", "Fondy", "Portmone", "Інше"];
export const UPSELL_SERVICES = [
  "Google Ads", "Target Ads", "SEO", "Google Maps", "Branding", "TikTok Ads", "Graphic Design",
];
export const PUSH_STAGES = ["Пуша 1", "Пуша 2", "Пуша 3", "Пуша 4", "Пуша 5"];
// Quick-add a lead to Google Calendar: event status label.
export const CALENDAR_STATUSES = ["НДЗ", "Перезвон", "Поставити КП", "КП", "Пуш"];

// One-time migration of old stage codes in the DB to the current funnel (Налаштування → «Старі стадії»).
// Old loss statuses become «Програш» with the old code kept as the reason.
// CLOSE («Закрити лід», very old) has no obvious target — it is left for manual moving.
// Extras (agreed with the user, 2026-11-12):
//   task — create this task for every moved lead (since = only leads created on/after that date);
//          the oldest leads get the earliest deadlines (starting next working day 10:00, 15 min apart)
//   note — write a comment to the lead's timeline
export interface LegacyMove {
  status: string;
  label: string;
  reason?: boolean;
  task?: { title: string; since?: string };
  note?: string;
}

export const LEGACY_MIGRATION: Record<string, LegacyMove> = {
  NEW:            { status: "NEW_LEAD", label: "Новий лід (старий код)" },
  CONTACTED:      { status: "QUALIFICATION", label: "Звʼязався" },
  WRITTEN:        { status: "QUALIFICATION", label: "Написав" },
  CALL_BACK:      { status: "QUALIFICATION", label: "Передзвонити", task: { title: "Передзвонити", since: "2026-11-01" } },
  TARGETED:       { status: "QUALIFICATION", label: "Цільовий" },
  SET_PROPOSAL:   { status: "SCHEDULED_PROPOSAL", label: "Поставити КП", task: { title: "Поставити КП" } },
  NEGOTIATION:    { status: "PROPOSAL", label: "Переговори (старий код)", note: "Переговори" },
  TOUCH_1:        { status: "PROPOSAL", label: "Перший дотик", note: "Перший дотик" },
  TOUCH_2:        { status: "PROPOSAL", label: "Другий дотик", note: "Другий дотик" },
  TOUCH_3:        { status: "PROPOSAL", label: "Третій дотик", note: "Третій дотик" },
  INTERESTED:     { status: "PROPOSAL", label: "Цікаво", note: "Цікаво" },
  THINKING:       { status: "PROPOSAL", label: "Думає", note: "Думає" },
  SEND_REPORT:    { status: "MEETING_DONE", label: "Відправити звіт", task: { title: "Відправити звіт" } },
  NOT_INTERESTED: { status: "LOST", label: "Програш — Не цікаво", reason: true },
  COMPETITORS:    { status: "LOST", label: "Програш — Працюють з іншими", reason: true },
  DUPLICATE:      { status: "LOST", label: "Програш — Дубль", reason: true },
  UNREACHABLE:    { status: "LOST", label: "Програш — Не змогли звʼязатись", reason: true },
  NOT_TARGET:     { status: "LOST", label: "Програш — не ЦА", reason: true },
  TOO_EXPENSIVE:  { status: "LOST", label: "Програш — Дорого", reason: true },
};
