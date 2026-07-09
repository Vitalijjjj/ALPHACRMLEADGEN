"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Filter, X } from "lucide-react";
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_SERVICES } from "@/lib/leadOptions";

const FILTER_KEYS = ["dateFrom", "dateTo", "status", "niche", "source", "campaign", "geo", "amount", "service"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const field = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide";

export default function OverviewFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = (k: FilterKey) => sp.get(k) ?? "";
  const activeCount = FILTER_KEYS.reduce((n, k) => n + (sp.get(k) ? 1 : 0), 0);

  const setParam = useCallback(
    (k: FilterKey, v: string) => {
      const params = new URLSearchParams(sp.toString());
      if (v) params.set(k, v);
      else params.delete(k);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, sp]
  );

  const reset = () => router.replace(pathname, { scroll: false });

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-4 relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <Filter size={14} style={{ color: "var(--accent)" }} />
          Фільтри аналітики
          {activeCount > 0 && (
            <span className="min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-black" style={{ background: "var(--accent)" }}>
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={reset} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
            <X size={12} /> Скинути
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <div>
          <label className={lbl}>Дата від</label>
          <input type="date" value={get("dateFrom")} onChange={(e) => setParam("dateFrom", e.target.value)} className={field} />
        </div>
        <div>
          <label className={lbl}>Дата до</label>
          <input type="date" value={get("dateTo")} onChange={(e) => setParam("dateTo", e.target.value)} className={field} />
        </div>
        <div>
          <label className={lbl}>Статус</label>
          <select value={get("status")} onChange={(e) => setParam("status", e.target.value)} className={`${field} cursor-pointer`}>
            <option value="">Всі статуси</option>
            {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Джерело</label>
          <select value={get("source")} onChange={(e) => setParam("source", e.target.value)} className={`${field} cursor-pointer`}>
            <option value="">Всі джерела</option>
            {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Кампанія</label>
          <input type="text" value={get("campaign")} onChange={(e) => setParam("campaign", e.target.value)} placeholder="Назва кампанії" className={field} />
        </div>
        <div>
          <label className={lbl}>Ніша</label>
          <input type="text" value={get("niche")} onChange={(e) => setParam("niche", e.target.value)} placeholder="Ніша" className={field} />
        </div>
        <div>
          <label className={lbl}>Гео</label>
          <input type="text" value={get("geo")} onChange={(e) => setParam("geo", e.target.value)} placeholder="Гео" className={field} />
        </div>
        <div>
          <label className={lbl}>Послуга</label>
          <select value={get("service")} onChange={(e) => setParam("service", e.target.value)} className={`${field} cursor-pointer`}>
            <option value="">Всі послуги</option>
            {LEAD_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Сума від (€)</label>
          <input type="number" min="0" value={get("amount")} onChange={(e) => setParam("amount", e.target.value)} placeholder="0" className={field} />
        </div>
      </div>
    </div>
  );
}
