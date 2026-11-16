"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Pin, Plus, Search, Trash2, X } from "lucide-react";
import StatusMultiSelect, { type StatusOption } from "@/components/leads/StatusMultiSelect";
import { ask } from "@/components/ui/dialogs";

// Tasks: the same Bitrix-style search as in CRM / Projects — one bar with chips, a panel with quick filters on the left
// and fields on the right («Знайти» / «Скинути»), saved filters.

export const ME = "__me";   // «Я» in the «Відповідальний» list
export const NOBODY = "—";  // no assignee

export interface TaskFilter {
  who: string[];                                        // empty = everyone
  status: "open" | "done" | "any";
  period: "all" | "month" | "prev" | "range";            // by deadline (done tasks — by completion)
  from: string; to: string;
  kind: "all" | "auto" | "manual";
  due: "any" | "overdue" | "today" | "week" | "none";   // open tasks by their deadline
  funnels: string[];
}
export const EMPTY_TASK_FILTER: TaskFilter = { who: [], status: "open", period: "all", from: "", to: "", kind: "all", due: "any", funnels: [] };
export interface SavedTaskFilter { id: string; name: string; filter: TaskFilter }

const STATUS = [{ v: "open", l: "В роботі" }, { v: "done", l: "Виконані" }, { v: "any", l: "Усі" }] as const;
const PERIOD = [{ v: "all", l: "Усі місяці" }, { v: "month", l: "Цей місяць" }, { v: "prev", l: "Минулий місяць" }, { v: "range", l: "Свої дати" }] as const;
const KIND = [{ v: "all", l: "Усі" }, { v: "auto", l: "Автозадачі" }, { v: "manual", l: "Ручні" }] as const;
const DUE = [{ v: "any", l: "Будь-який" }, { v: "overdue", l: "Прострочені" }, { v: "today", l: "На сьогодні" }, { v: "week", l: "На тиждень" }, { v: "none", l: "Без терміну" }] as const;
const label = <T extends string>(list: readonly { v: T; l: string }[], v: T) => list.find((x) => x.v === v)?.l ?? v;

const QUICK: { key: string; label: string; f: () => TaskFilter }[] = [
  { key: "mine", label: "Мої в роботі", f: () => ({ ...EMPTY_TASK_FILTER, who: [ME] }) },
  { key: "overdue", label: "Прострочені", f: () => ({ ...EMPTY_TASK_FILTER, due: "overdue" }) },
  { key: "today", label: "На сьогодні", f: () => ({ ...EMPTY_TASK_FILTER, due: "today" }) },
  { key: "week", label: "На тиждень", f: () => ({ ...EMPTY_TASK_FILTER, due: "week" }) },
  { key: "done", label: "Виконані цього місяця", f: () => ({ ...EMPTY_TASK_FILTER, status: "done", period: "month" }) },
  { key: "auto", label: "Автозадачі", f: () => ({ ...EMPTY_TASK_FILTER, kind: "auto" }) },
  { key: "manual", label: "Ручні", f: () => ({ ...EMPTY_TASK_FILTER, kind: "manual" }) },
  { key: "nobody", label: "Без відповідального", f: () => ({ ...EMPTY_TASK_FILTER, who: [NOBODY] }) },
  { key: "all", label: "Усі задачі", f: () => ({ ...EMPTY_TASK_FILTER, status: "any" }) },
];

export const sameTaskFilter = (a: TaskFilter, b: TaskFilter) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const norm = (f: TaskFilter) => ({ ...f, who: [...f.who].sort(), funnels: [...f.funnels].sort(), from: f.period === "range" ? f.from : "", to: f.period === "range" ? f.to : "" });

const input = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide";

export default function TaskSearchFilter({
  search, onSearch, filter, onApply, people, funnels, admin, saved, onSaved, me, onMe, meOptions,
}: {
  search: string; onSearch: (q: string) => void;
  filter: TaskFilter; onApply: (f: TaskFilter) => void;
  people: string[]; funnels: { id: string; name: string }[];
  admin: boolean; // others see only their own tasks (+ nobody's) — no «Відповідальний» field
  saved: SavedTaskFilter[]; onSaved: (next: SavedTaskFilter[]) => void;
  me: string; onMe?: (name: string) => void; meOptions?: string[]; // owner: who «я» is among the assignees
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TaskFilter>(filter);
  const [naming, setNaming] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPanel = () => { if (!open) { setDraft(filter); setOpen(true); } };
  const close = () => { setOpen(false); setNaming(null); };
  const apply = (f: TaskFilter) => { onApply(f); close(); inputRef.current?.blur(); };
  const preset = (f: TaskFilter) => { setDraft(f); onApply(f); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = barRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 320), 860, window.innerWidth - 16);
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || barRef.current?.contains(t) || t.closest?.("[data-filter-popover]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const whoOptions: StatusOption[] = [
    { value: ME, label: `Я${me ? ` (${me})` : ""}`, accent: "#C98C0A" },
    ...people.filter((p) => p !== me).map((p) => ({ value: p, label: p, accent: "#94a3b8" })),
    { value: NOBODY, label: "Без відповідального", accent: "#6b7280" },
  ];
  const funnelOptions: StatusOption[] = funnels.map((f) => ({ value: f.id, label: f.name, accent: "#94a3b8" }));
  const whoText = (v: string) => whoOptions.find((o) => o.value === v)?.label ?? v;

  // chips of the APPLIED filter (defaults are not shown)
  const chips = [
    ...(admin && filter.who.length ? [{ key: "who", label: `Відповідальний: ${filter.who.length === 1 ? whoText(filter.who[0]) : filter.who.length}`, clear: () => onApply({ ...filter, who: [] }) }] : []),
    ...(filter.status !== "open" ? [{ key: "status", label: label(STATUS, filter.status) === "Усі" ? "Усі статуси" : label(STATUS, filter.status), clear: () => onApply({ ...filter, status: "open" }) }] : []),
    ...(filter.period !== "all" ? [{ key: "period", label: filter.period === "range" ? `${filter.from || "…"} – ${filter.to || "…"}` : label(PERIOD, filter.period), clear: () => onApply({ ...filter, period: "all" }) }] : []),
    ...(filter.kind !== "all" ? [{ key: "kind", label: label(KIND, filter.kind), clear: () => onApply({ ...filter, kind: "all" }) }] : []),
    ...(filter.due !== "any" ? [{ key: "due", label: label(DUE, filter.due), clear: () => onApply({ ...filter, due: "any" }) }] : []),
    ...(filter.funnels.length ? [{ key: "funnels", label: `Воронка: ${filter.funnels.length === 1 ? funnels.find((f) => f.id === filter.funnels[0])?.name ?? "?" : filter.funnels.length}`, clear: () => onApply({ ...filter, funnels: [] }) }] : []),
  ];
  const hasAnything = chips.length > 0 || !!search;
  const set = (patch: Partial<TaskFilter>) => setDraft((d) => ({ ...d, ...patch }));

  function saveCurrent(name: string) {
    const n = name.trim();
    if (!n) return;
    onSaved([...saved, { id: `tf_${Math.random().toString(36).slice(2, 9)}`, name: n, filter: draft }]);
    setNaming(null);
  }

  const select = <T extends string>(lab: string, list: readonly { v: T; l: string }[], v: T, on: (x: T) => void) => (
    <div>
      <label className={lbl}>{lab}</label>
      <select value={v} onChange={(e) => on(e.target.value as T)} className={`${input} cursor-pointer`}>
        {list.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <div ref={barRef} onClick={() => { openPanel(); inputRef.current?.focus(); }}
        className="flex-1 min-w-full sm:min-w-[220px] flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border bg-[var(--surface)] transition-colors cursor-text"
        style={{ borderColor: open ? "var(--accent)" : "var(--border)", minHeight: 38 }}>
        <Search size={14} className="shrink-0 text-[var(--text-muted)]" />
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {chips.map((c) => (
            <span key={c.key} className="shrink-0 inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              <span className="max-w-[180px] truncate">{c.label}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); c.clear(); }} className="p-0.5 rounded hover:bg-black/20 cursor-pointer" aria-label="Прибрати"><X size={11} /></button>
            </span>
          ))}
          <input ref={inputRef} value={search} onChange={(e) => onSearch(e.target.value)} onFocus={openPanel}
            onKeyDown={(e) => { if (e.key === "Enter") apply(open ? draft : filter); }}
            placeholder={chips.length ? "" : "Пошук: задача, угода, номер, ім'я…"}
            className="flex-1 min-w-[120px] bg-transparent py-1 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none" />
        </div>
        {hasAnything && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onSearch(""); onApply(EMPTY_TASK_FILTER); setDraft(EMPTY_TASK_FILTER); }}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0" title="Скинути пошук і фільтр"><X size={14} /></button>
        )}
      </div>

      {open && pos && createPortal(
        <div ref={panelRef} className="fixed z-[100] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col sm:flex-row"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100vh - ${pos.top + 12}px)`, background: "rgba(12,12,12,0.98)", backdropFilter: "blur(24px)" }}>
          {/* left: quick + saved */}
          <div className="sm:w-56 shrink-0 max-h-[32vh] sm:max-h-none border-b sm:border-b-0 sm:border-r border-[var(--border)] p-2 flex flex-col gap-0.5 overflow-y-auto" style={{ background: "rgba(255,255,255,0.02)" }}>
            {QUICK.filter((x) => admin || x.key !== "nobody").map((x) => {
              const f = x.f();
              const on = sameTaskFilter(draft, f);
              return (
                <button key={x.key} type="button" onClick={() => preset(f)}
                  className={`text-left px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${on ? "text-[var(--accent)] bg-[var(--accent-subtle)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"}`}>
                  {x.label}
                </button>
              );
            })}
            {saved.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[var(--border)]">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Мої фільтри</div>
                {saved.map((sf) => {
                  const on = sameTaskFilter(draft, sf.filter);
                  return (
                    <div key={sf.id} className={`group/saved flex items-center rounded-lg ${on ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--surface-2)]"}`}>
                      <button type="button" onClick={() => preset(sf.filter)} className={`flex-1 min-w-0 text-left px-3 py-1.5 text-sm truncate cursor-pointer ${on ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                        <Pin size={10} className="inline mr-1.5 opacity-60" />{sf.name}
                      </button>
                      <button type="button" onClick={async () => { if (await ask(`Видалити фільтр «${sf.name}»?`)) onSaved(saved.filter((x) => x.id !== sf.id)); }}
                        className="opacity-0 group-hover/saved:opacity-100 p-1.5 text-[var(--text-dim)] hover:text-red-400 cursor-pointer" aria-label="Видалити фільтр"><Trash2 size={12} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-auto pt-2">
              {naming === null ? (
                <button type="button" onClick={() => setNaming("")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"><Plus size={13} /> Зберегти фільтр</button>
              ) : (
                <div className="flex items-center gap-1 px-1">
                  <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveCurrent(naming); if (e.key === "Escape") { e.stopPropagation(); setNaming(null); } }}
                    placeholder="Назва фільтра" className={`${input} !py-1 !text-xs`} />
                  <button type="button" onClick={() => saveCurrent(naming)} className="p-1.5 rounded-md text-[var(--accent)] hover:bg-[var(--surface-2)] cursor-pointer" aria-label="Зберегти"><Check size={14} /></button>
                </div>
              )}
            </div>
          </div>

          {/* right: fields */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                {admin ? (
                  <div>
                    <label className={lbl}>Відповідальний</label>
                    <StatusMultiSelect fullWidth delay={0} placeholder="Усі" options={whoOptions} value={draft.who} onChange={(v) => set({ who: v })} />
                  </div>
                ) : (
                  <div>
                    <label className={lbl}>Відповідальний</label>
                    <div className="px-2.5 py-1.5 text-sm text-[var(--text-muted)]">Твої задачі й без відповідального</div>
                  </div>
                )}
                {select("Статус", STATUS, draft.status, (v) => set({ status: v }))}
                <div>
                  {select("Період", PERIOD, draft.period, (v) => set({ period: v }))}
                  {draft.period === "range" && (
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} className={input} />
                      <input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} className={input} />
                    </div>
                  )}
                </div>
                {select("Термін", DUE, draft.due, (v) => set({ due: v }))}
                {select("Тип", KIND, draft.kind, (v) => set({ kind: v }))}
                {funnels.length > 1 && (
                  <div>
                    <label className={lbl}>Воронка угоди</label>
                    <StatusMultiSelect fullWidth delay={0} placeholder="Усі" options={funnelOptions} value={draft.funnels} onChange={(v) => set({ funnels: v })} />
                  </div>
                )}
                {onMe && meOptions && meOptions.length > 0 && (
                  <div>
                    <label className={lbl}>Я в задачах — це</label>
                    <select value={me} onChange={(e) => onMe(e.target.value)} className={`${input} cursor-pointer`}>
                      {meOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button type="button" onClick={() => apply(draft)} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-black cursor-pointer" style={{ background: "var(--accent)" }}>
                <Search size={14} /> Знайти
              </button>
              <button type="button" onClick={() => { setDraft(EMPTY_TASK_FILTER); onApply(EMPTY_TASK_FILTER); onSearch(""); }} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                Скинути
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
