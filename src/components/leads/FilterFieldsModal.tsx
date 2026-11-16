"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Check, Minus, RotateCcw } from "lucide-react";
import { FILTER_FIELDS, FIELD_SECTIONS, DEFAULT_FILTER_FIELDS, type FieldSection } from "@/lib/leadFilter";

// «Налаштування полів фільтра» — choose which fields are shown in the filter panel (like Bitrix).
export default function FilterFieldsModal({
  value,
  onApply,
  onClose,
}: {
  value: string[];
  onApply: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(value);
  const [q, setQ] = useState("");
  const [sections, setSections] = useState<FieldSection[]>(FIELD_SECTIONS.map((s) => s.key));

  const query = q.trim().toLowerCase();
  const visible = FILTER_FIELDS.filter(
    (f) => sections.includes(f.section) && (!query || f.label.toLowerCase().includes(query))
  );
  const allOn = visible.length > 0 && visible.every((f) => picked.includes(f.key));
  const someOn = visible.some((f) => picked.includes(f.key));

  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const toggleAll = () =>
    setPicked((p) => allOn
      ? p.filter((k) => !visible.some((f) => f.key === k))
      : [...new Set([...p, ...visible.map((f) => f.key)])]);

  function highlight(label: string) {
    if (!query) return label;
    const i = label.toLowerCase().indexOf(query);
    if (i < 0) return label;
    return (
      <>
        {label.slice(0, i)}
        <mark className="bg-transparent text-[var(--accent)] font-semibold">{label.slice(i, i + query.length)}</mark>
        {label.slice(i + query.length)}
      </>
    );
  }

  return createPortal(
    <div data-filter-popover className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" style={{ background: "rgba(0,0,0,0.6)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl max-h-full flex flex-col rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden"
        style={{ background: "rgba(14,14,14,0.99)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold text-[var(--text)]">Налаштування полів фільтра</h2>
          <button onClick={onClose} className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer" aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        {/* Search + section toggles */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 pb-3 border-b border-[var(--border)]">
          <div className="relative sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Пошук за полями"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-dim)]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 sm:ml-auto">
            {FIELD_SECTIONS.map((s) => {
              const on = sections.includes(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => setSections((cur) => (on ? cur.filter((x) => x !== s.key) : [...cur, s.key]))}
                  className="relative px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer"
                  style={on
                    ? { borderColor: "var(--accent)", color: "var(--text)", background: "var(--accent-subtle)" }
                    : { borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {s.label}
                  {on && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "var(--accent)" }}>
                      <Check size={9} strokeWidth={3} className="text-black" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {FIELD_SECTIONS.filter((s) => sections.includes(s.key)).map((s) => {
            const items = visible.filter((f) => f.section === s.key);
            if (!items.length) return null;
            return (
              <div key={s.key} className="mb-4">
                <div className="text-sm font-medium text-[var(--text)] pb-2 mb-1.5 border-b border-[var(--border)]">{s.label}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1">
                  {items.map((f) => {
                    const on = picked.includes(f.key);
                    return (
                      <button
                        key={f.key}
                        onClick={() => toggle(f.key)}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] transition-colors cursor-pointer"
                        style={on ? { background: "var(--accent-subtle)" } : undefined}
                      >
                        <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                          style={on ? { background: "var(--accent)", borderColor: "var(--accent)" } : { borderColor: "var(--border)" }}>
                          {on && <Check size={11} strokeWidth={3} className="text-black" />}
                        </span>
                        <span className={`truncate ${on ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{highlight(f.label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-dim)]">Нічого не знайдено</p>}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            <span className="w-4 h-4 rounded border flex items-center justify-center"
              style={someOn ? { background: "var(--accent)", borderColor: "var(--accent)" } : { borderColor: "var(--border)" }}>
              {allOn ? <Check size={11} strokeWidth={3} className="text-black" /> : someOn ? <Minus size={11} strokeWidth={3} className="text-black" /> : null}
            </span>
            вибрати все
          </button>
          <div className="flex items-center gap-2 mx-auto">
            <button
              onClick={() => { onApply(FILTER_FIELDS.map((f) => f.key).filter((k) => picked.includes(k))); onClose(); }}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-black cursor-pointer"
              style={{ background: "var(--accent)" }}
            >
              Застосувати
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
              Скасувати
            </button>
          </div>
          <button onClick={() => setPicked(DEFAULT_FILTER_FIELDS)} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            <RotateCcw size={12} /> за замовчуванням
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
