"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TaskFlag, useOpenTasksByLead } from "@/components/tasks/TaskFlag";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Phone, CalendarPlus, Trash2, Send } from "lucide-react";
import { EdgeScroller } from "@/components/ui/EdgeScroll";
import { formatMoney, toEur } from "@/lib/currency";
import { useFx } from "@/lib/useFx";
import MessengerIcon, { messengerHref, preferredMessenger } from "@/components/ui/MessengerIcon";
import { leadDisplayName, hasRealName } from "@/lib/leadOptions";
import { resolveStage, type CrmSettings, type Funnel, type Stage } from "@/lib/crmSettings";

// Bitrix-style kanban for the «Ліди» page: one column per stage of the funnel (+ Виграш / Програш),
// colored arrow headers with count and sum, quick «+», drag & drop between stages.

export interface KanbanLead {
  id: string;
  name: string;
  phone: string | null;
  telegram: string | null;
  niche: string | null;
  service: string | null;
  source: string | null;
  sourceDetail: string | null;
  amount: number | null;
  currency?: string | null;
  status: string;
  funnelId: string | null;
  closeReason: string | null;
  messenger: string | null;
  calendarAt: string | null;
  calendarStatus: string | null;
  pushAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { tasks: number; deals: number };
}

// Column sizing: at least COL_MIN px wide, gap COL_GAP px (matches gap-1.5).
const COL_MIN = 160;
const COL_GAP = 6;

function money(n: number) {
  return formatMoney(n, "EUR");
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Card<T extends KanbanLead>({
  lead, stage, onOpen, onCalendar, onDelete,
}: {
  lead: T;
  stage: Stage;
  onOpen: () => void;
  onCalendar: () => void;
  onDelete?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const named = hasRealName(lead);
  const tasks = useOpenTasksByLead().get(lead.id);
  const side = "w-5 h-5 max-sm:w-8 max-sm:h-8 flex items-center justify-center rounded text-[var(--text-dim)] transition-colors cursor-pointer";

  return (
    <div
      onClick={onOpen}
      className="group relative flex rounded-lg bg-[var(--surface-2)] border border-white/[0.06] hover:border-white/15 hover:bg-[#1a1a1a] transition-colors cursor-pointer overflow-hidden"
    >
      <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full" style={{ background: tasks ? "#ef4444" : stage.color }} />

      {/* Info */}
      <div className="flex-1 min-w-0 pl-2.5 pr-1 pt-2 pb-1.5 flex flex-col">
        <div className="flex items-start gap-1.5">
          {tasks && <TaskFlag info={tasks} className="mt-[5px]" />}
          <p data-private="name" className={`flex-1 min-w-0 text-[12px] max-sm:text-[14px] font-semibold leading-snug line-clamp-2 ${named ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
            {leadDisplayName(lead)}
          </p>
        </div>
        <p data-private="niche" className="text-[11px] max-sm:text-[12px] leading-snug truncate mt-0.5 self-start max-w-full" style={{ color: lead.niche ? "var(--text-muted)" : "var(--text-dim)" }}>
          {lead.niche || "Ніша не вказана"}
        </p>

        {lead.phone && (
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(lead.phone!); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            data-private="contacts"
            className="mt-2.5 self-start text-[11px] max-sm:text-[13px] max-sm:py-1 leading-tight text-[#7aa7ff] hover:text-[var(--accent)] cursor-pointer truncate max-w-full"
            title="Скопіювати номер"
          >
            {copied ? <span className="text-green-400">✓ скопійовано</span> : lead.phone}
          </button>
        )}

        {/* Footer: date + amount */}
        <div className="mt-2.5 pt-1.5 border-t border-white/[0.05] flex items-center gap-2 text-[10px]">
          <span className="text-[var(--text-dim)] truncate" title={`Створено ${new Date(lead.createdAt).toLocaleString("uk-UA")}`}>
            {new Date(lead.createdAt).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}
          </span>
          <span data-private="amount" className="ml-auto font-semibold text-[11px]" style={{ color: lead.amount ? "var(--accent)" : "var(--text-dim)" }}>
            {lead.amount ? formatMoney(lead.amount, lead.currency) : "€0"}
          </span>
        </div>
      </div>

      {/* Side icons (Bitrix-like) */}
      <div className="flex flex-col items-center gap-1 max-sm:gap-0 pt-1.5 pr-1.5 pb-1.5" onClick={(e) => e.stopPropagation()}>
        {lead.phone ? (
          <a href={`tel:${lead.phone}`} title="Зателефонувати" className={`${side} hover:text-[var(--accent)]`}>
            <Phone size={11} />
          </a>
        ) : <span className={`${side} opacity-30`}><Phone size={11} /></span>}
        {(() => {
          const ch = preferredMessenger(lead);
          const href = messengerHref(ch, lead);
          return ch && href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" title={`Написати в ${ch}`} className={side}>
              <MessengerIcon channel={ch} size={8} title={`Написати в ${ch}`} />
            </a>
          ) : <span className={`${side} opacity-30`}><Send size={11} /></span>;
        })()}
        <button
          onClick={onCalendar}
          title={lead.calendarAt ? `Подія: ${shortDate(lead.calendarAt)}${lead.calendarStatus ? ` · ${lead.calendarStatus}` : ""}` : "Додати в календар"}
          className={`${side} hover:text-[#4285F4]`}
          style={lead.calendarAt ? { color: "#4285F4" } : undefined}
        >
          <CalendarPlus size={11} />
        </button>
{onDelete && (
                <button onClick={onDelete} title="Видалити" className={`${side} mt-auto opacity-0 group-hover:opacity-100 hover:text-red-400`}>
          <Trash2 size={11} />
        </button>
        )}
      </div>
    </div>
  );
}

export default function LeadsKanban<T extends KanbanLead>({
  leads,
  settings,
  funnel,
  stageIds,
  loading,
  onOpen,
  onCalendar,
  onDelete,
  onMove,
  onFinish,
  onQuickAdd,
  canAdd = true,
  canDelete = true,
}: {
  leads: T[];
  settings: CrmSettings;
  funnel: Funnel;
  stageIds: string[] | null; // columns to show (null = all stages of the funnel)
  loading: boolean;
  onOpen: (id: string) => void;
  onCalendar: (lead: T) => void;
  onDelete: (lead: T) => void;
  onMove: (lead: T, stageId: string) => void;
  onFinish: (lead: T, kind: "win" | "loss") => void;
  onQuickAdd: (stageId: string) => void;
  canAdd?: boolean;
  canDelete?: boolean;
}) {
  const { fx } = useFx();
  const columns = funnel.stages.filter((s) => !stageIds || stageIds.includes(s.id));
  const byStage = new Map<string, T[]>(columns.map((s) => [s.id, []]));
  for (const l of leads) {
    const id = resolveStage(settings, l).stage.id;
    byStage.get(id)?.push(l);
  }

  // Edge auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges, columns.length]);

  function startScroll(dir: -1 | 1) {
    stopScroll();
    const step = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft += dir * 9;
      updateEdges();
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }
  function stopScroll() {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  }
  useEffect(() => stopScroll, []);

  function onDragEnd(r: DropResult) {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
    const lead = leads.find((l) => l.id === r.draggableId);
    const target = columns.find((s) => s.id === r.destination!.droppableId);
    if (!lead || !target) return;
    if (target.kind === "active") onMove(lead, target.id);
    else onFinish(lead, target.kind);
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="relative -mx-3 sm:mx-0">
      <EdgeScroller side="left" visible={edges.left} onStart={() => startScroll(-1)} onStop={stopScroll} />
      <EdgeScroller side="right" visible={edges.right} onStart={() => startScroll(1)} onStop={stopScroll} />
      <div ref={scrollRef} onScroll={updateEdges} className="overflow-x-auto pb-2 px-3 sm:px-0 no-scrollbar max-sm:snap-x max-sm:snap-proximity max-sm:scroll-px-3">
        {/* Few stages → columns stretch to the full width; many → 160px each with horizontal scroll */}
        <div
          className="flex gap-1.5 w-full max-sm:w-max h-[calc(100dvh-330px)] sm:h-[calc(100vh-220px)]"
          style={{ minHeight: 420, minWidth: columns.length * COL_MIN + (columns.length - 1) * COL_GAP }}
        >
          {columns.map((stage, i) => {
            const items = byStage.get(stage.id) ?? [];
            // Column total in EUR (UAH / USD converted with the NBU rate)
            const sum = items.reduce((s, l) => s + toEur(l.amount, l.currency, fx), 0);
            const first = i === 0;
            return (
              <div key={stage.id} className="flex-1 basis-0 min-w-0 flex flex-col min-h-0 max-sm:flex-none max-sm:w-[82vw] max-sm:snap-start" style={{ minWidth: COL_MIN }}>
                {/* Arrow header */}
                <div
                  className="relative h-7 flex items-center gap-1.5 pr-4 text-[11px] font-semibold text-black shrink-0"
                  title={stage.label}
                  style={{
                    background: stage.color,
                    clipPath: first
                      ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)"
                      : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)",
                    paddingLeft: first ? 10 : 14,
                    borderRadius: first ? "6px 0 0 6px" : 0,
                  }}
                >
                  <span className="truncate">{stage.label}</span>
                  <span className="shrink-0 text-black/60 font-medium">{items.length}</span>
                </div>

                {/* Sum + quick add */}
                <div className="flex items-center justify-between px-1 py-1 shrink-0">
                  <span data-private="amount" className="text-[11px] font-semibold text-[var(--text)]" title="Сума в євро за курсом НБУ">{money(sum)}</span>
                  {stage.kind === "active" && canAdd && (
                    <button
                      onClick={() => onQuickAdd(stage.id)}
                      title={`Новий лід у «${stage.label}»`}
                      className="p-1 max-sm:p-2 max-sm:-my-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>

                <Droppable droppableId={stage.id}>
                  {(prov, snap) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.droppableProps}
                      className="flex-1 min-h-0 overflow-y-auto rounded-md p-1 space-y-1.5 transition-colors border"
                      style={{
                        background: snap.isDraggingOver ? `${stage.color}14` : "rgba(255,255,255,0.015)",
                        borderColor: snap.isDraggingOver ? `${stage.color}55` : "rgba(255,255,255,0.05)",
                        borderStyle: items.length ? "solid" : "dashed",
                      }}
                    >
                      {loading && items.length === 0 && <div className="h-16 rounded-lg bg-white/[0.03] animate-pulse" />}
                      {items.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(p, s) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              style={{ ...p.draggableProps.style, opacity: s.isDragging ? 0.9 : 1 }}
                            >
                              <Card
                                lead={lead}
                                stage={stage}
                                onOpen={() => onOpen(lead.id)}
                                onCalendar={() => onCalendar(lead)}
                                onDelete={canDelete ? () => onDelete(lead) : undefined}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {prov.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </DragDropContext>
  );
}
