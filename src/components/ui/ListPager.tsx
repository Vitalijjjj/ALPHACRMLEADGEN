"use client";

import { useState } from "react";
import { ChevronsDown, Plus } from "lucide-react";

// Lists render only the first N rows (30 by default) — long lists stay fast. «+10» adds more,
// the size (30 / 50 / 100 / any / all) is remembered per list in this browser.
const SIZES = [30, 50, 100];
const STEP = 10;
const storeKey = (key: string) => `list-size:${key}`;

function readSize(key: string): number {
  try {
    const raw = localStorage.getItem(storeKey(key));
    const v = Number(raw);
    if (raw === null || !Number.isFinite(v)) return 30;
    return v < 0 ? -1 : v || 30;
  } catch {
    return 30;
  }
}

export interface Pager<T> {
  visible: T[];
  total: number;
  shown: number;
  size: number;                 // -1 = all
  setSize: (n: number) => void;
  more: () => void;
}

// `items` — the whole (already filtered / sorted) list. Extra rows from «+10» reset when the list changes size.
export function usePager<T>(items: T[], key: string): Pager<T> {
  const [size, setSizeState] = useState<number>(() => (typeof window === "undefined" ? 30 : readSize(key)));
  const [extra, setExtra] = useState(0);
  const [seen, setSeen] = useState(items.length);
  if (seen !== items.length) { setSeen(items.length); setExtra(0); }

  const limit = size < 0 ? items.length : size + extra;
  const setSize = (n: number) => {
    setSizeState(n);
    setExtra(0);
    try { localStorage.setItem(storeKey(key), String(n < 0 ? -1 : n)); } catch { /* ignore */ }
  };
  return {
    visible: limit >= items.length ? items : items.slice(0, limit),
    total: items.length,
    shown: Math.min(limit, items.length),
    size,
    setSize,
    more: () => setExtra((e) => e + STEP),
  };
}

export default function ListPager<T>({ pager, noun = "записів", className = "" }: { pager: Pager<T>; noun?: string; className?: string }) {
  const { total, shown, size, setSize, more } = pager;
  const [custom, setCustom] = useState("");
  const [editing, setEditing] = useState(false);
  if (!total) return null;

  const left = total - shown;
  const chip = (on: boolean) =>
    `px-2 py-1 rounded-md text-[11px] tabular-nums cursor-pointer transition-colors ${on ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05]"}`;
  const applyCustom = () => {
    const n = Math.round(Number(custom));
    if (n > 0) setSize(n);
    setEditing(false);
    setCustom("");
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 border-t border-[var(--border)] text-xs ${className}`}>
      <span className="text-[var(--text-dim)] tabular-nums">
        Показано <b className="text-[var(--text-muted)]">{shown}</b> з <b className="text-[var(--text-muted)]">{total}</b> {noun}
      </span>
      {left > 0 && (
        <div className="flex items-center gap-1 mx-auto">
          <button onClick={more} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors">
            <Plus size={12} /> ще {Math.min(STEP, left)}
          </button>
          <button onClick={() => setSize(-1)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
            <ChevronsDown size={12} /> усі {total}
          </button>
        </div>
      )}
      <div className={`flex items-center gap-0.5 ${left > 0 ? "" : "ml-auto"}`}>
        <span className="mr-1 text-[var(--text-dim)]">По</span>
        {SIZES.map((n) => <button key={n} onClick={() => setSize(n)} className={chip(size === n)}>{n}</button>)}
        {editing ? (
          <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} onBlur={applyCustom}
            onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); if (e.key === "Escape") { setEditing(false); setCustom(""); } }}
            placeholder="к-сть" inputMode="numeric"
            className="w-14 px-1.5 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--accent)]/60 text-[11px] text-[var(--text)] tabular-nums outline-none" />
        ) : (
          <button onClick={() => setEditing(true)} className={chip(size > 0 && !SIZES.includes(size))}>{size > 0 && !SIZES.includes(size) ? size : "своє"}</button>
        )}
      </div>
    </div>
  );
}
