"use client";

import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, AtSign, Search, Filter, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { LeadForm, type LeadFormData } from "@/components/leads/LeadForm";
import LeadDrawer from "@/components/leads/LeadDrawer";
import { LEAD_STATUSES, LEAD_STATUS_SHORT, LEAD_SOURCES } from "@/lib/leadOptions";

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

// Kanban columns come straight from the shared status list — every active status is a column.
const ACTIVE_COLS: ColDef[] = LEAD_STATUSES
  .filter((s) => s.group === "active")
  .map((s) => ({ id: s.value, label: LEAD_STATUS_SHORT[s.value] ?? s.label, accent: s.accent }));

const WIN_COL:  ColDef = { id: "WON",  label: "Виграш",  accent: "#22c55e" };
const LOSS_COL: ColDef = { id: "LOST", label: "Програш", accent: "#f87171" };

const LOSS_REASONS = LEAD_STATUSES
  .filter((s) => s.group === "loss")
  .map((s) => ({ id: s.value, label: LEAD_STATUS_SHORT[s.value] ?? s.label }));

const LOSS_IDS   = new Set(LOSS_REASONS.map((r) => r.id));
const LOSS_LABEL = Object.fromEntries(LOSS_REASONS.map((r) => [r.id, r.label]));

// backward compat: old status strings → current column ids
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
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sourceFilter) params.set("source", sourceFilter);
    if (campaignFilter) params.set("campaign", campaignFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/leads?${params}`);
    if (!res.ok) return;
    setLeads(await res.json());
  }, [search, sourceFilter, campaignFilter, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, 300);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  const activeFilterCount =
    (sourceFilter ? 1 : 0) + (campaignFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  function resetFilters() {
    setSourceFilter("");
    setCampaignFilter("");
    setDateFrom("");
    setDateTo("");
  }

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
    <div className="p-3 sm:p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Pipeline</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{leads.length} лідів</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук..."
              className="w-40 sm:w-52 pl-7 pr-2.5 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer"
            style={showFilters || activeFilterCount > 0
              ? { background: "var(--accent-subtle)", borderColor: "var(--accent)", color: "var(--accent)" }
              : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <Filter size={13} />
            Фільтри
            {activeFilterCount > 0 && (
              <span className="ml-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-black" style={{ background: "var(--accent)" }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-sm rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={14} />
            Новий лід
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 mb-3 shrink-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide">Дата від</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)] transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide">Дата до</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)] transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide">Джерело</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer">
                <option value="">Всі джерела</option>
                {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide">Назва кампанії</label>
              <input type="text" value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} placeholder="Пошук по кампанії..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]" />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex justify-end mt-2.5">
              <button onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
                <X size={12} /> Скинути фільтри
              </button>
            </div>
          )}
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        {/* Outer: scrolls horizontally on mobile, fills height on desktop */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 min-h-full h-full" style={{ minWidth: 1180 }}>
            {/* Active columns: 5×3 grid on desktop, horizontal scroll on mobile */}
            <div className="grid grid-cols-5 grid-rows-3 gap-2 flex-1 min-h-0" style={{ minWidth: 960 }}>
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

            {/* Win / Loss */}
            <div className="flex flex-col gap-2 w-44 shrink-0 min-h-0">
              <div className="flex-1 min-h-0">
                <KanbanColumn col={WIN_COL} items={filterCol(leads, "WON")} onOpen={setOpenLead} isWin />
              </div>
              <div className="flex-1 min-h-0">
                <KanbanColumn col={LOSS_COL} items={filterCol(leads, "LOST")} onOpen={setOpenLead} isLoss />
              </div>
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
