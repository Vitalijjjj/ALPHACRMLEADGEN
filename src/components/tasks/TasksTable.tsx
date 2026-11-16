"use client";

import { Check, Zap, CalendarPlus, Trash2, AlertTriangle, Clock, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { PRIORITY_META } from "@/lib/taskAutomation";
import { leadDisplayName } from "@/lib/leadOptions";
import { bucketOf, fmtDue, relDue, type TaskItem } from "@/components/tasks/taskUtils";
import ListPager, { usePager } from "@/components/ui/ListPager";

// «Список»: one row per task — name + deal, deadline pill, priority, responsible (changeable right here).
export default function TasksTable({
  tasks,
  people,
  onToggle,
  onDelete,
  onOpenLead,
  onAssign,
  calendarFor,
}: {
  tasks: TaskItem[];
  people: string[];
  onToggle: (t: TaskItem, done: boolean) => void;
  onDelete: (t: TaskItem) => void;
  onOpenLead: (t: TaskItem) => void;
  onAssign: (t: TaskItem, who: string | null) => void;
  calendarFor: (t: TaskItem) => (() => void) | undefined;
}) {
  const pager = usePager(tasks, "tasks");
  if (!tasks.length) {
    return (
      <div className="py-14 text-center text-sm text-[var(--text-muted)] rounded-2xl border border-dashed border-[var(--border)]">
        Нічого не знайдено
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* phone: one card per task — the table columns leave the title 3 letters wide */}
      <div className="md:hidden divide-y divide-white/[0.05]">
        {pager.visible.map((t) => (
          <MobileTask key={t.id} t={t} people={people} onToggle={onToggle} onDelete={onDelete} onOpenLead={onOpenLead} onAssign={onAssign} cal={t.status !== "DONE" ? calendarFor(t) : undefined} />
        ))}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)] bg-white/[0.015]">
              <th className="w-10 py-2.5" />
              <th className="text-left font-medium py-2.5 pr-3">Назва</th>
              <th className="text-left font-medium py-2.5 pr-3 w-[190px]">Кінцевий термін</th>
              <th className="text-left font-medium py-2.5 pr-3 w-[110px]">Пріоритет</th>
              <th className="text-left font-medium py-2.5 pr-3 w-[170px]">Відповідальний</th>
              <th className="text-left font-medium py-2.5 pr-3 w-[110px]">Створено</th>
              <th className="w-[120px]" />
            </tr>
          </thead>
          <tbody>
            {pager.visible.map((t) => {
              const done = t.status === "DONE";
              const b = bucketOf(t.deadline);
              const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.MEDIUM;
              const cal = !done ? calendarFor(t) : undefined;
              return (
                <tr key={t.id} className="group border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors">
                  <td className="py-2 pl-3">
                    <button
                      onClick={() => onToggle(t, !done)}
                      className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center cursor-pointer transition-colors ${done ? "bg-[var(--success)] border-[var(--success)]" : "border-[var(--border)] hover:border-[var(--accent)]"}`}
                      aria-label={done ? "Повернути в роботу" : "Виконано"}
                    >
                      {done && <Check size={11} strokeWidth={3} className="text-black" />}
                    </button>
                  </td>
                  <td className="py-2 pr-3 max-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {t.autoRuleId && <Zap size={11} className="shrink-0 text-[var(--accent)]" aria-label="Автозадача" />}
                      <span className={`truncate ${done ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>{t.title}</span>
                    </div>
                    {t.lead && (
                      <button onClick={() => onOpenLead(t)} className="block max-w-full truncate text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer mt-0.5">
                        {leadDisplayName(t.lead)}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {done ? (
                      <span className="text-xs text-[var(--text-dim)]">
                        Виконано{t.completedAt ? ` ${format(new Date(t.completedAt), "dd.MM, HH:mm")}` : ""}
                      </span>
                    ) : t.deadline ? (
                      <DuePill deadline={t.deadline} bucket={b} />
                    ) : (
                      <span className="text-xs text-[var(--text-dim)]">Без терміну</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: done ? "var(--text-dim)" : pr.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: done ? "var(--text-dim)" : pr.color }} />
                      {pr.label}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={t.assignee ?? ""}
                      onChange={(e) => onAssign(t, e.target.value || null)}
                      className="w-full max-w-[160px] bg-transparent text-xs text-[var(--text-muted)] hover:text-[var(--text)] rounded-md px-1.5 py-1 border border-transparent hover:border-[var(--border)] cursor-pointer outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">— нікого —</option>
                      {[...new Set([...(t.assignee ? [t.assignee] : []), ...people])].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-xs text-[var(--text-dim)] tabular-nums">
                    {t.createdAt ? format(new Date(t.createdAt), "dd.MM, HH:mm") : ""}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-1">
                      {cal && (
                        <button onClick={cal} title="Додати зустріч у Google Календар"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
                          style={{ color: "#4285F4", background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)" }}>
                          <CalendarPlus size={12} /> Календар
                        </button>
                      )}
                      {done && (
                        <button onClick={() => onToggle(t, false)} title="Повернути в роботу"
                          className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer">
                          <RotateCcw size={12} />
                        </button>
                      )}
                      <button onClick={() => onDelete(t)} title="Видалити"
                        className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ListPager pager={pager} noun="задач" />
    </div>
  );
}

function MobileTask({ t, people, onToggle, onDelete, onOpenLead, onAssign, cal }: {
  t: TaskItem;
  people: string[];
  onToggle: (t: TaskItem, done: boolean) => void;
  onDelete: (t: TaskItem) => void;
  onOpenLead: (t: TaskItem) => void;
  onAssign: (t: TaskItem, who: string | null) => void;
  cal?: () => void;
}) {
  const done = t.status === "DONE";
  const b = bucketOf(t.deadline);
  const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.MEDIUM;
  const overdue = !done && b === "overdue";
  return (
    <div className="flex items-start gap-1 pr-2 py-1.5" style={overdue ? { background: "rgba(239,68,68,0.04)", boxShadow: "inset 3px 0 0 rgba(239,68,68,0.55)" } : { boxShadow: `inset 3px 0 0 ${done ? "transparent" : pr.color}` }}>
      {/* 44px tap target around the small box */}
      <button onClick={() => onToggle(t, !done)} className="w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer" aria-label={done ? "Повернути в роботу" : "Виконано"}>
        <span className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center transition-colors ${done ? "bg-[var(--success)] border-[var(--success)]" : "border-white/25"}`}>
          {done && <Check size={13} strokeWidth={3} className="text-black" />}
        </span>
      </button>
      <div className="flex-1 min-w-0 py-1.5">
        <button onClick={() => onOpenLead(t)} disabled={!t.lead} className="block w-full text-left cursor-pointer disabled:cursor-default">
          <div className={`text-[14px] leading-snug line-clamp-2 ${done ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
            {t.autoRuleId && <Zap size={11} className="inline -mt-0.5 mr-1 text-[var(--accent)]" />}
            {t.title}
          </div>
          {t.lead && <div className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{leadDisplayName(t.lead)}</div>}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {done ? (
            <span className="text-[11px] text-[var(--text-dim)]">Виконано{t.completedAt ? ` ${format(new Date(t.completedAt), "dd.MM, HH:mm")}` : ""}</span>
          ) : t.deadline ? <DuePill deadline={t.deadline} bucket={b} compact /> : <span className="text-[11px] text-[var(--text-dim)]">Без терміну</span>}
          {!done && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: pr.color }} title={pr.label}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: pr.color }} />
              {pr.label}
            </span>
          )}
          {/* responsible: a small initial circle, the native picker opens on tap */}
          <label className="ml-auto relative flex items-center gap-1 h-7 pl-0.5 pr-1.5 rounded-full bg-white/[0.05] border border-white/[0.07] text-[11px] text-[var(--text-muted)]">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${t.assignee ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/[0.06] text-[var(--text-dim)]"}`}>
              {t.assignee ? t.assignee.slice(0, 1).toUpperCase() : "—"}
            </span>
            <span className="max-w-[64px] truncate">{t.assignee ?? "нікого"}</span>
            <select value={t.assignee ?? ""} onChange={(e) => onAssign(t, e.target.value || null)} aria-label="Відповідальний"
              className="absolute inset-0 opacity-0 cursor-pointer">
              <option value="">— нікого —</option>
              {[...new Set([...(t.assignee ? [t.assignee] : []), ...people])].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        {(cal || done) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {cal && (
              <button onClick={cal} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
                style={{ color: "#4285F4", background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.3)" }}>
                <CalendarPlus size={12} /> Календар
              </button>
            )}
            {done && (
              <button onClick={() => onToggle(t, false)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] bg-white/[0.04] cursor-pointer">
                <RotateCcw size={11} /> Повернути
              </button>
            )}
          </div>
        )}
      </div>
      <button onClick={() => onDelete(t)} aria-label="Видалити" className="w-9 h-11 shrink-0 flex items-center justify-center text-[var(--text-dim)] active:text-red-400 cursor-pointer">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function DuePill({ deadline, bucket, compact }: { deadline: string; bucket: string; compact?: boolean }) {
  const style =
    bucket === "overdue" ? { color: "#f87171", background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)" }
    : bucket === "today" ? { color: "#fbbf24", background: "rgba(201,140,10,0.14)", borderColor: "rgba(201,140,10,0.35)" }
    : bucket === "tomorrow" ? { color: "#4ade80", background: "rgba(34,197,94,0.1)", borderColor: "rgba(34,197,94,0.28)" }
    : { color: "#7dd3fc", background: "rgba(56,189,248,0.08)", borderColor: "rgba(56,189,248,0.25)" };
  return (
    <span title={relDue(deadline)} className={`inline-flex items-center gap-1 rounded-full border font-medium tabular-nums whitespace-nowrap ${compact ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`} style={style}>
      {bucket === "overdue" ? <AlertTriangle size={compact ? 9 : 10} /> : <Clock size={compact ? 9 : 10} />}
      {bucket === "overdue" ? relDue(deadline) : fmtDue(deadline)}
    </span>
  );
}
