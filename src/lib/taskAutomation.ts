// Tasks settings + stage automations («Налаштування → Задачі»). Stored inside the "crm" setting as `tasks`.
// Shared by the server and the client — keep it free of server-only imports.
//
// A rule says: when a lead lands on stage X → create these tasks (each step is timed from the previous one).
// When such a task is ticked done, the CRM can ask a question (e.g. «Клієнт оплатив?»):
//   «Так» → offers to move the lead to the next stage;
//   «Ні»  → if no planned steps are left: create one more task (repeat) or a «перекинути в програш» task (loss).
// Leaving the stage removes its unfinished automatic tasks.

import type { Funnel, Stage } from "@/lib/crmSettings";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const TASK_PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: "LOW", label: "Низький", color: "#94a3b8" },
  { key: "MEDIUM", label: "Середній", color: "#C98C0A" },
  { key: "HIGH", label: "Високий", color: "#f97316" },
  { key: "URGENT", label: "Терміново", color: "#ef4444" },
];
export const PRIORITY_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  TASK_PRIORITIES.map((p) => [p.key, { label: p.label, color: p.color }])
);

export type AutoWhen =
  | { mode: "hours"; hours: number }                  // через N годин
  | { mode: "workdays"; days: number; time: string }  // через N робочих днів о HH:MM (0 = сьогодні, якщо ще не пізно)
  | { mode: "meeting"; days: number; time: string };  // на «Дату і час КП» ліда; якщо не вказана — як workdays

export interface AutoStep {
  id: string;
  title: string;
  priority: TaskPriority;
  when: AutoWhen;
  ask: boolean; // ask the rule's question after this task (false = e.g. «Надіслати звіт» before the real push)
  assignee?: string;   // who gets this task ("" / none = the usual: the lead's last assignee or the default person)
  process?: string;    // business process run when the task is ticked done («Передати на допродаж підписки»)
  processAsk?: string; // ask this first («Клієнт дуже задоволений?») — the process runs only on «Так»
}

export type AutoNo = "nothing" | "repeat" | "loss";

export interface AutoRule {
  id: string;
  enabled: boolean;
  funnelId: string;   // "*" = every funnel (matched by the same stage id or the same stage name)
  stageId: string;
  steps: AutoStep[];
  question: string;   // asked when a task of this rule is done ("" = no question)
  yesLabel: string;   // button texts of the question ("" = «Так» / «Ні»)
  noLabel: string;
  yesStageId: string; // «Так» / «перекинути далі» → offer this stage ("" = the next stage of the funnel)
  offerNext: boolean; // no question: when every task of the stage is done → offer to move to the next stage
  onNo: AutoNo;       // «Ні» and no planned steps left
  repeat: AutoStep;   // the task created on «Ні» (repeat; «{n}» in the title = round number), or the «перекинути в програш» task (loss)
  lossReason: string; // loss reason id for onNo = "loss"
  calendar: boolean;  // tasks get a «Додати в календар» button
}

// quick buttons of the «Нова справа» popup (Налаштування → Задачі)
export interface TaskTemplate {
  id: string;
  label: string;    // on the button
  title: string;    // what the task is called
  icon: string;     // key of TASK_ICONS (client)
  color: string;
  priority: TaskPriority;
}

export function defaultTaskTemplates(): TaskTemplate[] {
  return [
    { id: "tt_call", label: "Перезвонити", title: "Перезвонити", icon: "phone", color: "#22c55e", priority: "HIGH" },
    { id: "tt_push", label: "Запушити", title: "Запушити клієнта", icon: "send", color: "#38bdf8", priority: "HIGH" },
    { id: "tt_kp", label: "Надіслати КП", title: "Надіслати КП", icon: "file", color: "#a78bfa", priority: "HIGH" },
    { id: "tt_kp2", label: "Провести КП", title: "Провести КП", icon: "presentation", color: "#c084fc", priority: "URGENT" },
    { id: "tt_report", label: "Надіслати звіт", title: "Надіслати звіт", icon: "chart", color: "#eab308", priority: "MEDIUM" },
    { id: "tt_contract", label: "Договір", title: "Надіслати договір", icon: "contract", color: "#f97316", priority: "HIGH" },
    { id: "tt_meet", label: "Призначена зустріч", title: "Призначена зустріч", icon: "calendar", color: "#818cf8", priority: "HIGH" },
  ];
}

function normTemplates(raw: unknown): TaskTemplate[] {
  if (!Array.isArray(raw)) return defaultTaskTemplates();
  const pr = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
  return raw.flatMap((x, i): TaskTemplate[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) return [];
    return [{
      id: typeof o.id === "string" && o.id ? o.id : `tt_${i}`,
      label,
      title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : label,
      icon: typeof o.icon === "string" ? o.icon : "check",
      color: typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#C98C0A",
      priority: (typeof o.priority === "string" && pr.has(o.priority) ? o.priority : "MEDIUM") as TaskPriority,
    }];
  });
}

export interface TaskSettings {
  templates: TaskTemplate[];
  assignees: string[];
  defaultAssignee: string; // automatic tasks go to this person (or to whoever had the last task of the lead)
  timezone: string;        // working days / «о 13:00» are counted in this timezone
  rules: AutoRule[];
}

// Returned by PATCH /api/tasks/[id] when an automatic task is ticked done.
export type TaskPrompt =
  | { kind: "question"; text: string; yesLabel: string; noLabel: string; yesStageId: string | null; ruleId: string }
  | { kind: "next"; nextStageId: string | null; ruleId: string }
  // a task bound to a business process with a question: «Так» runs the transfer; `after` = the usual prompt that follows
  | { kind: "process"; text: string; processId: string; processName: string; target: string; ruleId: string; after: TaskPrompt | null }
  | { kind: "loss"; reasonId: string; reasonLabel: string; ruleId: string };

export const TIMEZONES = [
  { key: "Europe/Warsaw", label: "Варшава" },
  { key: "Europe/Kyiv", label: "Київ" },
  { key: "Europe/Berlin", label: "Берлін" },
  { key: "Europe/London", label: "Лондон" },
];

// ── Defaults ──

function step(id: string, title: string, when: AutoWhen, priority: TaskPriority = "HIGH", ask = true): AutoStep {
  return { id, title, priority, when, ask };
}
const day1 = (time = "13:00"): AutoWhen => ({ mode: "workdays", days: 1, time });

export function defaultRules(): AutoRule[] {
  const base = { enabled: true, question: "", yesLabel: "", noLabel: "", yesStageId: "", offerNext: false, onNo: "nothing" as AutoNo, lossReason: "", calendar: false };
  return [
    {
      ...base,
      id: "ar_ndz",
      funnelId: "*",
      stageId: "MISSED_CALL",
      steps: [
        step("st_ndz1", "Запушити клієнта (1/5)", { mode: "hours", hours: 3 }),
        step("st_ndz2", "Запушити клієнта (2/5)", day1()),
        step("st_ndz3", "Запушити клієнта (3/5)", day1()),
        step("st_ndz4", "Запушити клієнта (4/5)", day1()),
        step("st_ndz5", "Запушити клієнта (5/5)", day1()),
      ],
      question: "Вдалося додзвонитися до клієнта?",
      yesStageId: "SCHEDULED_PROPOSAL",
      onNo: "loss",
      repeat: step("st_ndz_loss", "Перекинути в програш — не змогли дозвонитися", { mode: "hours", hours: 0 }, "MEDIUM"),
      lossReason: "UNREACHABLE",
    },
    {
      ...base,
      id: "ar_meeting_set",
      funnelId: "main",
      stageId: "SCHEDULED_PROPOSAL",
      steps: [step("st_cal", "Додати зустріч у календар", { mode: "hours", hours: 1 })],
      repeat: step("st_cal_r", "Додати зустріч у календар", day1()),
      calendar: true,
    },
    {
      ...base,
      id: "ar_kp",
      funnelId: "main",
      stageId: "PROPOSAL",
      steps: [step("st_kp", "Провести комерційну пропозицію", { mode: "meeting", days: 1, time: "13:00" }, "URGENT")],
      question: "Комерційну пропозицію проведено?",
      yesStageId: "MEETING_DONE",
      onNo: "repeat",
      repeat: step("st_kp_r", "Нагадати клієнту про КП", day1()),
    },
    {
      ...base,
      id: "ar_meeting_done",
      funnelId: "main",
      stageId: "MEETING_DONE",
      steps: [
        step("st_report", "Надіслати звіт клієнту", { mode: "hours", hours: 3 }, "URGENT", false),
        step("st_think", "Запушити клієнта — що він думає", day1()),
      ],
      question: "Клієнт подумав? Готовий рухатись далі?",
      yesLabel: "Так, на інвойс",
      noLabel: "Ще думає",
      yesStageId: "INVOICE",
      onNo: "repeat",
      repeat: step("st_think_r", "Запушити клієнта — чи він подумав", day1()),
    },
    {
      ...base,
      id: "ar_invoice",
      funnelId: "main",
      stageId: "INVOICE",
      steps: [step("st_inv", "Запушити клієнта, щоб оплатив", day1())],
      question: "Клієнт оплатив?",
      yesStageId: "PREPAYMENT",
      onNo: "repeat",
      repeat: step("st_inv_r", "Запушити клієнта, щоб оплатив", day1()),
    },
  ];
}

export function defaultTaskSettings(): TaskSettings {
  return { templates: defaultTaskTemplates(), assignees: ["Артур"], defaultAssignee: "Артур", timezone: "Europe/Warsaw", rules: defaultRules() };
}

export function newRule(funnelId: string, stageId: string): AutoRule {
  const id = Math.random().toString(36).slice(2, 8);
  return {
    id: `ar_${id}`, enabled: true, funnelId, stageId,
    steps: [step(`st_${id}`, "Нова задача", { mode: "hours", hours: 3 })],
    question: "", yesLabel: "", noLabel: "", yesStageId: "", offerNext: false, onNo: "nothing",
    repeat: step(`st_${id}r`, "Нагадати ще раз", day1()),
    lossReason: "", calendar: false,
  };
}

export function newStep(): AutoStep {
  return step(`st_${Math.random().toString(36).slice(2, 9)}`, "Нова задача", day1());
}

// ── Normalization ──

const PRIORITY_KEYS = new Set<string>(TASK_PRIORITIES.map((p) => p.key));
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function num(v: unknown, fallback: number, max: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
}

function normWhen(raw: unknown): AutoWhen {
  const w = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const time = typeof w.time === "string" && TIME_RE.test(w.time) ? w.time : "13:00";
  if (w.mode === "hours") return { mode: "hours", hours: num(w.hours, 3, 24 * 60) };
  if (w.mode === "meeting") return { mode: "meeting", days: Math.round(num(w.days, 1, 365)), time };
  return { mode: "workdays", days: Math.round(num(w.days, 1, 365)), time };
}

function normStep(raw: unknown, fallbackId: string): AutoStep {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: typeof s.id === "string" && s.id ? s.id : fallbackId,
    title: typeof s.title === "string" && s.title.trim() ? s.title : "Задача",
    priority: typeof s.priority === "string" && PRIORITY_KEYS.has(s.priority) ? (s.priority as TaskPriority) : "MEDIUM",
    when: normWhen(s.when),
    ask: s.ask !== false,
    ...(typeof s.assignee === "string" && s.assignee.trim() ? { assignee: s.assignee.trim() } : {}),
    ...(typeof s.process === "string" && s.process ? { process: s.process } : {}),
    ...(typeof s.processAsk === "string" && s.processAsk.trim() ? { processAsk: s.processAsk.trim() } : {}),
  };
}

function normRuleObj(raw: unknown): AutoRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.stageId !== "string") return null;
  return {
    id: r.id,
    enabled: r.enabled !== false,
    funnelId: typeof r.funnelId === "string" && r.funnelId ? r.funnelId : "*",
    stageId: r.stageId,
    steps: (Array.isArray(r.steps) ? r.steps : []).map((s, i) => normStep(s, `${r.id}_s${i}`)),
    question: typeof r.question === "string" ? r.question : "",
    yesLabel: typeof r.yesLabel === "string" ? r.yesLabel : "",
    noLabel: typeof r.noLabel === "string" ? r.noLabel : "",
    yesStageId: typeof r.yesStageId === "string" ? r.yesStageId : "",
    offerNext: !!r.offerNext,
    onNo: r.onNo === "repeat" || r.onNo === "loss" ? r.onNo : "nothing",
    repeat: normStep(r.repeat, `${r.id}_r`),
    lossReason: typeof r.lossReason === "string" ? r.lossReason : "",
    calendar: !!r.calendar,
  };
}

export function normalizeTaskSettings(raw: unknown): TaskSettings {
  if (!raw || typeof raw !== "object") return defaultTaskSettings();
  const t = raw as Record<string, unknown>;
  const assignees = Array.isArray(t.assignees)
    ? [...new Set(t.assignees.filter((a): a is string => typeof a === "string" && !!a.trim()).map((a) => a.trim()))]
    : defaultTaskSettings().assignees;
  const rules = Array.isArray(t.rules)
    ? t.rules.map(normRuleObj).filter((r): r is AutoRule => !!r)
    : defaultRules();
  const defaultAssignee = typeof t.defaultAssignee === "string" && assignees.includes(t.defaultAssignee) ? t.defaultAssignee : assignees[0] ?? "";
  const timezone = typeof t.timezone === "string" && isValidTz(t.timezone) ? t.timezone : "Europe/Warsaw";
  return { templates: normTemplates(t.templates), assignees, defaultAssignee, timezone, rules };
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── Matching rules to stages ──

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Finds the stage of `funnel` a rule refers to (same id, or — for «усі воронки» — the same name).
export function ruleStageIn(funnels: Funnel[], ruleFunnelId: string, stageId: string, funnel: Funnel): Stage | null {
  const direct = funnel.stages.find((s) => s.id === stageId);
  if (ruleFunnelId !== "*") return ruleFunnelId === funnel.id ? direct ?? null : null;
  if (direct) return direct;
  const ref = funnels.flatMap((f) => f.stages).find((s) => s.id === stageId);
  return ref ? funnel.stages.find((s) => sameName(s.label, ref.label)) ?? null : null;
}

export function rulesForStage(tasks: TaskSettings, funnels: Funnel[], funnel: Funnel, stageId: string): AutoRule[] {
  return tasks.rules.filter((r) => r.enabled && r.steps.length > 0 && ruleStageIn(funnels, r.funnelId, r.stageId, funnel)?.id === stageId);
}

// The stage offered on «Так» for a lead of `funnel` (same id or same name as the configured one).
export function yesStageIn(funnels: Funnel[], rule: AutoRule, funnel: Funnel): Stage | null {
  if (!rule.yesStageId) return null;
  return funnel.stages.find((s) => s.id === rule.yesStageId)
    ?? (() => {
      const ref = funnels.flatMap((f) => f.stages).find((s) => s.id === rule.yesStageId);
      return ref ? funnel.stages.find((s) => sameName(s.label, ref.label)) ?? null : null;
    })();
}

// Where «перекинути далі» goes: the configured stage, otherwise the next working stage
// (обхідні like НДЗ are skipped); after the last one — the win stage.
export function nextStageIn(funnels: Funnel[], rule: AutoRule, funnel: Funnel, current: string): Stage | null {
  const yes = yesStageIn(funnels, rule, funnel);
  if (yes) return yes;
  const active = funnel.stages.filter((s) => s.kind === "active");
  const i = active.findIndex((s) => s.id === current);
  if (i === -1) return null;
  return active.slice(i + 1).find((s) => !s.skip) ?? funnel.stages.find((s) => s.kind === "win") ?? null;
}

// ── Time maths (working days Mon–Fri, wall-clock time in a timezone) ──

interface Wall { y: number; m: number; d: number; h: number; mi: number }

function wallIn(date: Date, tz: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

// Wall-clock time in `tz` → real instant.
function fromWall(w: Wall, tz: string): Date {
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const seen = wallIn(new Date(t), tz);
    const diff = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.mi) - guess;
    t -= diff;
  }
  return new Date(t);
}

function isWorkday(y: number, m: number, d: number): boolean {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6;
}

export function workdaysAt(base: Date, days: number, time: string, tz: string): Date {
  const [h, mi] = time.split(":").map(Number);
  const w = wallIn(base, tz);
  let cur = new Date(Date.UTC(w.y, w.m - 1, w.d));
  const ymd = () => ({ y: cur.getUTCFullYear(), m: cur.getUTCMonth() + 1, d: cur.getUTCDate() });
  const next = () => { cur = new Date(cur.getTime() + 86_400_000); };
  if (days <= 0) {
    // today if it is a working day and the time is still ahead, else the next working day
    let c = ymd();
    if (!isWorkday(c.y, c.m, c.d) || fromWall({ ...c, h, mi }, tz).getTime() <= base.getTime()) {
      do { next(); c = ymd(); } while (!isWorkday(c.y, c.m, c.d));
    }
  } else {
    let left = days;
    while (left > 0) {
      next();
      const c = ymd();
      if (isWorkday(c.y, c.m, c.d)) left--;
    }
  }
  return fromWall({ ...ymd(), h, mi }, tz);
}

export function computeDue(when: AutoWhen, base: Date, tz: string, kpAt?: Date | null): Date {
  if (when.mode === "hours") return new Date(base.getTime() + when.hours * 3_600_000);
  if (when.mode === "meeting" && kpAt) return kpAt;
  return workdaysAt(base, when.days, when.time, tz);
}

export function describeWhen(when: AutoWhen, first: boolean): string {
  const from = first ? "після переходу на стадію" : "після попередньої";
  if (when.mode === "hours") return when.hours === 0 ? "одразу" : `через ${when.hours} год ${from}`;
  const d = when.days === 0 ? "сьогодні (або наступного робочого дня)" : when.days === 1 ? "наступного робочого дня" : `через ${when.days} робочих дн.`;
  if (when.mode === "meeting") return `на дату КП; якщо не вказана — ${d} о ${when.time}`;
  return `${d} о ${when.time}`;
}
