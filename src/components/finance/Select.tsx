"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { Avatar } from "@/components/finance/Person";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;       // section title
  sub?: string;         // muted text on the right
  avatar?: boolean;     // round initials before the label
  color?: string;       // dot before the label
}

// Dark dropdown instead of the native <select>: groups, avatars, check mark, search in long lists, keyboard.
// The list lives in a portal (fixed position), so a modal's scroll never cuts it.
export default function Select({
  value, onChange, options, placeholder = "— вибери —", variant = "field", className = "", searchable, accent = "var(--accent)",
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  variant?: "field" | "bare" | "small";
  className?: string;
  searchable?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);
  const search = searchable ?? options.length > 9;
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || `${o.label} ${o.sub ?? ""} ${o.group ?? ""}`.toLowerCase().includes(needle));

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const up = below < 240 && r.top > below;
    const max = Math.min(340, Math.max(160, (up ? r.top : below) - 8));
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 240), up, max });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) place(); };
    // capture on window: Escape / arrows stay inside the dropdown (the modal must not close)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setOpen(false); btn.current?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        const o = shown[hi];
        if (o) { onChange(o.value); setOpen(false); btn.current?.focus(); }
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-subscribed with the latest list / highlight
  }, [open, shown, hi]);

  // keep the highlighted row visible
  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);

  function toggle() {
    if (!open) { setQ(""); setHi(Math.max(0, options.findIndex((o) => o.value === value))); }
    setOpen((o) => !o);
  }

  const trigger =
    variant === "bare" ? "w-full flex items-center gap-2 bg-transparent text-sm text-left outline-none cursor-pointer"
    : variant === "small" ? "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-left outline-none cursor-pointer hover:border-white/[0.16] transition-colors"
    : "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-sm text-left outline-none cursor-pointer hover:border-white/[0.16] transition-colors";

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} className={`${trigger} ${className}`}
        style={open && variant !== "bare" ? { borderColor: accent } : undefined} aria-haspopup="listbox" aria-expanded={open}>
        {cur?.avatar && <Avatar name={cur.label} size={variant === "small" ? 18 : 22} />}
        {cur?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cur.color }} />}
        <span className={`truncate flex-1 ${cur ? "text-[var(--text)]" : "text-[var(--text-dim)]"}`}>{cur?.label ?? placeholder}</span>
        {cur?.sub && variant !== "small" && <span className="shrink-0 text-[11px] text-[var(--text-dim)]">{cur.sub}</span>}
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-dim)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={list} role="listbox"
          className="fixed z-[200] flex flex-col rounded-xl border border-white/[0.09] bg-[#121215]/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] overflow-hidden"
          style={{ left: pos.left, width: pos.width, maxHeight: pos.max, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
          {search && (
            <div className="relative p-1.5 border-b border-white/[0.06]">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Пошук…"
                className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white/[0.04] text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none" />
            </div>
          )}
          <div className="overflow-y-auto p-1">
            {!shown.length && <div className="px-3 py-4 text-center text-xs text-[var(--text-dim)]">Нічого не знайдено</div>}
            {shown.map((o, i) => {
              const head = o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
              const on = o.value === value;
              return (
                <div key={o.value}>
                  {head && <div className={`px-2.5 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] ${i ? "mt-1 border-t border-white/[0.05]" : ""}`}>{head}</div>}
                  <button type="button" data-i={i} role="option" aria-selected={on}
                    onMouseEnter={() => setHi(i)} onClick={() => { onChange(o.value); setOpen(false); btn.current?.focus(); }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm cursor-pointer transition-colors ${i === hi ? "bg-white/[0.06]" : ""}`}>
                    {o.avatar && <Avatar name={o.label} size={22} />}
                    {o.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />}
                    <span className={`truncate flex-1 ${on ? "text-[var(--text)] font-medium" : "text-[var(--text-muted)]"}`}>{o.label}</span>
                    {o.sub && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[var(--text-dim)]">{o.sub}</span>}
                    <Check size={14} className={`shrink-0 ${on ? "" : "invisible"}`} style={{ color: accent }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
