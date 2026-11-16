"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, Check, Info, X } from "lucide-react";

// Small system notifications in the bottom-right corner with a countdown bar.
// Call toast({...}) from anywhere on the client; <Toaster /> (in the dashboard layout) shows them.

export type ToastKind = "task" | "success" | "info" | "error";

export interface ToastInput {
  title: string;
  text?: string;
  meta?: string;      // e.g. «Завтра, 13:00»
  kind?: ToastKind;
  duration?: number;  // ms, default 6000
}

interface ToastItem extends Required<Omit<ToastInput, "text" | "meta">> {
  id: number;
  text?: string;
  meta?: string;
}

let nextId = 1;
const listeners = new Set<(t: ToastItem) => void>();

// Error message instead of the browser alert()
export function toastError(text: string, title = "Не вийшло") {
  toast({ kind: "error", title, text, duration: 7000 });
}

export function toast(input: ToastInput) {
  const t: ToastItem = { id: nextId++, kind: "info", duration: 6000, ...input };
  listeners.forEach((l) => l(t));
}

const KIND: Record<ToastKind, { color: string; icon: React.ReactNode }> = {
  task: { color: "#C98C0A", icon: <CalendarClock size={15} /> },
  success: { color: "#22c55e", icon: <Check size={15} strokeWidth={3} /> },
  info: { color: "#4285F4", icon: <Info size={15} /> },
  error: { color: "#ef4444", icon: <AlertTriangle size={15} /> },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only in the browser
    setMounted(true);
    const add = (t: ToastItem) => setItems((xs) => [...xs.slice(-3), t]);
    listeners.add(add);
    return () => { listeners.delete(add); };
  }, []);

  if (!mounted) return null;
  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  return createPortal(
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-4 right-4 z-[90] flex flex-col gap-2 w-[min(360px,calc(100vw-32px))] pointer-events-none">
      {items.map((t) => <ToastCard key={t.id} t={t} onDone={() => remove(t.id)} />)}
    </div>,
    document.body
  );
}

function ToastCard({ t, onDone }: { t: ToastItem; onDone: () => void }) {
  const k = KIND[t.kind];
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const left = useRef(t.duration);
  const startedAt = useRef(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });

  // countdown (pauses while hovered)
  useEffect(() => {
    if (paused || leaving) return;
    startedAt.current = Date.now();
    const id = setTimeout(() => setLeaving(true), left.current);
    return () => {
      clearTimeout(id);
      left.current -= Date.now() - startedAt.current;
    };
  }, [paused, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => doneRef.current(), 220);
    return () => clearTimeout(id);
  }, [leaving]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative overflow-hidden rounded-xl border shadow-2xl toast-in ${leaving ? "toast-out" : ""}`}
      style={{ background: "rgba(16,16,16,0.97)", backdropFilter: "blur(20px)", borderColor: `${k.color}40`, boxShadow: `0 16px 40px -12px rgba(0,0,0,0.7), 0 0 0 1px ${k.color}14` }}
      role="status"
    >
      <div className="flex gap-3 p-3 pr-9">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: k.color, background: `${k.color}1f` }}>
          {k.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: k.color }}>{t.title}</div>
          {t.text && <div className="text-sm text-[var(--text)] leading-snug mt-0.5 break-words">{t.text}</div>}
          {t.meta && <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">{t.meta}</div>}
        </div>
      </div>
      <button onClick={() => setLeaving(true)} aria-label="Закрити"
        className="absolute top-2 right-2 p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06] cursor-pointer">
        <X size={13} />
      </button>
      {/* countdown bar */}
      <div className="h-[3px] bg-white/[0.04]">
        <div
          className="h-full toast-bar"
          style={{ background: k.color, animationDuration: `${t.duration}ms`, animationPlayState: paused || leaving ? "paused" : "running" }}
        />
      </div>
    </div>
  );
}
