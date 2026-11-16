"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import { LEAD_STATUSES, LEAD_SERVICES } from "@/lib/leadOptions";
import { useAdCampaigns } from "@/lib/useAdCampaigns";
import { useLeadSources } from "@/lib/useLeadSources";
import { groupNum } from "@/lib/numInput";

const KEYS = ["source", "campaign", "status", "service", "niche", "geo", "amount"] as const;
type Key = (typeof KEYS)[number];
const field = "w-full h-9 px-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wider";

// Period (month by month / own dates / all time) + a compact «Фільтри» button with the extended filter in a popover.
// Everything lives in the URL, the server page recounts.
export default function DashFilterBar({ value }: { value: PeriodValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { sources } = useLeadSources();
  const { campaigns } = useAdCampaigns();
  const get = (k: Key) => sp.get(k) ?? "";
  const active = KEYS.filter((k) => sp.get(k)).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const go = (params: URLSearchParams) => start(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  const set = (k: Key, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    go(p);
  };
  const pickPeriod = (v: PeriodValue) => {
    const p = new URLSearchParams(sp.toString());
    p.delete("p"); p.delete("dateFrom"); p.delete("dateTo");
    if (v.mode === "all") p.set("p", "all");
    else if (v.mode === "period") p.set("p", v.p);
    else { p.set("dateFrom", v.from); p.set("dateTo", v.to); }
    go(p);
  };
  const reset = () => {
    const p = new URLSearchParams(sp.toString());
    KEYS.forEach((k) => p.delete(k));
    go(p);
  };
  const typeCampaigns = campaigns.filter((c) => !get("source") || c.trafficType.toLowerCase() === get("source").toLowerCase());

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 size={15} className="animate-spin text-[var(--text-dim)]" />}
      <div ref={box} className="relative">
        <button onClick={() => setOpen((o) => !o)}
          className={`h-[38px] flex items-center gap-2 px-3 rounded-xl border text-sm cursor-pointer transition-colors ${active ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
          <SlidersHorizontal size={14} />Фільтри
          {active > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-black bg-[var(--accent)]">{active}</span>}
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[min(560px,calc(100vw-32px))] rounded-2xl border border-[var(--border)] bg-[#0f0f12]/98 backdrop-blur-xl shadow-2xl p-4">
            <div className="flex items-center mb-3">
              <span className="text-sm font-semibold text-[var(--text)] mr-auto">Розширений фільтр</span>
              {active > 0 && <button onClick={reset} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><X size={12} />Скинути все</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Джерело</label>
                <select value={get("source")} onChange={(e) => set("source", e.target.value)} className={`${field} cursor-pointer`}>
                  <option value="">Всі джерела</option>
                  {sources.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Кампанія</label>
                <select value={get("campaign")} onChange={(e) => set("campaign", e.target.value)} className={`${field} cursor-pointer`}>
                  <option value="">Всі кампанії</option>
                  {get("campaign") && !typeCampaigns.some((c) => c.name === get("campaign")) && <option value={get("campaign")}>{get("campaign")}</option>}
                  {typeCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name} · {c.trafficType}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Був на стадії</label>
                <select value={get("status")} onChange={(e) => set("status", e.target.value)} className={`${field} cursor-pointer`}>
                  <option value="">Всі стадії</option>
                  {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Послуга</label>
                <select value={get("service")} onChange={(e) => set("service", e.target.value)} className={`${field} cursor-pointer`}>
                  <option value="">Всі послуги</option>
                  {LEAD_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <TextFilter label="Ніша" value={get("niche")} onCommit={(v) => set("niche", v)} />
              <TextFilter label="Гео" value={get("geo")} onCommit={(v) => set("geo", v)} />
              <TextFilter label="Сума від (€)" value={get("amount")} onCommit={(v) => set("amount", v.replace(/\s/g, ""))} num />
            </div>
          </div>
        )}
      </div>
      <PeriodPicker value={value} onChange={pickPeriod} startDay={1} align="right" />
    </div>
  );
}

// text inputs apply on Enter / leaving the field (not on every letter — each change recounts the page)
function TextFilter({ label, value, onCommit, num }: { label: string; value: string; onCommit: (v: string) => void; num?: boolean }) {
  const [v, setV] = useState(num ? groupNum(value) : value);
  const commit = () => { if (v.trim() !== (num ? groupNum(value) : value)) onCommit(v.trim()); };
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input value={v} onChange={(e) => setV(num ? groupNum(e.target.value) : e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }} placeholder={num ? "0" : label} inputMode={num ? "decimal" : undefined} className={field} />
    </div>
  );
}
