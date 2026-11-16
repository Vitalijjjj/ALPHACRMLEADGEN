"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, EyeOff } from "lucide-react";

// «Режим показу» — for stories / demos: blurs sensitive data everywhere it's marked with `data-private="<field>"`.
// The state is a set of classes on <html> (`privacy-name`, `privacy-amount`…), so any page can mark its data
// and it blurs without re-rendering. Remembered in this browser.
export const PRIVACY_FIELDS = [
  { key: "contacts", label: "Контакти", hint: "телефон, email, Telegram" },
  { key: "name", label: "Ім'я", hint: "ім'я клієнта" },
  { key: "project", label: "Назва проєкту", hint: "назва угоди / проєкту" },
  { key: "niche", label: "Ніша", hint: "" },
  { key: "source", label: "Джерело", hint: "джерело й кампанія" },
  { key: "amount", label: "Сума", hint: "суми угод і підсумки" },
] as const;
export type PrivacyField = (typeof PRIVACY_FIELDS)[number]["key"];

interface PrivacyState { on: boolean; fields: PrivacyField[] }
const KEY = "privacy-mode";
const DEFAULT: PrivacyState = { on: false, fields: ["contacts", "name", "project", "amount"] };

function read(): PrivacyState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as PrivacyState | null;
    return v && Array.isArray(v.fields) ? { on: !!v.on, fields: v.fields } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

// apply to <html>: one class per hidden field
function apply(s: PrivacyState) {
  const el = document.documentElement;
  for (const f of PRIVACY_FIELDS) el.classList.toggle(`privacy-${f.key}`, s.on && s.fields.includes(f.key));
  el.classList.toggle("privacy-on", s.on);
}

const listeners = new Set<() => void>();
let state: PrivacyState | null = null;
const get = () => (state ??= read());
function set(next: PrivacyState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  apply(next);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function usePrivacy() {
  const s = useSyncExternalStore(subscribe, get, () => DEFAULT);
  return {
    ...s,
    toggle: () => set({ ...get(), on: !get().on }),
    setOn: (on: boolean) => set({ ...get(), on }),
    flip: (f: PrivacyField) => {
      const cur = get();
      set({ ...cur, fields: cur.fields.includes(f) ? cur.fields.filter((x) => x !== f) : [...cur.fields, f] });
    },
  };
}

// Restores the blur after a reload on any page (mounted once in the app providers).
export function PrivacyBoot() {
  useEffect(() => { apply(get()); }, []);
  return null;
}

// The eye button: a click turns the blur on and opens the list of what to hide.
export function PrivacyButton() {
  const p = usePrivacy();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // the popup lives in a portal (fixed) — page containers with overflow can't clip it or add a scrollbar
  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const w = 256;
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);

  // restore the classes after a reload
  useEffect(() => { apply(get()); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function click() {
    if (!p.on) { p.setOn(true); setOpen(true); }
    else setOpen((o) => !o);
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={click} title={p.on ? "Режим показу увімкнено — що ховати" : "Сховати чутливі дані (для сторіс / показу)"}
        aria-pressed={p.on}
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-200 cursor-pointer ${p.on
          ? "border-[#a78bfa]/60 bg-[#a78bfa]/15 text-[#c4b5fd] shadow-[0_0_16px_-4px_rgba(167,139,250,0.7)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/[0.16]"}`}>
        {p.on ? <EyeOff size={16} /> : <Eye size={16} />}
        {p.on && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#a78bfa] ring-2 ring-[var(--bg,#0a0a0a)]" />}
      </button>

      {open && pos && createPortal(
        <div ref={pop} style={{ top: pos.top, left: pos.left }} className="fixed z-[150] w-64 rounded-xl border border-white/[0.09] bg-[#121215]/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] overflow-hidden">
          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-white/[0.06]">
            <EyeOff size={14} className="text-[#c4b5fd]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text)]">Режим показу</div>
              <div className="text-[10px] text-[var(--text-dim)]">для сторіс і демо — дані розмиваються</div>
            </div>
            <button role="switch" aria-checked={p.on} onClick={() => p.toggle()} aria-label={p.on ? "Вимкнути" : "Увімкнути"}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${p.on ? "bg-[#a78bfa]" : "bg-white/[0.12]"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ${p.on ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
          <div className="p-1.5">
            <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Що ховаємо</div>
            {PRIVACY_FIELDS.map((f) => {
              const on = p.fields.includes(f.key);
              return (
                <button key={f.key} onClick={() => p.flip(f.key)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-white/[0.05] cursor-pointer transition-colors">
                  <span className={`w-4 h-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors ${on ? "bg-[#a78bfa] border-[#a78bfa]" : "border-white/25"}`}>
                    {on && <Check size={11} strokeWidth={3} className="text-black" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${on ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{f.label}</span>
                    {f.hint && <span className="block text-[10px] text-[var(--text-dim)]">{f.hint}</span>}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${on ? "bg-white/[0.06] text-[var(--text-muted)] blur-[2.5px]" : "text-[var(--text-dim)]"}`}>{on ? "Abc 123" : "видно"}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
