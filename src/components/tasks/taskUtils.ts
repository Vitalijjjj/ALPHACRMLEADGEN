import { format, isToday, isTomorrow, isYesterday, differenceInMinutes } from "date-fns";
import { uk } from "date-fns/locale";

export interface TaskLead {
  id: string;
  name: string;
  number: number;
  phone?: string | null;
  status: string;
  funnelId: string | null;
  niche?: string | null;
  instagram?: string | null;
  telegram?: string | null;
  source?: string | null;
  calendarAt: string | null;
  calendarStatus: string | null;
  kpAt?: string | null;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  assignee: string | null;
  autoRuleId?: string | null;
  autoKind?: string | null;
  autoStage?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  lead?: TaskLead | null;
}

export type Bucket = "overdue" | "today" | "tomorrow" | "later" | "none";

export const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: "overdue", label: "Прострочені", color: "#ef4444" },
  { key: "today", label: "Сьогодні", color: "#C98C0A" },
  { key: "tomorrow", label: "Завтра", color: "#38bdf8" },
  { key: "later", label: "Пізніше", color: "#94a3b8" },
  { key: "none", label: "Без терміну", color: "#64748b" },
];

export function bucketOf(deadline: string | null, now = new Date()): Bucket {
  if (!deadline) return "none";
  const d = new Date(deadline);
  if (d.getTime() < now.getTime()) return "overdue";
  if (isToday(d)) return "today";
  if (isTomorrow(d)) return "tomorrow";
  return "later";
}

// «Сьогодні, 13:00» · «Завтра, 13:00» · «пт, 14 лист., 13:00»
export function fmtDue(deadline: string): string {
  const d = new Date(deadline);
  const t = format(d, "HH:mm");
  if (isToday(d)) return `Сьогодні, ${t}`;
  if (isTomorrow(d)) return `Завтра, ${t}`;
  if (isYesterday(d)) return `Вчора, ${t}`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${format(d, sameYear ? "EEEEEE, d MMM" : "d MMM yyyy", { locale: uk })}, ${t}`;
}

// «через 2 год» / «прострочено 3 год»
export function relDue(deadline: string, now = new Date()): string {
  const min = differenceInMinutes(new Date(deadline), now);
  const abs = Math.abs(min);
  const txt = abs < 60 ? `${Math.max(1, abs)} хв` : abs < 60 * 24 ? `${Math.round(abs / 60)} год` : `${Math.round(abs / 1440)} дн`;
  return min < 0 ? `прострочено ${txt}` : `через ${txt}`;
}

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Burning first: by deadline (overdue → soonest), then priority; tasks without a deadline last.
export function sortOpen<T extends TaskItem>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
  });
}

export function sortDone<T extends TaskItem>(list: T[]): T[] {
  return [...list].sort((a, b) => new Date(b.completedAt ?? b.createdAt ?? 0).getTime() - new Date(a.completedAt ?? a.createdAt ?? 0).getTime());
}

// "YYYY-MM-DD" / "HH:mm" in the browser's time
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function localTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
