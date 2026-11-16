"use client";

import { useQuery } from "@tanstack/react-query";
import { BELL_KEY } from "@/components/tasks/useTaskActions";
import { bucketOf, fmtDue, type TaskItem } from "@/components/tasks/taskUtils";

export interface LeadTasks { count: number; overdue: number; next: TaskItem }

// open tasks grouped by lead — the same query as the header bell (one request, shared cache)
export function useOpenTasksByLead(): Map<string, LeadTasks> {
  const q = useQuery({
    queryKey: BELL_KEY,
    queryFn: async (): Promise<TaskItem[]> => {
      const res = await fetch("/api/tasks?open=1");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const map = new Map<string, LeadTasks>();
  for (const t of q.data ?? []) {
    const id = t.lead?.id;
    if (!id) continue;
    const late = bucketOf(t.deadline) === "overdue" ? 1 : 0;
    const cur = map.get(id);
    // tasks come sorted by deadline → the first one is the nearest
    if (!cur) map.set(id, { count: 1, overdue: late, next: t });
    else { cur.count++; cur.overdue += late; }
  }
  return map;
}

// red dot «висить справа» — pulses when one of them is overdue
export function TaskFlag({ info, className = "" }: { info?: LeadTasks; className?: string }) {
  if (!info) return null;
  const due = info.next.deadline ? ` · ${fmtDue(info.next.deadline)}` : "";
  const title = `Відкритих справ: ${info.count}${info.overdue ? ` (прострочено ${info.overdue})` : ""}\n${info.next.title}${due}`;
  return (
    <span title={title} className={`relative inline-flex shrink-0 w-2 h-2 ${className}`}>
      {info.overdue > 0 && <span className="absolute inset-0 rounded-full bg-[#ef4444] animate-ping opacity-60" />}
      <span className="relative w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
    </span>
  );
}
