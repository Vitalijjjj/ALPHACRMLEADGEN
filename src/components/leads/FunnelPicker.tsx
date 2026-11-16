"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Check, ChevronDown, GitBranch, Handshake, Repeat, Settings2, Target, TrendingUp } from "lucide-react";
import type { Funnel } from "@/lib/crmSettings";

// The look of a funnel: icon by its kind / name, colour of its first stage.
export function funnelLook(f: Funnel, index: number): { Icon: typeof GitBranch; color: string } {
  const n = f.name.toLowerCase();
  const color = f.stages.find((s) => s.kind === "active")?.color ?? "#94a3b8";
  if (f.payments) return { Icon: Briefcase, color: "#C98C0A" };
  if (/партн/.test(n)) return { Icon: Handshake, color: "#2dd4bf" };
  if (/підпис|subscr/.test(n)) return { Icon: Repeat, color: "#a78bfa" };
  if (/апсел|апсейл|upsel|upsal|допрод/.test(n)) return { Icon: TrendingUp, color: "#f472b6" };
  if (index === 0) return { Icon: Target, color: "#38bdf8" };
  return { Icon: GitBranch, color };
}

// CRM funnel switcher: a button with the funnel's icon + a list (icons, stage count) and «Редагувати воронки».
export default function FunnelPicker({ funnels, all, value, onChange, onEdit }: {
  funnels: Funnel[]; all: Funnel[]; value: string; onChange: (id: string) => void; onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // funnel names come from the settings the server render does not have — show them only in the browser
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- after hydration
  useEffect(() => setMounted(true), []);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const cur = funnels.find((f) => f.id === value) ?? funnels[0];
  const look = (f: Funnel) => funnelLook(f, all.findIndex((x) => x.id === f.id));
  const W = 260;

  useLayoutEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("resize", close); };
  }, [open]);

  if (!cur) return null;
  const c = look(cur);
  return (
    <>
      <button ref={btn} onClick={() => setOpen((o) => !o)} title="Воронка"
        className={`flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border bg-[var(--surface)] text-sm text-[var(--text)] cursor-pointer transition-colors max-w-[170px] sm:max-w-[220px] min-h-9 ${open ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-white/20"}`}>
        {mounted && <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ color: c.color, background: `${c.color}1f` }}><c.Icon size={13} /></span>}
        <span className="truncate font-medium">{mounted ? cur.name : "Воронка"}</span>
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={pop} style={{ top: pos.top, left: pos.left, width: W }}
          className="fixed z-[150] rounded-xl border border-white/[0.09] bg-[#121215]/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] overflow-hidden">
          <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Воронки</div>
          <div className="p-1.5 pt-0.5">
            {funnels.map((f) => {
              const l = look(f);
              const on = f.id === cur.id;
              const stages = f.stages.filter((s) => s.kind === "active").length;
              return (
                <button key={f.id} onClick={() => { onChange(f.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left cursor-pointer transition-colors ${on ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: l.color, background: `${l.color}1f` }}><l.Icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm truncate ${on ? "text-[var(--text)] font-semibold" : "text-[var(--text)]"}`}>{f.name}</span>
                    <span className="block text-[10px] text-[var(--text-dim)]">{f.payments ? "проєкти · оплати" : `${stages} ${stages === 1 ? "стадія" : stages < 5 ? "стадії" : "стадій"}`}</span>
                  </span>
                  {on && <Check size={14} className="shrink-0" style={{ color: l.color }} />}
                </button>
              );
            })}
          </div>
          {onEdit && (
            <button onClick={() => { setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 border-t border-white/[0.06] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.03] cursor-pointer">
              <Settings2 size={13} /> Редагувати воронки…
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
