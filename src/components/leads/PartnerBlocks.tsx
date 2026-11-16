"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Plus, Search, X } from "lucide-react";
import { fmtMoney } from "@/lib/finance";
import { leadDisplayName } from "@/lib/leadOptions";
import { toast, toastError } from "@/components/ui/toast";

interface Stage { label: string; color: string; kind: string; funnel?: string }
interface PartnerRow { id: string; number: number; name: string; phone: string | null; stage: Stage }
interface ReferredRow { id: string; number: number; name: string; projectName: string | null; phone: string | null; amount: number | null; currency: string | null; createdAt: string; stage: Stage }

const box = "rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 pt-3 pb-3";
const head = "flex items-center justify-between pb-2 mb-2 border-b border-white/[0.05]";
const title = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]";
const input = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";

function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: async (): Promise<PartnerRow[]> => { const r = await fetch("/api/partners"); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    staleTime: 60_000,
  });
}

// A lead of any other funnel: «Від партнера» — who brought it (for the «Партнери» report).
export function PartnerPicker({ partnerId, canEdit, onSave, onOpen }: { partnerId: string | null; canEdit: boolean; onSave: (id: string | null) => void; onOpen: (id: string) => void }) {
  const q = usePartners();
  const [picking, setPicking] = useState(false);
  const [needle, setNeedle] = useState("");
  const list = q.data ?? [];
  if (!partnerId && !list.length) return null; // no partners yet — nothing to pick
  const cur = list.find((p) => p.id === partnerId);
  const n = needle.trim().toLowerCase();
  const hits = list.filter((p) => !n || `${p.name} ${p.number} ${p.phone ?? ""}`.toLowerCase().includes(n)).slice(0, 8);
  return (
    <section className={box}>
      <div className={head}>
        <h3 className={title}><Handshake size={12} /> Від партнера</h3>
        {canEdit && !picking && (
          <button onClick={() => setPicking(true)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">{partnerId ? "Змінити" : "+ Вказати партнера"}</button>
        )}
      </div>
      {partnerId ? (
        <div className="flex items-center gap-2">
          <button onClick={() => onOpen(partnerId)} className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] text-left cursor-pointer">
            <Handshake size={14} className="text-[#2dd4bf] shrink-0" />
            <span data-private="name" className="flex-1 min-w-0 truncate text-sm text-[var(--text)]">{cur ? leadDisplayName(cur) : "Партнер"}</span>
            {cur && <span className="text-[11px] shrink-0" style={{ color: cur.stage.color }}>{cur.stage.label}</span>}
          </button>
          {canEdit && <button onClick={() => onSave(null)} title="Прибрати партнера" className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-red-400 hover:bg-white/[0.05] cursor-pointer"><X size={13} /></button>}
        </div>
      ) : !picking && <div className="text-xs text-[var(--text-dim)] py-1">Лід прийшов не від партнера</div>}
      {picking && (
        <div className="mt-2 space-y-1">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input autoFocus value={needle} onChange={(e) => setNeedle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setPicking(false); } }}
              placeholder="Ім'я партнера, номер…" className={`${input} pl-8`} />
          </div>
          {hits.map((p) => (
            <button key={p.id} onClick={() => { onSave(p.id); setPicking(false); setNeedle(""); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-white/[0.05] cursor-pointer">
              <span className="text-xs tabular-nums text-[var(--text-dim)]">#{p.number}</span>
              <span data-private="name" className="flex-1 min-w-0 truncate text-sm text-[var(--text)]">{leadDisplayName(p)}</span>
              <span className="text-[10px] shrink-0" style={{ color: p.stage.color }}>{p.stage.label}</span>
            </button>
          ))}
          {!hits.length && <div className="px-1 py-1 text-[11px] text-[var(--text-dim)]">Нічого не знайдено</div>}
          <button onClick={() => setPicking(false)} className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer px-1">Скасувати</button>
        </div>
      )}
    </section>
  );
}

// The partner's card: the leads he passed + «Додати ліда від партнера» (straight into the sales funnel).
export function PartnerLeads({ partner, salesFunnel, onOpen }: {
  partner: { id: string; name: string; number: number };
  salesFunnel: { id: string; name: string; firstStage: string } | null;
  onOpen: (id: string) => void;
}) {
  const qc = useQueryClient();
  const key = ["partner-leads", partner.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ReferredRow[]> => { const r = await fetch(`/api/partners?of=${partner.id}`); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const rows = q.data ?? [];
  const won = rows.filter((r) => r.stage.kind === "win");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!salesFunnel) return;
    if (!form.name.trim() && !form.phone.trim()) return toastError("Вкажи ім'я або телефон клієнта");
    setBusy(true);
    try {
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() || null, comment: form.comment.trim() || null, funnelId: salesFunnel.id, status: salesFunnel.firstStage, source: "Партнер", sourceDetail: leadDisplayName(partner), partnerId: partner.id }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const lead = await r.json();
      toast({ kind: "success", title: `Лід #${lead.number} у «${salesFunnel.name}»`, text: `від партнера ${leadDisplayName(partner)}`, duration: 3500 });
      setForm({ name: "", phone: "", comment: "" }); setAdding(false);
      qc.invalidateQueries({ queryKey: key });
    } catch { toastError("Не вдалося створити ліда"); } finally { setBusy(false); }
  }

  return (
    <section className={box}>
      <div className={head}>
        <h3 className={title}><Handshake size={12} /> Ліди від партнера · {rows.length}</h3>
        {salesFunnel && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-black cursor-pointer" style={{ background: "var(--accent)" }}><Plus size={11} /> Додати ліда</button>
        )}
      </div>
      {adding && salesFunnel && (
        <form onSubmit={add} className="mb-3 p-2.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--surface-2)]/50 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Новий лід у «{salesFunnel.name}» · джерело — партнер</div>
          <div className="grid grid-cols-2 gap-1.5">
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ім'я клієнта" className={input} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Телефон" className={input} />
          </div>
          <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Що потрібно клієнту (коментар)" className={input} />
          <div className="flex justify-end gap-1.5 pt-0.5">
            <button type="button" onClick={() => setAdding(false)} className="px-2.5 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
            <button disabled={busy} className="px-3 py-1 rounded-md text-xs font-semibold text-black cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)" }}>Створити ліда</button>
          </div>
        </form>
      )}
      {q.isLoading ? <div className="text-xs text-[var(--text-dim)] py-1">Завантаження…</div>
        : !rows.length ? <div className="text-xs text-[var(--text-dim)] py-1">Партнер ще не передавав лідів</div>
        : (
          <>
            <div className="space-y-1">
              {rows.map((r) => (
                <button key={r.id} onClick={() => onOpen(r.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)]/50 hover:bg-[var(--surface-2)] text-left cursor-pointer">
                  <span className="text-xs tabular-nums text-[var(--text-dim)]">#{r.number}</span>
                  <span data-private="name" className="flex-1 min-w-0 truncate text-sm text-[var(--text)]">{r.projectName || leadDisplayName(r)}</span>
                  {!!r.amount && <span data-private="amount" className="text-xs tabular-nums text-[var(--text-muted)]">{fmtMoney(r.amount, r.currency ?? "EUR")}</span>}
                  <span className="text-[11px] shrink-0" style={{ color: r.stage.color }}>{r.stage.label}</span>
                  <span className="text-[10px] text-[var(--text-dim)] shrink-0">{new Date(r.createdAt).toLocaleDateString("uk-UA")}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-[var(--text-dim)]">Продано: <b className="text-[var(--text-muted)]">{won.length}</b> з {rows.length}</div>
          </>
        )}
    </section>
  );
}
