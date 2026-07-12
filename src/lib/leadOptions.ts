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

// Ordered funnel. New statuses (Поставити КП / Відправити звіт / дотики) sit around КП.
export const LEAD_STATUSES: LeadStatusDef[] = [
  { value: "NEW_LEAD",           label: "Новий лід",         accent: "#C98C0A", badge: "bg-amber-500/15 text-amber-400 border-amber-500/20",       group: "active" },
  { value: "CONTACTED",          label: "Звʼязався",          accent: "#22d3ee", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",          group: "active" },
  { value: "WRITTEN",            label: "Написав",            accent: "#38bdf8", badge: "bg-sky-500/15 text-sky-400 border-sky-500/20",             group: "active" },
  { value: "CALL_BACK",          label: "Передзвонити",       accent: "#818cf8", badge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",    group: "active" },
  { value: "MISSED_CALL",        label: "Недозвон",           accent: "#f59e0b", badge: "bg-orange-500/15 text-orange-400 border-orange-500/20",    group: "active" },
  { value: "TARGETED",           label: "Цільовий",          accent: "#22c55e", badge: "bg-green-500/15 text-green-400 border-green-500/20",       group: "active" },
  { value: "SCHEDULED_PROPOSAL", label: "Назначив КП",       accent: "#fb923c", badge: "bg-orange-500/15 text-orange-400 border-orange-500/20",    group: "active" },
  { value: "SET_PROPOSAL",       label: "Поставити КП",      accent: "#c084fc", badge: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20", group: "active" },
  { value: "PROPOSAL",           label: "КП",                accent: "#a78bfa", badge: "bg-violet-500/15 text-violet-400 border-violet-500/20",    group: "active" },
  { value: "INVOICE",            label: "Інвойс",            accent: "#eab308", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",    group: "active" },
  { value: "SEND_REPORT",        label: "Відправити звіт",   accent: "#0ea5e9", badge: "bg-sky-500/15 text-sky-400 border-sky-500/20",             group: "active" },
  { value: "TOUCH_1",            label: "Перший дотик",      accent: "#2dd4bf", badge: "bg-teal-500/15 text-teal-400 border-teal-500/20",          group: "active" },
  { value: "TOUCH_2",            label: "Другий дотик",      accent: "#14b8a6", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", group: "active" },
  { value: "TOUCH_3",            label: "Третій дотик",      accent: "#06b6d4", badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",          group: "active" },
  { value: "INTERESTED",         label: "Цікаво",            accent: "#34d399", badge: "bg-teal-500/15 text-teal-400 border-teal-500/20",          group: "active" },
  { value: "THINKING",           label: "Думає",             accent: "#60a5fa", badge: "bg-blue-500/15 text-blue-400 border-blue-500/20",          group: "active" },
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

export const LEAD_STATUS_BADGE: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, s.badge])
);

// Compact labels for chips/badges — drop the "Виграш — " / "Програш — " prefix.
export const LEAD_STATUS_BADGE_LABEL: Record<string, string> = Object.fromEntries(
  LEAD_STATUSES.map((s) => [s.value, LEAD_STATUS_SHORT[s.value] ?? s.label.replace(/^(Виграш|Програш) — /, "")])
);

export const WON_STATUSES = LEAD_STATUSES.filter((s) => s.group === "win").map((s) => s.value);
export const LOSS_STATUSES = LEAD_STATUSES.filter((s) => s.group === "loss").map((s) => s.value);
// Historical alias kept for older data.
export const LOSS_STATUSES_ALL = [...LOSS_STATUSES, "LOST"];

// Old status values that may still exist in the DB (pre-migration enum) → their current equivalent.
export const LEGACY_STATUS_ALIASES: Record<string, string[]> = {
  NEW_LEAD: ["NEW"],
  PROPOSAL: ["NEGOTIATION"],
  NOT_INTERESTED: ["LOST"],
};

// All DB values a status filter should match (current value + legacy aliases).
export function statusMatchValues(status: string): string[] {
  return [status, ...(LEGACY_STATUS_ALIASES[status] ?? [])];
}

// Вкладка Potential: ліди на «гарячих» стадіях (КП, Інвойс, дотики, Думає, Цікаво).
// Додатково туди потрапляють усі ліди із запланованим пушем (pushAt) — незалежно від статусу.
export const POTENTIAL_STATUSES = [
  "PROPOSAL", "INVOICE", "TOUCH_1", "TOUCH_2", "TOUCH_3", "THINKING", "INTERESTED",
];

// "Цільові" (qualified) leads — everything past first contact that is still in play or won.
export const TARGETED_STATUSES = [
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
