"use client";

import { useState } from "react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { uk } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, X, Check } from "lucide-react";
import { PRIORITY_META } from "@/lib/taskAutomation";
import { leadDisplayName } from "@/lib/leadOptions";
import { bucketOf, sortOpen, type TaskItem } from "@/components/tasks/taskUtils";

const PER_DAY = 5;
const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"];

// «Календар»: month grid, tasks on their deadline day. «+» on a day → new task for that day.
export default function TasksCalendar({
  tasks,
  month,
  onMonth,
  onToggle,
  onOpen,
  onCreate,
}: {
  tasks: TaskItem[];
  month: Date;
  onMonth: (d: Date) => void;
  onToggle: (t: TaskItem, done: boolean) => void;
  onOpen: (t: TaskItem) => void;
  onCreate: (day: Date) => void;
}) {
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const today = new Date();

  const byDay = new Map<string, TaskItem[]>();
  for (const t of tasks) {
    if (!t.deadline) continue;
    const k = format(new Date(t.deadline), "yyyy-MM-dd");
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const dayTasks = (d: Date) => {
    const list = byDay.get(format(d, "yyyy-MM-dd")) ?? [];
    return [...sortOpen(list.filter((t) => t.status !== "DONE")), ...list.filter((t) => t.status === "DONE")];
  };
  const noDeadline = tasks.filter((t) => !t.deadline && t.status !== "DONE").length;

  const title = format(month, "LLLL", { locale: uk });

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* month nav */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-base font-semibold text-[var(--text)] capitalize">
          {title} <span className="text-[var(--text-muted)] font-normal">{format(month, "yyyy")}</span>
        </h2>
        {noDeadline > 0 && <span className="hidden sm:inline text-[11px] text-[var(--text-dim)] ml-2">{noDeadline} без терміну — у «Список» / «Терміни»</span>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onMonth(addMonths(month, -1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Попередній місяць"><ChevronLeft size={16} /></button>
          <button onClick={() => onMonth(startOfMonth(new Date()))} className="px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] hover:bg-white/[0.04] cursor-pointer">Сьогодні</button>
          <button onClick={() => onMonth(addMonths(month, 1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Наступний місяць"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* phone: the 7-column grid is unreadable — a day-by-day agenda of the month instead */}
      <div className="md:hidden">
        <MiniMonth days={days} month={month} today={today} count={(d) => dayTasks(d).filter((t) => t.status !== "DONE").length}
          overdue={(d) => dayTasks(d).some((t) => t.status !== "DONE" && bucketOf(t.deadline) === "overdue")}
          onPick={(d) => document.getElementById(`agenda-${format(d, "yyyy-MM-dd")}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        {(() => {
          const inMonthDays = days.filter((d) => isSameMonth(d, month) && (dayTasks(d).length || isSameDay(d, today)));
          if (!inMonthDays.length) return <div className="py-10 text-center text-sm text-[var(--text-muted)]">У цьому місяці задач немає</div>;
          return inMonthDays.map((d) => {
            const list = dayTasks(d);
            const isToday = isSameDay(d, today);
            return (
              <div key={d.toISOString()} id={`agenda-${format(d, "yyyy-MM-dd")}`} className="border-t border-white/[0.05] scroll-mt-20">
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1" style={isToday ? { background: "rgba(201,140,10,0.07)" } : undefined}>
                  <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums ${isToday ? "bg-[var(--accent)] text-black" : "bg-white/[0.05] text-[var(--text)]"}`}>{d.getDate()}</span>
                  <span className="text-xs font-medium capitalize text-[var(--text-muted)]">{isToday ? "Сьогодні · " : ""}{format(d, "EEEE", { locale: uk })}</span>
                  <span className="text-[11px] text-[var(--text-dim)]">{list.length ? `${list.length} задач` : ""}</span>
                  <button onClick={() => onCreate(d)} aria-label="Нова задача на цей день" className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] active:text-[var(--accent)] cursor-pointer"><Plus size={16} /></button>
                </div>
                <div className="pb-2">
                  {list.map((t) => {
                    const done = t.status === "DONE";
                    const overdue = !done && bucketOf(t.deadline) === "overdue";
                    const color = done ? "#22c55e" : overdue ? "#ef4444" : (PRIORITY_META[t.priority] ?? PRIORITY_META.MEDIUM).color;
                    return (
                      <div key={t.id} className="flex items-center gap-1 pr-3">
                        <button onClick={() => onToggle(t, !done)} className="w-11 h-11 shrink-0 flex items-center justify-center cursor-pointer" aria-label={done ? "Повернути в роботу" : "Виконано"}>
                          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${done ? "bg-[var(--success)] border-[var(--success)]" : "border-white/25"}`}>{done && <Check size={12} strokeWidth={3} className="text-black" />}</span>
                        </button>
                        <button onClick={() => onOpen(t)} className="flex-1 min-w-0 text-left py-1 cursor-pointer">
                          <div className={`text-sm leading-snug line-clamp-2 ${done ? "line-through text-[var(--text-muted)]" : overdue ? "text-red-300" : "text-[var(--text)]"}`}>{t.title}</div>
                          {t.lead && <div className="text-[11px] text-[var(--text-muted)] truncate">{leadDisplayName(t.lead)}</div>}
                        </button>
                        <span className="flex items-center gap-1.5 shrink-0 text-[11px] tabular-nums text-[var(--text-dim)]">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          {t.deadline ? format(new Date(t.deadline), "HH:mm") : ""}
                        </span>
                      </div>
                    );
                  })}
                  {!list.length && <div className="px-3 pb-1 text-xs text-[var(--text-dim)]">Задач немає</div>}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[840px]">
          <div className="grid grid-cols-7 border-b border-[var(--border)]">
            {WD.map((w, i) => (
              <div key={w} className={`px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-right ${i >= 5 ? "text-[var(--text-dim)]" : "text-[var(--text-muted)]"}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const list = dayTasks(d);
              const isToday = isSameDay(d, today);
              const other = !isSameMonth(d, month);
              const weekend = i % 7 >= 5;
              const overdue = list.filter((t) => t.status !== "DONE" && bucketOf(t.deadline) === "overdue").length;
              return (
                <div
                  key={d.toISOString()}
                  className={`group relative min-h-[128px] border-b border-r border-white/[0.05] p-1.5 flex flex-col ${(i + 1) % 7 === 0 ? "border-r-0" : ""}`}
                  style={{ background: isToday ? "rgba(201,140,10,0.07)" : weekend ? "rgba(255,255,255,0.012)" : undefined }}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <button onClick={() => onCreate(d)} title="Нова задача на цей день"
                      className="p-0.5 rounded text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <Plus size={12} />
                    </button>
                    {overdue > 0 && <span className="text-[10px] text-red-400 font-medium">{overdue} простр.</span>}
                    <span className={`ml-auto text-xs tabular-nums w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-[var(--accent)] text-black font-bold" : other ? "text-[var(--text-dim)]" : "text-[var(--text-muted)]"}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-px flex-1">
                    {list.slice(0, PER_DAY).map((t) => <Chip key={t.id} t={t} onOpen={onOpen} />)}
                  </div>
                  {list.length > PER_DAY && (
                    <button onClick={() => setDayOpen(d)} className="mt-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer text-center w-full">
                      показати всі {list.length}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* all tasks of one day */}
      {dayOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setDayOpen(null); }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setDayOpen(null)} />
          <div className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl dialog-pop">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text)] capitalize">{format(dayOpen, "EEEE, d MMMM", { locale: uk })}</h3>
              <span className="text-xs text-[var(--text-dim)]">{dayTasks(dayOpen).length} задач</span>
              <button onClick={() => setDayOpen(null)} className="ml-auto p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Закрити"><X size={14} /></button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {dayTasks(dayOpen).map((t) => {
                const done = t.status === "DONE";
                return (
                  <div key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04]">
                    <button onClick={() => onToggle(t, !done)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${done ? "bg-[var(--success)] border-[var(--success)]" : "border-[var(--border)] hover:border-[var(--accent)]"}`}>
                      {done && <Check size={10} strokeWidth={3} className="text-black" />}
                    </button>
                    <button onClick={() => { setDayOpen(null); onOpen(t); }} className="min-w-0 flex-1 text-left cursor-pointer">
                      <div className={`text-sm truncate ${done ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>{t.title}</div>
                      {t.lead && <div className="text-[11px] text-[var(--text-muted)] truncate">{leadDisplayName(t.lead)}</div>}
                    </button>
                    <span className="text-[11px] tabular-nums text-[var(--text-dim)]">{t.deadline ? format(new Date(t.deadline), "HH:mm") : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// phone: a small month grid on top of the agenda — dots show busy days, tap jumps to the day
function MiniMonth({ days, month, today, count, overdue, onPick }: { days: Date[]; month: Date; today: Date; count: (d: Date) => number; overdue: (d: Date) => boolean; onPick: (d: Date) => void }) {
  return (
    <div className="px-2 pb-2">
      <div className="grid grid-cols-7">
        {WD.map((w, i) => <div key={w} className={`py-1 text-center text-[10px] uppercase ${i >= 5 ? "text-[var(--text-dim)]" : "text-[var(--text-muted)]"}`}>{w}</div>)}
        {days.map((d) => {
          const n = count(d);
          const other = !isSameMonth(d, month);
          const isToday = isSameDay(d, today);
          return (
            <button key={d.toISOString()} disabled={other} onClick={() => onPick(d)} className="h-10 flex flex-col items-center justify-center gap-0.5 rounded-lg cursor-pointer disabled:cursor-default active:bg-white/[0.06]">
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[13px] tabular-nums ${isToday ? "bg-[var(--accent)] text-black font-bold" : other ? "text-[var(--text-dim)]/50" : "text-[var(--text)]"}`}>{d.getDate()}</span>
              <span className="h-1 w-1 rounded-full" style={{ background: other || !n ? "transparent" : overdue(d) ? "#ef4444" : "var(--accent)" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ t, onOpen }: { t: TaskItem; onOpen: (t: TaskItem) => void }) {
  const done = t.status === "DONE";
  const overdue = !done && bucketOf(t.deadline) === "overdue";
  const color = done ? "#22c55e" : overdue ? "#ef4444" : (PRIORITY_META[t.priority] ?? PRIORITY_META.MEDIUM).color;
  return (
    <button
      onClick={() => onOpen(t)}
      title={`${t.title}${t.lead ? ` — ${leadDisplayName(t.lead)}` : ""}`}
      className="w-full flex items-center gap-1.5 px-1 py-[3px] rounded-md text-left hover:bg-white/[0.06] cursor-pointer transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className={`flex-1 truncate text-[11px] ${done ? "line-through text-[var(--text-dim)]" : overdue ? "text-red-300" : "text-[var(--text)]"}`}>{t.title}</span>
      <span className="text-[10px] tabular-nums text-[var(--text-dim)] shrink-0">{t.deadline ? format(new Date(t.deadline), "HH:mm") : ""}</span>
    </button>
  );
}
