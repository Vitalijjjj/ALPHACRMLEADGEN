"use client";

import { Check, Zap, CalendarPlus, Trash2, RotateCcw, User, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { PRIORITY_META } from "@/lib/taskAutomation";
import { leadDisplayName } from "@/lib/leadOptions";
import { bucketOf, fmtDue, relDue, type TaskItem } from "@/components/tasks/taskUtils";

// One task line: checkbox, title, «авто» mark, priority, deadline, responsible person, actions.
export default function TaskRow({
  task,
  onToggle,
  onDelete,
  onCalendar,
  onOpenLead,
  showLead = false,
}: {
  task: TaskItem;
  onToggle: (done: boolean) => void;
  onDelete?: () => void;
  onCalendar?: () => void;
  onOpenLead?: () => void;
  showLead?: boolean;
}) {
  const done = task.status === "DONE";
  const bucket = bucketOf(task.deadline);
  const pr = PRIORITY_META[task.priority] ?? PRIORITY_META.MEDIUM;
  const dueColor = done ? "var(--text-dim)" : bucket === "overdue" ? "#f87171" : bucket === "today" ? "#fbbf24" : "var(--text-muted)";

  return (
    <div
      className={`group flex items-start gap-2.5 px-2.5 py-2 rounded-lg border transition-colors ${done ? "bg-transparent border-white/[0.04]" : "bg-[var(--surface-2)] border-white/[0.05] hover:border-white/[0.1]"}`}
      style={!done && bucket === "overdue" ? { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" } : undefined}
    >
      <button
        onClick={() => onToggle(!done)}
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-colors ${done ? "bg-[var(--success)] border-[var(--success)]" : "border-[var(--border)] hover:border-[var(--accent)]"}`}
        aria-label={done ? "Повернути в роботу" : "Виконано"}
        title={done ? "Повернути в роботу" : "Позначити виконаною"}
      >
        {done && <Check size={10} strokeWidth={3} className="text-black" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.autoRuleId && (
            <span title="Автозадача (Налаштування → Задачі)" className="shrink-0 text-[var(--accent)]"><Zap size={11} /></span>
          )}
          <span className={`text-sm truncate ${done ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>{task.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px]">
          {showLead && task.lead && (
            <button onClick={onOpenLead} className="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer truncate max-w-[220px]">
              {leadDisplayName(task.lead)}
            </button>
          )}
          {done ? (
            <span className="text-[var(--text-dim)]">
              Виконано{task.completedAt ? ` ${format(new Date(task.completedAt), "dd.MM HH:mm")}` : ""}
            </span>
          ) : task.deadline ? (
            <span className="flex items-center gap-1" style={{ color: dueColor }} title={relDue(task.deadline)}>
              {bucket === "overdue" ? <AlertTriangle size={10} /> : <Clock size={10} />}
              {fmtDue(task.deadline)}
              {bucket === "overdue" && <span className="opacity-80">· {relDue(task.deadline)}</span>}
            </span>
          ) : (
            <span className="text-[var(--text-dim)]">Без терміну</span>
          )}
          {!done && (
            <span className="px-1.5 rounded font-medium" style={{ color: pr.color, background: `${pr.color}1f` }}>{pr.label}</span>
          )}
          {task.assignee && (
            <span className="flex items-center gap-0.5 text-[var(--text-muted)]"><User size={10} />{task.assignee}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!done && onCalendar && (
          <button
            onClick={onCalendar}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
            style={{ color: "#4285F4", background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)" }}
            title="Додати зустріч у Google Календар"
          >
            <CalendarPlus size={12} /> Календар
          </button>
        )}
        {done && (
          <button
            onClick={() => onToggle(false)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer"
          >
            <RotateCcw size={11} /> Повернути
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 rounded-md text-[var(--text-dim)] hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
            title="Видалити справу"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
