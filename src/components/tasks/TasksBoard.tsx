"use client";

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Check, User, Zap } from "lucide-react";
import { format } from "date-fns";
import { PRIORITY_META } from "@/lib/taskAutomation";
import { leadDisplayName } from "@/lib/leadOptions";
import { bucketOf, sortDone, sortOpen, type TaskItem } from "@/components/tasks/taskUtils";
import { DUE_COLS, dueCol, deadlineFor, type DueCol } from "@/components/tasks/taskViews";
import { DuePill } from "@/components/tasks/TasksTable";

const DONE_LIMIT = 60;

// «Терміни»: columns by deadline. Drag a card to another column → its deadline moves there
// («На сьогодні», «На наступному тижні», …); into «Завершено» → done.
export default function TasksBoard({
  tasks,
  showDone,
  onToggle,
  onMove,
  onOpenLead,
}: {
  tasks: TaskItem[];
  showDone: boolean;
  onToggle: (t: TaskItem, done: boolean) => void;
  onMove: (t: TaskItem, deadline: Date | null) => void;
  onOpenLead: (t: TaskItem) => void;
}) {
  const now = new Date();
  const cols = DUE_COLS.filter((c) => c.key !== "done" || showDone).map((c) => {
    const items = tasks.filter((t) => dueCol(t, now) === c.key);
    return { ...c, total: items.length, items: c.key === "done" ? sortDone(items).slice(0, DONE_LIMIT) : sortOpen(items) };
  });

  function onDragEnd(r: DropResult) {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
    const t = tasks.find((x) => x.id === r.draggableId);
    if (!t) return;
    const to = r.destination.droppableId as DueCol;
    if (to === "done") return onToggle(t, true);
    const d = deadlineFor(to, t);
    if (d === undefined) return;
    if (t.status === "DONE") onToggle(t, false);
    onMove(t, d);
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-3 px-3 sm:-mx-1 sm:px-1 snap-x snap-mandatory sm:snap-proximity scroll-px-3 sm:scroll-px-1">
        {cols.map((c) => {
          const canDrop = c.key !== "overdue" && (c.key !== "week" || deadlineFor("week", { deadline: null } as TaskItem) !== undefined);
          return (
            <div key={c.key} className="w-[85vw] max-w-[340px] sm:w-[272px] shrink-0 snap-start flex flex-col max-h-[calc(100dvh-260px)] sm:max-h-[calc(100vh-220px)]">
              <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0 border-[var(--border)]"
                style={{ background: `linear-gradient(180deg, ${c.color}24, ${c.color}0a)` }}>
                <span className="w-2 h-2 rounded-full" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                <span className="text-xs font-semibold text-[var(--text)] truncate" title={c.hint}>{c.label}</span>
                <span className="ml-auto text-[11px] font-semibold tabular-nums px-1.5 rounded-md" style={{ color: c.color, background: `${c.color}1f` }}>{c.total}</span>
              </div>
              <div className="h-[2px]" style={{ background: c.color }} />
              <Droppable droppableId={c.key} isDropDisabled={!canDrop}>
                {(p, s) => (
                  <div
                    ref={p.innerRef}
                    {...p.droppableProps}
                    className="flex-1 overflow-y-auto space-y-2 p-2 rounded-b-xl border border-t-0 border-[var(--border)] transition-colors min-h-[120px]"
                    style={{ background: s.isDraggingOver ? `${c.color}14` : "rgba(255,255,255,0.012)" }}
                  >
                    {c.items.map((t, i) => (
                      <Draggable key={t.id} draggableId={t.id} index={i}>
                        {(dp, ds) => (
                          <div ref={dp.innerRef} {...dp.draggableProps} {...dp.dragHandleProps}>
                            <Card t={t} dragging={ds.isDragging} onToggle={onToggle} onOpenLead={onOpenLead} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {p.placeholder}
                    {!c.items.length && !s.isDraggingOver && (
                      <div className="py-6 text-center text-[11px] text-[var(--text-dim)]">{canDrop ? "Перетягни сюди задачу" : "Порожньо"}</div>
                    )}
                    {c.key === "done" && c.total > DONE_LIMIT && (
                      <div className="py-2 text-center text-[11px] text-[var(--text-dim)]">і ще {c.total - DONE_LIMIT} — див. «Список»</div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}

function Card({ t, dragging, onToggle, onOpenLead }: { t: TaskItem; dragging: boolean; onToggle: (t: TaskItem, done: boolean) => void; onOpenLead: (t: TaskItem) => void }) {
  const done = t.status === "DONE";
  const b = bucketOf(t.deadline);
  const pr = PRIORITY_META[t.priority] ?? PRIORITY_META.MEDIUM;
  return (
    <div
      className={`group rounded-xl border p-2.5 transition-[box-shadow,border-color,transform] duration-150 ${dragging ? "shadow-2xl scale-[1.02] border-[var(--accent)]" : "border-white/[0.06] hover:border-white/[0.14]"}`}
      style={{ background: dragging ? "var(--surface-2)" : "var(--surface)", borderLeft: `3px solid ${done ? "#22c55e66" : pr.color}` }}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(t, !done)}
          className={`mt-px w-5 h-5 sm:w-4 sm:h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${done ? "bg-[var(--success)] border-[var(--success)]" : "border-[var(--border)] hover:border-[var(--accent)]"}`}
          aria-label={done ? "Повернути в роботу" : "Виконано"}
        >
          {done && <Check size={10} strokeWidth={3} className="text-black" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] leading-snug ${done ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
            {t.autoRuleId && <Zap size={10} className="inline -mt-0.5 mr-1 text-[var(--accent)]" />}
            {t.title}
          </div>
          {t.lead && (
            <button onClick={() => onOpenLead(t)} className="block max-w-full truncate text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer mt-0.5">
              {leadDisplayName(t.lead)}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 pl-6">
        {done
          ? <span className="text-[10px] text-[var(--text-dim)]">Виконано{t.completedAt ? ` ${format(new Date(t.completedAt), "dd.MM HH:mm")}` : ""}</span>
          : t.deadline ? <DuePill deadline={t.deadline} bucket={b} compact /> : <span className="text-[10px] text-[var(--text-dim)]">Без терміну</span>}
        {t.assignee && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--text-muted)] truncate max-w-[100px]" title={t.assignee}>
            <span className="w-4 h-4 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0"><User size={9} /></span>
            {t.assignee}
          </span>
        )}
      </div>
    </div>
  );
}
