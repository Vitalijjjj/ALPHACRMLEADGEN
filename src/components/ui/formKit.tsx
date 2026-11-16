"use client";

// Shared building blocks of the popups, in the style of «Нова операція» (cashflow):
// template cards on top → one line of the key values → fields → sticky footer with a coloured main button.

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

export const fieldCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
export const labelCls = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";
export const cellLabelCls = "block text-[9px] uppercase tracking-wider text-[var(--text-dim)]";

export function FieldLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  if (!right) return <span className={labelCls}>{children}</span>;
  return (
    <div className="flex items-center mb-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mr-auto">{children}</span>
      {right}
    </div>
  );
}

// ── template / type cards («АІ лендос», «Перезвонити»…) ──
export interface CardOption { key: string; label: string; hint?: string; icon: LucideIcon; color: string }

export function TemplateCards({ options, value, onChange, cols = "grid-cols-2 sm:grid-cols-4" }: {
  options: CardOption[]; value: string; onChange: (k: string) => void; cols?: string;
}) {
  return (
    <div className={`grid ${cols} gap-1.5`}>
      {options.map((o) => {
        const on = o.key === value;
        const Icon = o.icon;
        return (
          <button type="button" key={o.key} onClick={() => onChange(o.key)} title={o.hint}
            className={`relative flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left cursor-pointer transition-all duration-150 ${on ? "" : "border-[var(--border)] bg-[var(--surface-2)] hover:border-white/[0.16]"}`}
            style={on ? { borderColor: `${o.color}88`, background: `${o.color}14`, boxShadow: `inset 0 0 0 1px ${o.color}44` } : undefined}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${o.color}1f`, color: o.color }}><Icon size={14} /></span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] leading-tight truncate ${on ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>{o.label}</span>
              {o.hint && <span className="block text-[10px] text-[var(--text-dim)] truncate">{o.hint}</span>}
            </span>
            {on && <Check size={13} className="shrink-0" style={{ color: o.color }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── segmented buttons (like Дохід / Витрата / Переказ) ──
export function Segmented<T extends string>({ options, value, onChange, size = "md" }: {
  options: { key: T; label: string; color: string; icon?: LucideIcon }[]; value: T | ""; onChange: (k: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="flex p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
      {options.map((o) => {
        const on = o.key === value;
        const Icon = o.icon;
        return (
          <button type="button" key={o.key} onClick={() => onChange(o.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg font-semibold cursor-pointer transition-all duration-150 ${size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm"} ${on ? "" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            style={on ? { background: `${o.color}22`, color: o.color, boxShadow: `inset 0 0 0 1px ${o.color}55` } : undefined}>
            {Icon && <Icon size={size === "sm" ? 13 : 15} />} {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── coloured chips (stages, statuses, categories) ──
export function ChipRow({ options, value, onChange }: {
  options: { key: string; label: string; color: string }[]; value: string; onChange: (k: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button type="button" key={o.key} onClick={() => onChange(o.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${on ? "font-semibold" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            style={on ? { color: o.color, borderColor: `${o.color}66`, background: `${o.color}17` } : undefined}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />{o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── currency switch inside a money line ──
export const CUR_SYMBOL: Record<string, string> = { UAH: "₴", EUR: "€", USD: "$" };
export function CurrencyButtons({ list, value, onChange }: { list: readonly string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 px-2">
      {list.map((c) => (
        <button type="button" key={c} onClick={() => onChange(c)}
          className={`px-2.5 sm:px-2 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold cursor-pointer transition-colors ${value === c ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05]"}`}>
          <span className="sm:hidden">{CUR_SYMBOL[c] ?? c}</span><span className="hidden sm:inline">{CUR_SYMBOL[c] ?? ""} {c}</span>
        </button>
      ))}
    </div>
  );
}

// panel with a coloured title (like «Податок 6% — зв'язаний платіж»)
export function Panel({ icon: Icon, title, color = "var(--accent)", right, children }: {
  icon: LucideIcon; title: string; color?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border px-3.5 py-3 space-y-2.5" style={{ borderColor: `color-mix(in srgb, ${color} 25%, transparent)`, background: `color-mix(in srgb, ${color} 4%, transparent)` }}>
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color }} />
        <span className="text-xs font-semibold text-[var(--text)]">{title}</span>
        {right && <span className="ml-auto text-[10px] text-[var(--text-dim)]">{right}</span>}
      </div>
      {children}
    </div>
  );
}

// people as avatar cards; the chosen one is highlighted
export function PeoplePicker({ people, value, onChange, color = "#a855f7", allowNone = true }: {
  people: string[]; value: string; onChange: (v: string) => void; color?: string; allowNone?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {people.map((p) => {
        const on = value === p;
        return (
          <button type="button" key={p} onClick={() => onChange(on && allowNone ? "" : p)}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${on ? "text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            style={on ? { borderColor: color, background: `${color}1a` } : undefined}>
            <AvatarDot name={p} /> <span className="truncate">{p}</span>
            {on && <Check size={14} className="ml-auto shrink-0" style={{ color }} />}
          </button>
        );
      })}
    </div>
  );
}

const AV = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#38bdf8", "#fb923c"];
function AvatarDot({ name }: { name: string }) {
  const c = AV[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AV.length];
  const ini = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span className="inline-flex items-center justify-center rounded-full shrink-0 font-semibold"
      style={{ width: 24, height: 24, fontSize: 10, color: c, background: `${c}22`, border: `1px solid ${c}55` }}>{ini}</span>
  );
}

// sticky footer: Cancel + the main button in the colour of the chosen type
export function FormFooter({ onCancel, busy, color = "var(--accent)", disabled, children, left }: {
  onCancel: () => void; busy?: boolean; color?: string; disabled?: boolean; children: React.ReactNode; left?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] bg-[var(--surface)] border-t border-[var(--border)] flex gap-2 sm:static sm:mx-0 sm:mb-0 sm:p-0 sm:pt-1 sm:bg-transparent sm:border-0">
      {left}
      <button type="button" onClick={onCancel} className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors">Скасувати</button>
      <button type="submit" disabled={busy || disabled}
        className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-[15px] sm:text-sm font-semibold text-black cursor-pointer disabled:opacity-50 transition-[filter] hover:brightness-110 truncate"
        style={{ background: color, boxShadow: `0 8px 24px -12px ${color}` }}>
        {children}
      </button>
    </div>
  );
}
