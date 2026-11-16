// Roles & access («Налаштування → Доступи»). Stored inside the "crm" setting as `access`.
// Shared by the server and the client — no server-only imports here.
//
// Owner (the ADMIN_EMAIL login) always has full access and manages users & roles.
// A role says which sidebar pages a user sees and, per funnel, what they can do with its deals:
// view (see), create (add), edit (change fields / stage / tasks / comments), delete.

// Every page has its own tick. «dashboard» and «pnl» are not ticked by hand — a role gets them by itself
// when it has any report of the dashboard / any finance page (the shared data APIs check them).
export type PageKey =
  | "dashboard" | "pnl"
  | "dash_overview" | "dash_leads" | "dash_sales" | "ads" | "dash_projects" | "dash_finance" | "dash_pnl" | "dash_story" | "dash_partners"
  | "crm" | "projects" | "cases" | "tasks"
  | "fin_cashflow" | "fin_schedule" | "fin_accounts" | "fin_team" | "fin_subs"
  | "pushes" | "settings";

export interface PageDef { key: PageKey; label: string; href: string }
// groups of ticks in «Налаштування → Доступи» (and the order pages are tried after login)
export const PAGE_GROUPS: { label: string; pages: PageDef[] }[] = [
  { label: "Дашборд", pages: [
    { key: "dash_overview", label: "Огляд", href: "/" },
    { key: "dash_leads", label: "Ліди і конверсії", href: "/conversions" },
    { key: "dash_sales", label: "Продажі", href: "/sales" },
    { key: "ads", label: "Реклама", href: "/ads" },
    { key: "dash_projects", label: "Проєкти", href: "/pnl/project-stats" },
    { key: "dash_finance", label: "Фінанси", href: "/pnl/overview" },
    { key: "dash_pnl", label: "P&L", href: "/pnl" },
    { key: "dash_story", label: "Instagram", href: "/story" },
    { key: "dash_partners", label: "Партнери", href: "/partners" },
  ] },
  { label: "Робота", pages: [
    { key: "crm", label: "CRM", href: "/leads" },
    { key: "projects", label: "Проєкти", href: "/projects" },
    { key: "cases", label: "Кейси", href: "/cases" },
    { key: "tasks", label: "Задачі", href: "/tasks" },
    { key: "pushes", label: "Пуші", href: "/pushes" },
  ] },
  { label: "Облік", pages: [
    { key: "fin_cashflow", label: "Кешфлоу", href: "/pnl/cashflow" },
    { key: "fin_schedule", label: "Графік оплат", href: "/pnl/schedule" },
    { key: "fin_accounts", label: "Рахунки", href: "/pnl/accounts" },
    { key: "fin_team", label: "Співробітники", href: "/pnl/team" },
    { key: "fin_subs", label: "Підписки", href: "/pnl/subscriptions" },
  ] },
  { label: "Інше", pages: [
    { key: "settings", label: "Налаштування", href: "/settings" },
  ] },
];
export const PAGES: PageDef[] = PAGE_GROUPS.flatMap((g) => g.pages);
const DASH_KEYS: PageKey[] = ["dash_overview", "dash_leads", "dash_sales", "dash_projects", "dash_finance", "dash_pnl", "dash_story", "dash_partners"];
const FIN_KEYS: PageKey[] = ["projects", "dash_projects", "dash_finance", "dash_pnl", "fin_cashflow", "fin_schedule", "fin_accounts", "fin_team", "fin_subs"];

// + the umbrella keys a role gets by itself
export function withImplied(pages: PageKey[]): PageKey[] {
  const out = new Set(pages);
  if (pages.some((p) => DASH_KEYS.includes(p))) out.add("dashboard");
  if (pages.some((p) => FIN_KEYS.includes(p))) out.add("pnl");
  return [...out];
}

// Which notifications (the bell in the header) a role gets.
export type NotifyKey = "tasks" | "leads" | "projects" | "payments";
export const NOTIFY: { key: NotifyKey; label: string; hint: string }[] = [
  { key: "tasks", label: "Справи", hint: "прострочені й сьогоднішні задачі" },
  { key: "leads", label: "Нові ліди", hint: "ліди за останні 7 днів" },
  { key: "projects", label: "Нові проєкти", hint: "угоди «Операційки» в роботі" },
  { key: "payments", label: "Оплати", hint: "прострочені й найближчі оплати клієнтів" },
];
const NOTIFY_KEYS = new Set<string>(NOTIFY.map((n) => n.key));
export const DEFAULT_NOTIFY: NotifyKey[] = ["tasks", "leads"];

export type FunnelAction = "view" | "create" | "edit" | "delete";
export type FunnelPerm = Record<FunnelAction, boolean>;

export const FUNNEL_ACTIONS: { key: FunnelAction; label: string }[] = [
  { key: "view", label: "Перегляд" },
  { key: "create", label: "Додавання" },
  { key: "edit", label: "Редагування" },
  { key: "delete", label: "Видалення" },
];

export const NO_PERM: FunnelPerm = { view: false, create: false, edit: false, delete: false };
export const FULL_PERM: FunnelPerm = { view: true, create: true, edit: true, delete: true };

export interface Role {
  id: string;
  name: string;
  pages: PageKey[];
  funnels: Record<string, FunnelPerm>; // funnel id → permissions (missing = no access)
  notify: NotifyKey[];                 // сповіщення в дзвіночку
}

export interface AccessSettings {
  roles: Role[];
}

// What the current user may do (from /api/me).
export interface Access {
  owner: boolean;
  userId: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string;
  pages: PageKey[];
  funnels: Record<string, FunnelPerm>;
  notify: NotifyKey[];
}

const PAGE_KEYS = new Set<string>(PAGES.map((p) => p.key));

// old roles had one tick for the whole dashboard («dashboard») and one for all finance («pnl»)
function migratePages(raw: string[]): PageKey[] {
  const set = new Set(raw.map((p) => (p === "payments" ? "pnl" : p)));
  if (set.has("dashboard") && !DASH_KEYS.some((k) => set.has(k))) DASH_KEYS.filter((k) => !["dash_projects", "dash_finance", "dash_pnl"].includes(k)).forEach((k) => set.add(k));
  if (set.has("pnl") && !FIN_KEYS.some((k) => set.has(k))) FIN_KEYS.forEach((k) => set.add(k));
  return [...set].filter((p): p is PageKey => PAGE_KEYS.has(p));
}

export function newRoleId(): string {
  return `role_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function defaultAccess(): AccessSettings {
  return {
    roles: [
      { id: "role_manager", name: "Менеджер продажів", pages: ["crm", "tasks"], funnels: { main: { view: true, create: true, edit: true, delete: false } }, notify: DEFAULT_NOTIFY },
    ],
  };
}

// edit / create / delete without view makes no sense → view is switched on
export function normPerm(raw: unknown): FunnelPerm {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p: FunnelPerm = { view: !!r.view, create: !!r.create, edit: !!r.edit, delete: !!r.delete };
  if (p.create || p.edit || p.delete) p.view = true;
  return p;
}

export function normalizeAccess(raw: unknown): AccessSettings {
  if (!raw || typeof raw !== "object") return defaultAccess();
  const v = raw as { roles?: unknown };
  if (!Array.isArray(v.roles)) return defaultAccess();
  const roles: Role[] = [];
  for (const x of v.roles) {
    if (!x || typeof x !== "object" || typeof (x as Role).id !== "string") continue;
    const r = x as Partial<Role>;
    const funnels: Record<string, FunnelPerm> = {};
    if (r.funnels && typeof r.funnels === "object") {
      for (const [k, p] of Object.entries(r.funnels)) {
        const perm = normPerm(p);
        if (perm.view) funnels[k] = perm;
      }
    }
    roles.push({
      id: r.id!,
      name: typeof r.name === "string" && r.name.trim() ? r.name : "Роль",
      pages: Array.isArray(r.pages) ? migratePages((r.pages as unknown[]).filter((p): p is string => typeof p === "string")) : [],
      funnels,
      notify: Array.isArray(r.notify) ? [...new Set((r.notify as string[]).filter((k): k is NotifyKey => typeof k === "string" && NOTIFY_KEYS.has(k)))] : DEFAULT_NOTIFY,
    });
  }
  return { roles };
}

// ── Checks (work on the client and the server) ──

export function canPage(access: Access | null | undefined, page: PageKey): boolean {
  if (!access) return false;
  return access.owner || access.pages.includes(page);
}

export function canNotify(access: Access | null | undefined, key: NotifyKey): boolean {
  if (!access) return false;
  return access.owner || access.notify.includes(key);
}

export function funnelPerm(access: Access | null | undefined, funnelId: string): FunnelPerm {
  if (!access) return NO_PERM;
  if (access.owner) return FULL_PERM;
  return access.funnels[funnelId] ?? NO_PERM;
}

export function can(access: Access | null | undefined, funnelId: string, action: FunnelAction): boolean {
  return funnelPerm(access, funnelId)[action];
}

// Which page a URL belongs to (null = not limited, e.g. the login page).
export function pageForPath(path: string): PageKey | null {
  if (path === "/pnl/transfers") return "fin_cashflow";
  // exact for «/» and «/pnl» (other pages live under them), by prefix for the rest — the longest href wins
  const hit = [...PAGES].sort((a, b) => b.href.length - a.href.length)
    .find((p) => path === p.href || (p.href !== "/" && p.href !== "/pnl" && path.startsWith(`${p.href}/`)));
  return hit?.key ?? null;
}

export function firstAllowedHref(access: Access | null | undefined): string | null {
  return PAGES.find((p) => canPage(access, p.key))?.href ?? null;
}
