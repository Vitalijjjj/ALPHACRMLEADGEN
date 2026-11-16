"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

export interface StatusOption {
  value: string;
  label: string;
  accent: string;
}

// Pick several statuses at once. Empty selection = all statuses.
// The choice is applied only after APPLY_DELAY ms without new clicks (or right away when the list is closed),
// so you can tick several statuses calmly without the table jumping after every click.
const APPLY_DELAY = 2000;

export default function StatusMultiSelect({
  options,
  value,
  onChange,
  delay = APPLY_DELAY,
  placeholder = "Всі статуси",
  fullWidth = false,
}: {
  options: StatusOption[];
  value: string[];
  onChange: (next: string[]) => void;
  delay?: number;        // 0 = apply on every click
  placeholder?: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [pending, setPending] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);

  // keep draft in sync when the parent value changes (e.g. tab switch)
  const valueKey = value.join(",");
  useEffect(() => {
    if (!timer.current) { draftRef.current = value; setDraft(value); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  function commit(next = draftRef.current) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(false);
    if (next.join(",") !== valueKey) onChange(next);
  }

  function update(next: string[]) {
    draftRef.current = next;
    setDraft(next);
    if (delay <= 0) { onChange(next); return; }
    setPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), delay);
  }

  function close() {
    setOpen(false);
    if (timer.current) commit();
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Panel is rendered in a portal with fixed position, so the page layout can never clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) });
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
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  const selected = new Set(draft);
  const toggle = (v: string) => update(selected.has(v) ? draft.filter((x) => x !== v) : [...draft, v]);

  const label =
    draft.length === 0
      ? placeholder
      : draft.length === 1
        ? options.find((o) => o.value === draft[0])?.label ?? "1 статус"
        : `Вибрано: ${draft.length}`;

  const active = draft.length > 0;

  return (
    <div className={`relative ${fullWidth ? "w-full" : "shrink-0"}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={`relative flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-lg border text-sm transition-colors cursor-pointer overflow-hidden ${fullWidth ? "w-full justify-between" : "max-w-[220px]"}`}
        style={active
          ? { background: "var(--accent-subtle)", borderColor: "var(--accent)", color: "var(--accent)" }
          : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <span className="truncate">{label}</span>
        {active ? (
          <span
            role="button"
            aria-label="Скинути статуси"
            onClick={(e) => { e.stopPropagation(); draftRef.current = []; setDraft([]); commit([]); }}
            className="p-0.5 rounded hover:bg-[var(--border)]"
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={14} className="text-[var(--text-muted)]" />
        )}
        {/* 2-second "apply" progress line */}
        {pending && (
          <span
            key={draft.join(",")}
            className="absolute left-0 bottom-0 h-[2px] status-apply-progress"
            style={{ background: "var(--accent)", animationDuration: `${APPLY_DELAY}ms` }}
          />
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-filter-popover
          className="fixed z-[110] w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--border)] p-1.5 shadow-2xl"
          style={{ top: pos.top, left: pos.left, background: "rgba(14,14,14,0.98)", backdropFilter: "blur(20px)" }}
        >
          <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-[var(--border)]">
            <button type="button" onClick={() => update(options.map((o) => o.value))}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
              Вибрати всі
            </button>
            <span className="text-[10px] text-[var(--text-dim)]">{pending ? `застосую через ${Math.round(delay / 1000)} с…` : ""}</span>
            <button type="button" onClick={() => update([])}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
              Очистити
            </button>
          </div>
          {options.map((o) => {
            const on = selected.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-[13px] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                <span
                  className="w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors"
                  style={on ? { background: o.accent, borderColor: o.accent } : { borderColor: "var(--border)" }}
                >
                  {on && <Check size={11} strokeWidth={3} className="text-black" />}
                </span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: o.accent }} />
                <span className={on ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>{o.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
