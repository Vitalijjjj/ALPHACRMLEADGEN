"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { periodLabel, periodOf, periodRange, shiftPeriod } from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";

// What the ledger shows: a finance month (10th → 10th, with the dividend split rule), all time, or any dates.
export type PeriodValue = { mode: "period"; p: string } | { mode: "all" } | { mode: "range"; from: string; to: string };

const BLUE = "#3b82f6";
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const ymd = (d: Date) => localDate(d);
const parse = (s: string) => new Date(`${s}T12:00`);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

// dates of a value (for the calendar highlight); null = all time
export function valueDates(v: PeriodValue, startDay: number): { from: string; to: string } | null {
  if (v.mode === "all") return null;
  if (v.mode === "range") return { from: v.from, to: v.to };
  const r = periodRange(v.p, startDay);
  // calendar months end on the last day; finance months (10 → 10) show the closing 10th
  return { from: ymd(r.from), to: ymd(startDay === 1 ? addDays(r.to, -1) : r.to) };
}

export function valueLabel(v: PeriodValue): string {
  if (v.mode === "all") return "Весь час";
  if (v.mode === "period") return periodLabel(v.p);
  const f = parse(v.from), t = parse(v.to);
  return v.from === v.to ? format(f, "d MMMM yyyy", { locale: uk }) : `${format(f, "d MMM", { locale: uk })} – ${format(t, "d MMM yyyy", { locale: uk })}`;
}

// full — stretches to the row on phones (desktop look unchanged)
export default function PeriodPicker({ value, onChange, startDay, align = "left", full = false }: { value: PeriodValue; onChange: (v: PeriodValue) => void; startDay: number; align?: "left" | "right"; full?: boolean }) {
  const nowP = periodOf(new Date(), startDay);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string | null } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(() => new Date());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function toggle() {
    if (!open) {
      const d = valueDates(value, startDay);
      setDraft(d);
      const end = d ? parse(d.to) : new Date();
      setView(new Date(end.getFullYear(), end.getMonth() - 1, 1));
    }
    setOpen((o) => !o);
  }

  const pick = (v: PeriodValue) => { onChange(v); setOpen(false); };
  function clickDay(day: string) {
    if (!draft || draft.to) { setDraft({ from: day, to: null }); return; }
    const [a, b] = day < draft.from ? [day, draft.from] : [draft.from, day];
    setDraft({ from: a, to: b });
  }

  const step = (by: number) => {
    if (value.mode === "period") onChange({ mode: "period", p: shiftPeriod(value.p, by) });
    else onChange({ mode: "period", p: shiftPeriod(nowP, by < 0 ? -1 : 0) });
  };

  const today = new Date();
  const presets: { label: string; v: PeriodValue }[] = [
    { label: "Цей місяць", v: { mode: "period", p: nowP } },
    { label: "Минулий місяць", v: { mode: "period", p: shiftPeriod(nowP, -1) } },
    { label: "Сьогодні", v: { mode: "range", from: ymd(today), to: ymd(today) } },
    { label: "Останні 7 днів", v: { mode: "range", from: ymd(addDays(today, -6)), to: ymd(today) } },
    { label: "Останні 30 днів", v: { mode: "range", from: ymd(addDays(today, -29)), to: ymd(today) } },
    { label: "Весь час", v: { mode: "all" } },
  ];
  const same = (a: PeriodValue, b: PeriodValue) => JSON.stringify(a) === JSON.stringify(b);
  const d = valueDates(value, startDay);

  // highlighted range in the calendar (while picking — up to the hovered day)
  const lo = draft?.from ?? null;
  const hi = draft ? draft.to ?? (hover && lo ? (hover < lo ? lo : hover) : lo) : null;
  const lo2 = draft && !draft.to && hover && lo && hover < lo ? hover : lo;

  return (
    <div ref={box} className={`relative ${full ? "w-full md:w-auto" : ""}`}>
      <div className="h-[38px] flex items-center gap-0.5 p-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <button onClick={() => step(-1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Попередній місяць"><ChevronLeft size={15} /></button>
        <button onClick={toggle} className={`flex items-center gap-2 px-2.5 py-1 rounded-lg ${full ? "flex-1 justify-center md:flex-none md:justify-start" : ""} hover:bg-white/[0.05] cursor-pointer`}>
          <CalendarDays size={14} style={{ color: BLUE }} />
          <span className="text-sm font-semibold text-[var(--text)]">{valueLabel(value)}</span>
          {d && value.mode === "period" && <span className="hidden sm:inline text-[11px] text-[var(--text-dim)] tabular-nums">{format(parse(d.from), "dd.MM")}–{format(parse(d.to), "dd.MM")}</span>}
          <ChevronDown size={13} className={`text-[var(--text-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button onClick={() => step(1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Наступний місяць"><ChevronRight size={15} /></button>
      </div>

      {open && (
        <div className={`absolute z-40 ${align === "right" ? "right-0" : "left-0"} mt-2 flex flex-col sm:flex-row rounded-2xl border border-[var(--border)] bg-[#0f0f12] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden`}>
          <div className="flex sm:flex-col gap-0.5 p-2 sm:w-44 border-b sm:border-b-0 sm:border-r border-[var(--border)] overflow-x-auto">
            {presets.map((x) => (
              <button key={x.label} onClick={() => pick(x.v)}
                className={`shrink-0 text-left px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${same(x.v, value) ? "bg-[#3b82f6]/15 text-[#93c5fd]" : "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text)]"}`}>
                {x.label}
              </button>
            ))}
            <div className="hidden sm:block mt-auto px-3 pt-3 text-[10px] leading-snug text-[var(--text-dim)]">Місяць — з {startDay}-го по {startDay}-те</div>
          </div>
          <div className="p-3.5">
            <div className="relative z-10 flex items-center justify-between mb-2">
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Раніше"><ChevronLeft size={15} /></button>
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Пізніше"><ChevronRight size={15} /></button>
            </div>
            <div className="flex gap-6 -mt-9">
              {[0, 1].map((i) => (
                <Month key={i} month={new Date(view.getFullYear(), view.getMonth() + i, 1)} lo={lo2} hi={hi} pending={!!draft && !draft.to}
                  onDay={clickDay} onHover={setHover} className={i === 1 ? "hidden md:block" : ""} />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {draft ? `${format(parse(draft.from), "dd.MM.yyyy")} – ${draft.to ? format(parse(draft.to), "dd.MM.yyyy") : "…"}` : "Вибери дату початку і кінця"}
              </span>
              <button onClick={() => setOpen(false)} className="ml-auto px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
              <button disabled={!draft?.to} onClick={() => draft?.to && pick({ mode: "range", from: draft.from, to: draft.to })}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110" style={{ background: BLUE }}>
                Застосувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Month({ month, lo, hi, pending, onDay, onHover, className = "" }: {
  month: Date; lo: string | null; hi: string | null; pending: boolean;
  onDay: (d: string) => void; onHover: (d: string | null) => void; className?: string;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1, 12)))];
  const today = ymd(new Date());
  return (
    <div className={`w-[252px] ${className}`}>
      <div className="h-9 pointer-events-none flex items-center justify-center text-sm font-semibold text-[var(--text)] capitalize">{format(month, "LLLL yyyy", { locale: uk })}</div>
      <div className="grid grid-cols-7 mb-1">
        {WEEK.map((w) => <div key={w} className="h-7 flex items-center justify-center text-[10px] uppercase text-[var(--text-dim)]">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => onHover(null)}>
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} className="h-9" />;
          const inRange = lo && hi && c >= lo && c <= hi;
          const isLo = c === lo, isHi = c === hi;
          const edge = isLo || isHi;
          const col = i % 7;
          return (
            <div key={c} className="relative h-9 flex items-center justify-center">
              {inRange && !(isLo && isHi) && (
                <div className="absolute inset-y-1 bg-[#3b82f6]/[0.16]"
                  style={{ left: isLo || col === 0 ? "50%" : 0, right: isHi || col === 6 ? "50%" : 0, ...(col === 0 && !isLo ? { left: 4, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 } : {}), ...(col === 6 && !isHi ? { right: 4, borderTopRightRadius: 999, borderBottomRightRadius: 999 } : {}) }} />
              )}
              <button onClick={() => onDay(c)} onMouseEnter={() => pending && onHover(c)}
                className={`relative w-8 h-8 rounded-full text-xs tabular-nums cursor-pointer transition-colors ${edge ? "text-white font-semibold" : inRange ? "text-[#bfdbfe]" : "text-[var(--text-muted)] hover:bg-white/[0.08] hover:text-[var(--text)]"} ${c === today && !edge ? "ring-1 ring-[#3b82f6]/60" : ""}`}
                style={edge ? { background: BLUE, boxShadow: "0 0 0 3px rgba(59,130,246,0.25)" } : undefined}>
                {Number(c.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
