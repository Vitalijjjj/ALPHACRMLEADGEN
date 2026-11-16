import { addDays, endOfWeek, isSameDay, startOfDay, startOfWeek } from "date-fns";
import type { TaskItem } from "@/components/tasks/taskUtils";

// Columns of the «Терміни» board (like Bitrix): by deadline, done ones on the right.
export type DueCol = "overdue" | "today" | "week" | "next" | "later" | "none" | "done";

export const DUE_COLS: { key: DueCol; label: string; color: string; hint?: string }[] = [
  { key: "overdue", label: "Прострочені", color: "#ef4444" },
  { key: "today", label: "На сьогодні", color: "#C98C0A" },
  { key: "week", label: "На цьому тижні", color: "#38bdf8" },
  { key: "next", label: "На наступному тижні", color: "#818cf8" },
  { key: "later", label: "Пізніше", color: "#94a3b8", hint: "Більше двох тижнів" },
  { key: "none", label: "Без терміну", color: "#64748b" },
  { key: "done", label: "Завершено", color: "#22c55e" },
];

const WEEK = { weekStartsOn: 1 as const };

export function dueCol(t: TaskItem, now = new Date()): DueCol {
  if (t.status === "DONE") return "done";
  if (!t.deadline) return "none";
  const d = new Date(t.deadline);
  if (d < now) return "overdue";
  if (isSameDay(d, now)) return "today";
  if (d <= endOfWeek(now, WEEK)) return "week";
  if (d <= endOfWeek(addDays(now, 7), WEEK)) return "next";
  return "later";
}

// New deadline when a card is dropped on a column (keeps the time of day, or 10:00).
// null → «без терміну»; undefined → the column does not take drops.
export function deadlineFor(col: DueCol, t: TaskItem, now = new Date()): Date | null | undefined {
  const old = t.deadline ? new Date(t.deadline) : null;
  const at = (day: Date) => {
    const d = startOfDay(day);
    d.setHours(old ? old.getHours() : 10, old ? old.getMinutes() : 0, 0, 0);
    return d;
  };
  switch (col) {
    case "today": {
      const d = at(now);
      if (d > now) return d;
      const soon = new Date(now.getTime() + 60 * 60_000); // time already passed → in an hour
      soon.setMinutes(soon.getMinutes() < 30 ? 30 : 60, 0, 0);
      return isSameDay(soon, now) ? soon : at(now);
    }
    case "week": {
      const tomorrow = addDays(now, 1);
      return tomorrow <= endOfWeek(now, WEEK) ? at(tomorrow) : undefined;
    }
    case "next": return at(startOfWeek(addDays(now, 7), WEEK));
    case "later": return at(startOfWeek(addDays(now, 14), WEEK));
    case "none": return null;
    default: return undefined;
  }
}

export function inMonth(iso: string | null | undefined, month: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}
