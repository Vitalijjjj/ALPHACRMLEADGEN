"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Plus, Check, Pin, Trash2, SlidersHorizontal } from "lucide-react";
import StatusMultiSelect, { type StatusOption } from "@/components/leads/StatusMultiSelect";
import FilterFieldsModal from "@/components/leads/FilterFieldsModal";
import {
  EMPTY_FILTER, FILTER_FIELDS, FIELD_BY_KEY, DEFAULT_FILTER_FIELDS, DATE_PRESETS, AMOUNT_OPS, BOOL_OPTIONS, QUICK_FILTERS,
  activeKeys, getValue, emptyValue, sameFilter,
  type LeadFilter, type DateFilter, type AmountFilter, type FieldValue, type QuickKind, type FilterFieldDef,
} from "@/lib/leadFilter";
import { newId, type SavedFilter } from "@/lib/crmSettings";
import { ask } from "@/components/ui/dialogs";

// Bitrix-style search: one input with chips of the active filter.
// Click → big panel: quick filters & saved filters on the left (they fill the fields and search right away),
// field filters on the right («Знайти» / «Скинути»), «Додати поле» opens the field settings dialog.

const FIELDS_STORAGE_KEY = "lead-filter-fields-v2";
const GROUP_LABEL: Record<string, string> = { active: "В роботі", closed: "Закриті", win: "Виграні", loss: "Програні" };

const input =
  "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide";

export interface FilterOptions {
  stages: StatusOption[];
  reasons: StatusOption[];
  campaigns: string[];
}

const plain = (arr: string[]): StatusOption[] => arr.map((v) => ({ value: v, label: v, accent: "#94a3b8" }));

function DateControl({ value, onChange }: { value: DateFilter; onChange: (v: DateFilter) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <select value={value.preset} onChange={(e) => onChange({ ...value, preset: e.target.value as DateFilter["preset"] })} className={`${input} cursor-pointer`}>
        {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {value.preset === "range" && (
        <div className="grid grid-cols-2 gap-1.5">
          <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className={input} />
          <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className={input} />
        </div>
      )}
    </div>
  );
}

// Short text of a field value for the chip in the search bar.
function summary(def: FilterFieldDef, v: FieldValue, opts: FilterOptions): string {
  switch (def.type) {
    case "multi": {
      const vals = v as string[];
      const all = def.key === "stages" ? opts.stages : def.key === "reasons" ? opts.reasons : plain(def.options ?? []);
      return vals.length === 1 ? all.find((o) => o.value === vals[0])?.label ?? vals[0] : `${vals.length}`;
    }
    case "date": {
      const d = v as DateFilter;
      return d.preset === "range" ? `${d.from || "…"} – ${d.to || "…"}` : DATE_PRESETS.find((p) => p.value === d.preset)?.label ?? "";
    }
    case "amount": {
      const a = v as AmountFilter;
      if (a.op === "range") return `${a.from || "0"}–${a.to || "∞"}`;
      return `${{ eq: "=", gt: ">", lt: "<" }[a.op]} ${a.from}`;
    }
    case "bool": return v === "yes" ? "так" : "ні";
    default: return v as string;
  }
}

export default function LeadSearchFilter({
  search,
  onSearch,
  filter,
  onApply,
  options,
  quick,
  savedFilters,
  onSaveFilters,
  searching,
  extras = [],
}: {
  search: string;
  onSearch: (q: string) => void;
  filter: LeadFilter;
  onApply: (f: LeadFilter) => void;
  options: FilterOptions;
  quick: (kind: QuickKind) => LeadFilter; // builds a quick filter for the current funnel
  savedFilters: SavedFilter[];
  onSaveFilters: (next: SavedFilter[]) => void;
  searching?: boolean;
  // page-specific quick filters under the standard ones (e.g. «З боргом» on Projects)
  extras?: { key: string; label: string; n?: number; active: boolean; onToggle: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadFilter>(filter);
  const [fields, setFields] = useState<string[]>(DEFAULT_FILTER_FIELDS);
  const [showFields, setShowFields] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalOpen = useRef(false);
  useEffect(() => { modalOpen.current = showFields; }, [showFields]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FIELDS_STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as string[]) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of localStorage after mount
      if (Array.isArray(saved)) setFields(FILTER_FIELDS.map((f) => f.key).filter((k) => saved.includes(k)));
    } catch {}
  }, []);

  function saveFields(next: string[]) {
    setFields(next);
    try { localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  function openPanel() {
    if (open) return;
    setDraft(filter);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setShowFields(false);
    setNaming(null);
  }
  // «Знайти»: apply the right side and close.
  function apply(next: LeadFilter) {
    onApply(next);
    close();
    inputRef.current?.blur();
  }
  // Quick / saved filter: fill the fields on the right and search right away (panel stays open).
  function preset(next: LeadFilter) {
    setDraft(next);
    onApply(next);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = barRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, 320), 920, window.innerWidth - 16);
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || barRef.current?.contains(t) || t.closest?.("[data-filter-popover]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modalOpen.current) setShowFields(false);
      else close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setValue = (key: string, v: FieldValue) => setDraft((d) => ({ ...d, values: { ...d.values, [key]: v } }));

  // Chips of the APPLIED filter.
  const chips = [
    ...extras.filter((x) => x.active).map((x) => ({ key: `x:${x.key}`, label: x.label, clear: x.onToggle })),
    ...(filter.group ? [{ key: "group", label: GROUP_LABEL[filter.group] ?? filter.group, clear: () => onApply({ ...filter, group: "" }) }] : []),
    ...activeKeys(filter).map((k) => {
      const def = FIELD_BY_KEY[k];
      return {
        key: k,
        label: `${def.label}: ${summary(def, filter.values[k], options)}`,
        clear: () => onApply({ ...filter, values: { ...filter.values, [k]: emptyValue(def) } }),
      };
    }),
  ];
  const hasAnything = chips.length > 0 || !!search;

  // Fields shown on the right: the chosen ones + any field that currently has a value.
  const draftActive = activeKeys(draft);
  const shown = FILTER_FIELDS.map((f) => f.key).filter((k) => fields.includes(k) || draftActive.includes(k));

  function saveCurrent(name: string) {
    const n = name.trim();
    if (!n) return;
    onSaveFilters([...savedFilters, { id: newId("flt"), name: n, filter: draft }]);
    setNaming(null);
  }

  function renderField(key: string) {
    const def = FIELD_BY_KEY[key];
    let control: React.ReactNode;
    switch (def.type) {
      case "multi": {
        const opts = key === "stages" ? options.stages : key === "reasons" ? options.reasons : plain(def.options ?? []);
        control = (
          <StatusMultiSelect fullWidth delay={0} placeholder="Будь-яке значення" options={opts}
            value={getValue<string[]>(draft, key)} onChange={(v) => setValue(key, v)} />
        );
        break;
      }
      case "amount": {
        const a = getValue<AmountFilter>(draft, key);
        control = (
          <div className="flex gap-1.5">
            <select value={a.op} onChange={(e) => setValue(key, { ...a, op: e.target.value as AmountFilter["op"] })} className={`${input} !w-auto cursor-pointer`}>
              {AMOUNT_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input type="number" value={a.from} onChange={(e) => setValue(key, { ...a, from: e.target.value })} placeholder={a.op === "range" ? "від" : "€"} className={input} />
            {a.op === "range" && <input type="number" value={a.to} onChange={(e) => setValue(key, { ...a, to: e.target.value })} placeholder="до" className={input} />}
          </div>
        );
        break;
      }
      case "date":
        control = <DateControl value={getValue<DateFilter>(draft, key)} onChange={(v) => setValue(key, v)} />;
        break;
      case "bool":
        control = (
          <select value={getValue<string>(draft, key)} onChange={(e) => setValue(key, e.target.value)} className={`${input} cursor-pointer`}>
            {BOOL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
        break;
      default:
        control = key === "campaign" ? (
          <>
            <input list="lead-filter-campaigns" value={getValue<string>(draft, key)} onChange={(e) => setValue(key, e.target.value)} className={input} placeholder="Назва кампанії" />
            <datalist id="lead-filter-campaigns">{options.campaigns.map((c) => <option key={c} value={c} />)}</datalist>
          </>
        ) : (
          <input value={getValue<string>(draft, key)} onChange={(e) => setValue(key, e.target.value)} className={input} placeholder={def.placeholder ?? ""} />
        );
    }
    return (
      <div key={key} className="group/field">
        <div className="flex items-center justify-between">
          <label className={lbl}>{def.label}</label>
          <button
            type="button"
            onClick={() => { saveFields(fields.filter((k) => k !== key)); setValue(key, emptyValue(def)); }}
            className="opacity-0 group-hover/field:opacity-100 text-[var(--text-dim)] hover:text-[var(--text)] transition-opacity cursor-pointer mb-1"
            title="Прибрати поле з фільтра"
          >
            <X size={11} />
          </button>
        </div>
        {control}
      </div>
    );
  }

  return (
    <>
      {/* Search bar with chips */}
      <div
        ref={barRef}
        onClick={() => { openPanel(); inputRef.current?.focus(); }}
        className="flex-1 min-w-0 flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border bg-[var(--surface)] transition-colors cursor-text"
        style={{ borderColor: open ? "var(--accent)" : "var(--border)", minHeight: 38 }}
      >
        {searching
          ? <div className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          : <Search size={14} className="shrink-0 text-[var(--text-muted)]" />}
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {chips.map((c) => (
            <span key={c.key} className="shrink-0 inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium"
              style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
              <span className="max-w-[180px] truncate">{c.label}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); c.clear(); }} className="p-0.5 rounded hover:bg-black/20 cursor-pointer" aria-label="Прибрати">
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={openPanel}
            onKeyDown={(e) => { if (e.key === "Enter") apply(open ? draft : filter); }}
            placeholder={chips.length ? "" : "Пошук: імʼя, телефон, кінець номера, ніша…"}
            className="flex-1 min-w-[120px] bg-transparent py-1 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none"
          />
        </div>
        {hasAnything && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSearch(""); onApply(EMPTY_FILTER); setDraft(EMPTY_FILTER); }}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0"
            title="Скинути пошук і фільтр"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[100] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col sm:flex-row"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `calc(100vh - ${pos.top + 12}px)`, background: "rgba(12,12,12,0.98)", backdropFilter: "blur(24px)" }}
        >
          {/* Left: quick filters + saved filters */}
          <div className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--border)] p-2 flex flex-col gap-0.5 overflow-y-auto" style={{ background: "rgba(255,255,255,0.02)" }}>
            {QUICK_FILTERS.map((qf) => {
              const f = quick(qf.key);
              const on = sameFilter(draft, f);
              return (
                <button
                  key={qf.key}
                  type="button"
                  onClick={() => preset(f)}
                  className={`text-left px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${on ? "text-[var(--accent)] bg-[var(--accent-subtle)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"}`}
                >
                  {qf.label}
                </button>
              );
            })}

            {extras.length > 0 && (
              <div className="mt-1 pt-1 border-t border-[var(--border)] flex flex-col gap-0.5">
                {extras.map((x) => (
                  <button key={x.key} type="button" onClick={() => { x.onToggle(); setOpen(false); }}
                    className={`flex items-center text-left px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${x.active ? "text-[var(--accent)] bg-[var(--accent-subtle)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"}`}>
                    <span className="flex-1">{x.label}</span>
                    {x.n !== undefined && <span className="text-[11px] tabular-nums opacity-60">{x.n}</span>}
                  </button>
                ))}
              </div>
            )}

            {savedFilters.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[var(--border)]">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Мої фільтри</div>
                {savedFilters.map((sf) => {
                  const on = sameFilter(draft, sf.filter);
                  return (
                    <div key={sf.id} className={`group/saved flex items-center rounded-lg ${on ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--surface-2)]"}`}>
                      <button type="button" onClick={() => preset(sf.filter)}
                        className={`flex-1 min-w-0 text-left px-3 py-1.5 text-sm truncate cursor-pointer ${on ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                        <Pin size={10} className="inline mr-1.5 opacity-60" />{sf.name}
                      </button>
                      <button
                        type="button"
                        onClick={async () => { if (await ask(`Видалити фільтр «${sf.name}»?`)) onSaveFilters(savedFilters.filter((x) => x.id !== sf.id)); }}
                        className="opacity-0 group-hover/saved:opacity-100 p-1.5 text-[var(--text-dim)] hover:text-red-400 cursor-pointer"
                        aria-label="Видалити фільтр"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-auto pt-2">
              {naming === null ? (
                <button type="button" onClick={() => setNaming("")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">
                  <Plus size={13} /> Зберегти фільтр
                </button>
              ) : (
                <div className="flex items-center gap-1 px-1">
                  <input
                    autoFocus
                    value={naming}
                    onChange={(e) => setNaming(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveCurrent(naming); if (e.key === "Escape") { e.stopPropagation(); setNaming(null); } }}
                    placeholder="Назва фільтра"
                    className={`${input} !py-1 !text-xs`}
                  />
                  <button type="button" onClick={() => saveCurrent(naming)} className="p-1.5 rounded-md text-[var(--accent)] hover:bg-[var(--surface-2)] cursor-pointer" aria-label="Зберегти">
                    <Check size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: field filters */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                {shown.map(renderField)}
              </div>
              {shown.length === 0 && <p className="text-xs text-[var(--text-dim)]">Поля прибрані — додай потрібні.</p>}

              <div className="flex items-center gap-4 mt-4">
                <button type="button" onClick={() => setShowFields(true)} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80 cursor-pointer">
                  <SlidersHorizontal size={12} /> Додати поле
                </button>
                <button type="button" onClick={() => saveFields(DEFAULT_FILTER_FIELDS)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                  Повернути поля за замовчуванням
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button type="button" onClick={() => apply(draft)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold text-black cursor-pointer" style={{ background: "var(--accent)" }}>
                <Search size={14} /> Знайти
              </button>
              <button type="button" onClick={() => { setDraft(EMPTY_FILTER); onApply(EMPTY_FILTER); onSearch(""); }}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                Скинути
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showFields && <FilterFieldsModal value={fields} onApply={saveFields} onClose={() => setShowFields(false)} />}
    </>
  );
}
