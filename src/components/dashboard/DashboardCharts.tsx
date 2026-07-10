"use client";

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

export const CARD = {
  background:
    "linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.012) 40%, rgba(255,255,255,0) 100%), rgba(10,10,10,0.82)",
  backdropFilter: "blur(48px) saturate(180%) brightness(1.06)",
  WebkitBackdropFilter: "blur(48px) saturate(180%) brightness(1.06)",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow:
    "0 8px 60px -12px rgba(0,0,0,0.80), 0 4px 24px -4px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.55)",
  borderRadius: 18,
  position: "relative" as const,
  overflow: "hidden" as const,
} as React.CSSProperties;

const TOOLTIP_STYLE = {
  background: "rgba(8,8,8,0.97)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 10,
  color: "#f0f0f0",
  fontSize: 12,
  boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
};

export interface DailyLeadPoint {
  day: string;
  total: number;
  targeted: number;
  lost: number;
  won: number;
}

interface LeadStatus {
  status: string;
  _count: { status: number };
}

interface DealStatus {
  status: string;
  _count: { status: number };
}

const STATUS_COLORS: Record<string, string> = {
  // legacy
  NEW: "#C98C0A",
  NEGOTIATION: "#a78bfa",
  LOST: "#f87171",
  // current
  NEW_LEAD:      "#C98C0A",
  CONTACTED:     "#22d3ee",
  MISSED_CALL:   "#f59e0b",
  TARGETED:      "#22c55e",
  PROPOSAL:      "#a78bfa",
  INTERESTED:    "#34d399",
  THINKING:      "#60a5fa",
  CLOSE:         "#fb7185",
  WON:           "#22c55e",
  NOT_INTERESTED: "#f87171",
  DUPLICATE:     "#ef4444",
  UNREACHABLE:   "#dc2626",
  NOT_TARGET:    "#f97316",
  TOO_EXPENSIVE: "#fb923c",
};

const DEAL_COLORS: Record<string, string> = {
  PLANNING: "#C98C0A",
  DESIGN: "#22d3ee",
  DEVELOPMENT: "#a78bfa",
  TESTING: "#fbbf24",
  COMPLETED: "#00cc33",
};

const STATUS_LABELS: Record<string, string> = {
  // legacy lead statuses
  NEW: "Новий лід",
  NEGOTIATION: "Переговори",
  LOST: "Програш",
  // current lead statuses
  NEW_LEAD:       "Новий лід",
  CONTACTED:      "Звʼязався",
  MISSED_CALL:    "Недозвон",
  TARGETED:       "Цільовий",
  PROPOSAL:       "КП",
  INTERESTED:     "Цікаво",
  THINKING:       "Думає",
  CLOSE:          "Закрити лід",
  WON:            "Виграш",
  NOT_INTERESTED: "Не цікаво",
  DUPLICATE:      "Дубль",
  UNREACHABLE:    "Не змогли звʼязатись",
  NOT_TARGET:     "не ЦА",
  TOO_EXPENSIVE:  "Дорого",
  // deal statuses
  PLANNING:    "Планування",
  DESIGN:      "Дизайн",
  DEVELOPMENT: "Розробка",
  TESTING:     "Тестування",
  COMPLETED:   "Завершено",
};

export function LeadDonutChart({ data }: { data: LeadStatus[] }) {
  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d._count.status,
    color: STATUS_COLORS[d.status] ?? "#444444",
  }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-[var(--text-muted)] text-sm">
        Немає даних
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-36 h-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={60}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.90} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-2xl font-bold"
            style={{ color: "var(--accent)", textShadow: "0 0 16px var(--accent-glow)" }}
          >
            {total}
          </span>
          <span className="text-xs text-[var(--text-muted)]">лідів</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: d.color, boxShadow: `0 0 4px ${d.color}60` }}
            />
            <span className="text-[var(--text-muted)] truncate">{d.name}</span>
            <span className="ml-auto font-semibold text-[var(--text)]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <svg width={128} height={128} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={64} cy={64} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={10}
          />
          <circle
            cx={64} cy={64} r={r}
            fill="none"
            stroke="url(#ring-grad-new)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease", filter: "drop-shadow(0 0 6px rgba(201,140,10,0.5))" }}
          />
          <defs>
            <linearGradient id="ring-grad-new" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C98C0A" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold"
            style={{ color: "var(--accent)", textShadow: "0 0 20px var(--accent-glow)" }}
          >
            {pct}%
          </span>
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{done} з {total} виконано</p>
    </div>
  );
}

export function DealBarChart({ data }: { data: DealStatus[] }) {
  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d._count.status,
    fill: DEAL_COLORS[d.status] ?? "#333333",
  }));

  if (chartData.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
        Немає даних
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={chartData} barSize={28}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: "#555555" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="value" name="Deals" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MiniLineChart({ points }: { points: number[] }) {
  const data = points.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={56}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C98C0A" stopOpacity={0.20} />
            <stop offset="100%" stopColor="#C98C0A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke="#C98C0A"
          strokeWidth={2}
          fill="url(#area-grad)"
          dot={false}
          strokeLinecap="round"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LeadDynamicsSection({
  currentData,
  prevData,
  currentLabel,
  prevLabel,
  rangeData,
  rangeLabel,
}: {
  currentData: DailyLeadPoint[];
  prevData: DailyLeadPoint[];
  currentLabel: string;
  prevLabel: string;
  rangeData?: DailyLeadPoint[] | null;
  rangeLabel?: string | null;
}) {
  const [tab, setTab] = useState<"current" | "prev">("current");
  const isRange = !!rangeData;
  const data = isRange ? rangeData! : tab === "current" ? currentData : prevData;
  const label = isRange ? (rangeLabel ?? "") : tab === "current" ? currentLabel : prevLabel;

  // Show every date tick and per-point counts only while they still fit.
  const tickInterval = data.length <= 31 ? 0 : Math.ceil(data.length / 31) - 1;
  const showPointLabels = data.length > 0 && data.length <= 40;
  const pointLabel = (fill: string, position: "top" | "bottom") =>
    showPointLabels ? { position, fontSize: 9, fill, offset: 7 } : false;
  const dot = showPointLabels ? { r: 2, strokeWidth: 0 } : false;

  return (
    <div style={CARD} className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">Динаміка лідів</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
        </div>
        {!isRange && (
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {(["current", "prev"] as const).map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-xs px-3 py-1.5 transition-colors cursor-pointer${i > 0 ? " border-l border-[rgba(255,255,255,0.08)]" : ""}`}
                style={{
                  background: tab === t ? "var(--accent)" : "transparent",
                  color: tab === t ? "#000" : "var(--text-muted)",
                  fontWeight: tab === t ? 600 : 400,
                }}
              >
                {t === "current" ? "Поточний" : "Попередній"}
              </button>
            ))}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-52 text-[var(--text-muted)] text-sm">
          {isRange ? "Немає даних за вибраний період" : "Немає даних за цей місяць"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={286}>
          <LineChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 8.5, fill: "#666" }}
              axisLine={false}
              tickLine={false}
              interval={tickInterval}
              angle={-45}
              textAnchor="end"
              height={56}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 9, fill: "#555" }}
              axisLine={false}
              tickLine={false}
              width={20}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              formatter={(val: string) => (
                <span style={{ color: "#888" }}>{val}</span>
              )}
            />
            <Line
              type="monotone" dataKey="total" name="Загальна"
              stroke="#C98C0A" strokeWidth={2} dot={dot}
              label={pointLabel("#C98C0A", "top")}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
            <Line
              type="monotone" dataKey="targeted" name="Цільовий"
              stroke="#22c55e" strokeWidth={2} dot={dot}
              label={pointLabel("#22c55e", "bottom")}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
            <Line
              type="monotone" dataKey="lost" name="Не ЦА"
              stroke="#f87171" strokeWidth={2} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
            <Line
              type="monotone" dataKey="won" name="Виграно"
              stroke="#22d3ee" strokeWidth={2} dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
