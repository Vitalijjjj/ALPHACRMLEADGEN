"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, ChartLine, ChartNoAxesCombined } from "lucide-react";
import { fmtMoney } from "@/lib/finance";

export interface TrendSeries { key: string; label: string; color: string; fmt?: (v: number) => string; minor?: boolean }
type Row = { p: string; name: string } & Record<string, number | string>;
type View = "bars" | "both" | "lines";
const VIEW_KEY = "pnl-chart-view";
const VIEWS: { key: View; label: string; icon: typeof BarChart3 }[] = [
  { key: "bars", label: "Стовпчики", icon: BarChart3 },
  { key: "both", label: "+ лінії", icon: ChartNoAxesCombined },
  { key: "lines", label: "Лінії", icon: ChartLine },
];

const H = 300, PAD_L = 52, PAD_R = 12, PAD_T = 12, PAD_B = 28;
const short = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

function niceStep(range: number) {
  const raw = range / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

// Grouped bars per month + optional lines through the tops of the same series (growth / fall month to month).
// hover / hidden can be controlled from outside — two charts one under another then highlight the same day together.
export default function TrendChart({ data, series, onPick, height = H, storeKey = VIEW_KEY, defaultView = "both", note, showChange = true, title, tipTitle, hover: hoverExt, onHover, hidden: hiddenExt, onHidden }: {
  data: Row[]; series: readonly TrendSeries[]; onPick?: (p: string) => void; height?: number; storeKey?: string;
  defaultView?: View; note?: string; showChange?: boolean; title?: React.ReactNode; tipTitle?: (p: string) => string;
  hover?: number | null; onHover?: (i: number | null) => void; hidden?: Set<string>; onHidden?: (h: Set<string>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [view, setView] = useState<View>(defaultView);
  const [hiddenLocal, setHiddenLocal] = useState<Set<string>>(new Set());
  const [hoverLocal, setHoverLocal] = useState<number | null>(null);
  const hover = hoverExt !== undefined ? hoverExt : hoverLocal;
  const setHover = (i: number | null) => (onHover ? onHover(i) : setHoverLocal(i));
  const hidden = hiddenExt ?? hiddenLocal;
  const setHidden = (fn: (h: Set<string>) => Set<string>) => (onHidden ? onHidden(fn(hidden)) : setHiddenLocal(fn));

  useEffect(() => {
    try {
      const v = localStorage.getItem(storeKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remembered choice
      if (v === "bars" || v === "both" || v === "lines") setView(v);
    } catch { /* ignore */ }
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [storeKey]);
  const pick = (v: View) => { setView(v); try { localStorage.setItem(storeKey, v); } catch { /* ignore */ } };

  const shown = series.filter((s) => !hidden.has(s.key));
  const vals = data.flatMap((r) => shown.map((s) => Number(r[s.key]) || 0));
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  const step = niceStep(hi - lo);
  const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
  const plotW = w - PAD_L - PAD_R, plotH = height - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const n = Math.max(1, data.length);
  const gw = plotW / n;
  const bars = view !== "lines";
  const bw = Math.max(3, Math.min(14, (gw * 0.78) / Math.max(1, shown.length)));
  const gx = (i: number) => PAD_L + gw * i + gw / 2;
  const bx = (i: number, j: number) => gx(i) - (bw * shown.length) / 2 + bw * j; // left edge of bar j
  const px = (i: number, j: number) => (bars ? bx(i, j) + bw / 2 : gx(i));      // line point
  const row = hover !== null ? data[hover] : null;
  const prev = showChange && hover !== null && hover > 0 ? data[hover - 1] : null;
  const labelEvery = Math.max(1, Math.ceil(24 / gw));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {title}
        <div className="flex flex-wrap gap-1 mr-auto">
          {series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button key={s.key} onClick={() => setHidden((h) => { const x = new Set(h); if (x.has(s.key)) x.delete(s.key); else x.add(s.key); return x; })}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] cursor-pointer transition-opacity ${off ? "opacity-35" : "hover:bg-white/[0.04]"}`}>
                <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} /><span className="text-[var(--text-muted)]">{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => pick(v.key)} title={v.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] cursor-pointer transition-colors ${view === v.key ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
              <v.icon size={12} />{v.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={height} className="block select-none">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)"} />
              <text x={PAD_L - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#6b6b6b">{short(t)}</text>
            </g>
          ))}
          {data.map((r, i) => (
            <g key={r.p}>
              {hover === i && <rect x={PAD_L + gw * i + 2} y={PAD_T} width={gw - 4} height={plotH} rx={8} fill="rgba(255,255,255,0.035)" />}
              {(i % labelEvery === 0 || hover === i) && <text x={gx(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={hover === i ? "#e5e5e5" : "#8a8a8a"}>{r.name}</text>}
              {bars && shown.map((s, j) => {
                const v = Number(r[s.key]) || 0;
                const top = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
                return <rect key={s.key} x={bx(i, j) + 0.5} y={top} width={bw - 1} height={Math.max(v ? 1.5 : 0, h)} rx={2.5} fill={s.color} fillOpacity={view === "both" ? 0.55 : 0.85} />;
              })}
            </g>
          ))}
          {view !== "bars" && shown.map((s, j) => {
            const pts = data.map((r, i) => [px(i, j), y(Number(r[s.key]) || 0)] as const);
            return (
              <g key={s.key}>
                <polyline points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={hover === i ? 4 : 2.6} fill={s.color} stroke="#0b0b0d" strokeWidth={1.2} />)}
              </g>
            );
          })}
          {data.map((r, i) => (
            <rect key={`hit${r.p}`} x={PAD_L + gw * i} y={0} width={gw} height={height} fill="transparent" className="cursor-pointer"
              onMouseEnter={() => setHover(i)} onClick={() => onPick?.(r.p)} />
          ))}
        </svg>

        {row && hover !== null && (
          <div className="pointer-events-none absolute top-2 z-10 rounded-xl border border-white/10 bg-[#0a0a0c]/95 px-3 py-2.5 text-xs shadow-xl min-w-[220px]"
            style={gx(hover) > w / 2 ? { right: w - gx(hover) + gw / 2 } : { left: gx(hover) + gw / 2 }}>
            {!tipTitle && <div className="mb-1.5 font-semibold text-[var(--text)] capitalize">{row.name}</div>}
            {shown.map((s) => {
              const v = Number(row[s.key]) || 0;
              const pv = prev ? Number(prev[s.key]) || 0 : null;
              const ch = pv ? (v - pv) / Math.abs(pv) : null;
              // main series — bright and big; minor ones (Не ЦА, Дублі) — small and dim, after a line
              if (!showChange) return (
                <div key={s.key} className={s.minor ? `flex items-center gap-2 py-0.5 opacity-60 ${shown.find((x) => x.minor) === s ? "mt-1 pt-1.5 border-t border-white/[0.06]" : ""}` : "flex items-center gap-2 py-[3px]"}>
                  <span className={s.minor ? "w-1.5 h-1.5 rounded-sm" : "w-2.5 h-2.5 rounded-[3px]"} style={{ background: s.color, boxShadow: s.minor ? undefined : `0 0 8px ${s.color}80` }} />
                  <span className={`flex-1 ${s.minor ? "text-[11px] text-[var(--text-dim)]" : "text-[13px] text-[var(--text)]"}`}>{s.label}</span>
                  <span className={`tabular-nums ${s.minor ? "text-[11px] text-[var(--text-muted)]" : "text-[15px] font-bold"}`} style={s.minor ? undefined : { color: s.color }}>{s.fmt ? s.fmt(v) : fmtMoney(v)}</span>
                </div>
              );
              return (
                <div key={s.key} className="flex items-center gap-2 py-0.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                  <span className="flex-1 text-[var(--text-muted)]">{s.label}</span>
                  <span className="tabular-nums text-[var(--text)]">{s.fmt ? s.fmt(v) : fmtMoney(v)}</span>
                  <span className="w-11 text-right tabular-nums text-[10px]" style={{ color: ch === null ? "transparent" : ch >= 0 ? "#4ade80" : "#f87171" }}>
                    {ch === null ? "·" : `${ch >= 0 ? "▲" : "▼"}${Math.min(999, Math.round(Math.abs(ch) * 100))}%`}
                  </span>
                </div>
              );
            })}
            {tipTitle ? <div className="mt-2 pt-1.5 border-t border-white/[0.06] text-xs font-semibold text-[var(--text-muted)]">{tipTitle(row.p)}</div>
              : (showChange || note) && <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] text-[10px] text-[var(--text-dim)]">{note ?? `▲▼ — до попереднього місяця${onPick ? " · клік — відкрити місяць" : ""}`}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
