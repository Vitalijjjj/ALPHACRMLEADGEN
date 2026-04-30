"use client";

import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, AtSign } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { LeadForm, type LeadFormData } from "@/components/leads/LeadForm";
import LeadDrawer from "@/components/leads/LeadDrawer";

interface Lead {
  id: string;
  name: string;
  instagram: string | null;
  niche: string | null;
  status: string;
  source: string | null;
  _count: { tasks: number; deals: number };
}

interface ColDef { id: string; label: string; accent: string }

const ACTIVE_COLS: ColDef[] = [
  { id: "NEW_LEAD",    label: "Новий лід",   accent: "#C98C0A" },
  { id: "CONTACTED",   label: "Звʼязався",   accent: "#22d3ee" },
  { id: "MISSED_CALL", label: "Недозвон",    accent: "#f59e0b" },
  { id: "TARGETED",    label: "Цільовий",    accent: "#22c55e" },
  { id: "PROPOSAL",    label: "КП",          accent: "#a78bfa" },
  { id: "INTERESTED",  label: "Цікаво",      accent: "#34d399" },
  { id: "THINKING",    label: "Думає",       accent: "#60a5fa" },
];

const WIN_COL:  ColDef = { id: "WON",  label: "Виграш",  accent: "#22c55e" };
const LOSS_COL: ColDef = { id: "LOST", label: "Програш", accent: "#f87171" };

const LOSS_REASONS = [
  { id: "NOT_INTERESTED", label: "Не цікаво" },
  { id: "DUPLICATE",      label: "Дубль" },
  { id: "UNREACHABLE",    label: "Не змогли звʼязатись" },
  { id: "NOT_TARGET",     label: "не ЦА" },
  { id: "TOO_EXPENSIVE",  label: "Дорого" },
];

const LOSS_IDS   = new Set(LOSS_REASONS.map((r) => r.id));
const LOSS_LABEL = Object.fromEntries(LOSS_REASONS.map((r) => [r.id, r.label]));

// backward compat: old status strings → new column ids
function norm(s: string): string {
  if (s === "NEW") return "NEW_LEAD";
  if (s === "NEGOTIATION") return "PROPOSAL";
  if (s === "LOST") return "NOT_INTERESTED";
  return s;
}

function filterCol(leads: Lead[], colId: string): Lead[] {
  if (colId === "LOST") return leads.filter((l) => LOSS_IDS.has(norm(l.status)));
  return leads.filter((l) => norm(l.status) === colId);
}

function KanbanColumn({
  col, items, onOpen, isWin, isLoss,
}: {
  col: ColDef;
  items: Lead[];
  onOpen: (id: string) => void;
  isWin?: boolean;
  isLoss?: boolean;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-1.5 px-0.5 shrink-0">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide truncate"
          style={{ color: col.accent }}
        >
          {col.label}
        </span>
        <span className="text-[10px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded text-[var(--text-muted)] ml-1 shrink-0">
          {items.length}
        </span>
      </div>

      <Droppable droppableId={col.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 rounded-xl p-1.5 space-y-1.5 min-h-[60px] overflow-y-auto transition-colors"
            style={{
              background: snapshot.isDraggingOver
                ? `${col.accent}0D`
                : isWin  ? "rgba(34,197,94,0.04)"
                : isLoss ? "rgba(248,113,113,0.04)"
                : "var(--surface)",
              border: `1px solid ${
                snapshot.isDraggingOver ? `${col.accent}35`
                : isWin  ? "rgba(34,197,94,0.18)"
                : isLoss ? "rgba(248,113,113,0.18)"
                : "var(--border)"
              }`,
            }}
          >
            {items.map((lead, index) => (
              <Draggable key={lead.id} draggableId={lead.id} index={index}>
                {(prov, snap) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    {...prov.dragHandleProps}
                    onClick={() => onOpen(lead.id)}
                    className={`bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 cursor-pointer hover:border-[var(--accent)]/40 transition-all ${
                      snap.isDragging ? "shadow-lg rotate-1 opacity-90" : ""
                    }`}
                  >
                    <p className="text-[11px] font-medium text-[var(--text)] leading-snug line-clamp-2">
                      {lead.name}
                    </p>
                    {lead.niche && (
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded truncate max-w-full leading-none font-medium" style={{ color: "var(--accent)", background: "rgba(201,140,10,0.12)", border: "1px solid rgba(201,140,10,0.35)" }}>
                        {lead.niche}
                      </span>
                    )}
                    {lead.instagram && (
                      <p className="flex items-center gap-0.5 text-[9px] text-[var(--text-muted)] mt-0.5">
                        <AtSign size={8} />{lead.instagram}
                      </p>
                    )}
                    {isLoss && LOSS_IDS.has(norm(lead.status)) && (
                      <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 leading-none">
                        {LOSS_LABEL[norm(lead.status)] ?? lead.status}
                      </span>
                    )}
                    {isWin && (
                      <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 leading-none">
                        Продаж
                      </span>
                    )}
                    {(lead._count.tasks > 0 || lead._count.deals > 0) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {lead._count.tasks > 0 && (
                          <span className="text-[9px] text-[var(--text-muted)]">✓{lead._count.tasks}</span>
                        )}
                        {lead._count.deals > 0 && (
                          <span className="text-[9px] text-[var(--text-muted)]">💼{lead._count.deals}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [pendingLoss, setPendingLoss] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    const res = await fetch("/api/leads");
    setLeads(await res.json());
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.source.droppableId === result.destination.droppableId) return;

    const leadId = result.draggableId;
    const destId  = result.destination.droppableId;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    if (destId === "LOST") {
      if (!LOSS_IDS.has(norm(lead.status))) setPendingLoss(leadId);
      return;
    }

    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: destId } : l));
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: destId }),
    });
  }

  async function chooseLoss(reasonId: string) {
    if (!pendingLoss) return;
    const id = pendingLoss;
    setPendingLoss(null);
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: reasonId } : l));
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: reasonId }),
    });
  }

  async function createLead(data: LeadFormData) {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, status: data.status || "NEW_LEAD" }),
    });
    if (!res.ok) { alert("Помилка при створенні ліда"); return; }
    setShowCreate(false);
    fetchLeads();
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Pipeline</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{leads.length} лідів</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-sm rounded-lg transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Новий лід
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
          {/* 2×4 active stages grid — fits any screen, no horizontal scroll */}
          <div className="grid grid-cols-4 grid-rows-2 gap-2 flex-1 min-h-0">
            {ACTIVE_COLS.map((col) => (
              <KanbanColumn
                key={col.id}
                col={col}
                items={filterCol(leads, col.id)}
                onOpen={setOpenLead}
              />
            ))}
          </div>

          <div className="w-px bg-[var(--border)] opacity-40 shrink-0" />

          {/* Win / Loss always visible on the right */}
          <div className="flex flex-col gap-2 w-44 shrink-0 min-h-0">
            <div className="flex-1 min-h-0">
              <KanbanColumn
                col={WIN_COL}
                items={filterCol(leads, "WON")}
                onOpen={setOpenLead}
                isWin
              />
            </div>
            <div className="flex-1 min-h-0">
              <KanbanColumn
                col={LOSS_COL}
                items={filterCol(leads, "LOST")}
                onOpen={setOpenLead}
                isLoss
              />
            </div>
          </div>
        </div>
      </DragDropContext>

      {/* Loss reason picker */}
      <Modal open={!!pendingLoss} onClose={() => setPendingLoss(null)} title="Причина програшу">
        <div className="space-y-1.5">
          {LOSS_REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => chooseLoss(r.id)}
              className="w-full text-left px-4 py-2.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--border)] text-sm text-[var(--text)] transition-colors cursor-pointer"
            >
              {r.label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новий лід" size="xl">
        <LeadForm onSave={createLead} onCancel={() => setShowCreate(false)} />
      </Modal>

      {openLead && (
        <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} onUpdate={fetchLeads} />
      )}
    </div>
  );
}
