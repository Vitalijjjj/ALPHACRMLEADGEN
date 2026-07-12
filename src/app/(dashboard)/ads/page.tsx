"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Trash2, Power, Pencil, X, Check } from "lucide-react";
import { AD_TRAFFIC_TYPES, AD_TRAFFIC_ACCENT } from "@/lib/leadOptions";

interface AdCampaign {
  id: string;
  name: string;
  trafficType: string;
  dailyBudget: number | null;
  totalBudget: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  createdAt: string;
}

interface CampaignDraft {
  name: string;
  trafficType: string;
  dailyBudget: string;
  totalBudget: string;
  startDate: string;
  endDate: string;
}

const EMPTY_DRAFT: CampaignDraft = {
  name: "",
  trafficType: "Таргет",
  dailyBudget: "",
  totalBudget: "",
  startDate: "",
  endDate: "",
};

const f = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide";

function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : "";
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(v: number | null): string {
  return v != null ? `€${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
}

// Поля драфта, що відрізняються за типом трафіку:
// Таргет — денний бюджет; Автопрозвон — загальний бюджет + обов'язково дати.
function DraftFields({
  draft,
  set,
}: {
  draft: CampaignDraft;
  set: (patch: Partial<CampaignDraft>) => void;
}) {
  const isAutocall = draft.trafficType === "Автопрозвон";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div className="col-span-2">
        <label className={lbl}>Назва кампанії</label>
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={f} placeholder="Назва..." />
      </div>
      <div>
        <label className={lbl}>Тип трафіку</label>
        <select
          value={draft.trafficType}
          onChange={(e) => set({ trafficType: e.target.value })}
          className={`${f} cursor-pointer`}
        >
          {AD_TRAFFIC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>{isAutocall ? "Бюджет кампанії (€)" : "Денний бюджет (€)"}</label>
        <input
          type="number" min="0" step="0.01"
          value={isAutocall ? draft.totalBudget : draft.dailyBudget}
          onChange={(e) => set(isAutocall ? { totalBudget: e.target.value } : { dailyBudget: e.target.value })}
          className={f} placeholder="0"
        />
      </div>
      <div>
        <label className={lbl}>Дата початку</label>
        <input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} className={f} />
      </div>
      <div>
        <label className={lbl}>Дата закінчення</label>
        <input type="date" value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} className={f} />
      </div>
    </div>
  );
}

export default function AdsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ad-campaigns");
      if (res.ok) setCampaigns(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addCampaign() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setDraft(EMPTY_DRAFT);
        setShowAdd(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/ad-campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      if (res.ok) {
        setEditId(null);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  // Вимкнення без дати закінчення проставляє її сьогоднішнім днем (щоб бюджет перестав накручуватись);
  // увімкнення знімає дату закінчення, якщо вона в минулому.
  async function toggleActive(c: AdCampaign) {
    const next = !c.active;
    const patch: Record<string, unknown> = { active: next };
    if (!next && !c.endDate) patch.endDate = new Date().toISOString().slice(0, 10);
    if (next && c.endDate && new Date(c.endDate) <= new Date()) patch.endDate = null;

    setCampaigns((list) => list.map((x) => (x.id === c.id ? { ...x, active: next } : x)));
    await fetch(`/api/ad-campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function remove(c: AdCampaign) {
    if (!confirm(`Видалити кампанію «${c.name}»? Ліди залишаться без змін.`)) return;
    setCampaigns((list) => list.filter((x) => x.id !== c.id));
    await fetch(`/api/ad-campaigns/${c.id}`, { method: "DELETE" });
  }

  function startEdit(c: AdCampaign) {
    setEditId(c.id);
    setEditDraft({
      name: c.name,
      trafficType: c.trafficType,
      dailyBudget: c.dailyBudget != null ? String(c.dailyBudget) : "",
      totalBudget: c.totalBudget != null ? String(c.totalBudget) : "",
      startDate: toDateInput(c.startDate),
      endDate: toDateInput(c.endDate),
    });
  }

  const grouped = AD_TRAFFIC_TYPES
    .map((type) => ({ type, items: campaigns.filter((c) => c.trafficType === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(201,140,10,0.1)", border: "1px solid rgba(201,140,10,0.2)" }}
          >
            <Megaphone size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--text)]">Реклама</h1>
            <p className="text-xs text-[var(--text-muted)]">Рекламні кампанії: Таргет та Автопрозвон</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-black transition-opacity hover:opacity-90 cursor-pointer shrink-0"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={14} /> Нова кампанія
        </button>
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 sm:p-4 space-y-3">
          <DraftFields draft={draft} set={(p) => setDraft((d) => ({ ...d, ...p }))} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setDraft(EMPTY_DRAFT); }}
              className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
              Скасувати
            </button>
            <button onClick={addCampaign} disabled={saving || !draft.name.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg text-black disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--accent)" }}>
              {saving ? "Збереження..." : "Додати"}
            </button>
          </div>
        </div>
      )}

      {/* ── Campaign groups ── */}
      {loading ? (
        <p className="text-center py-10 text-sm text-[var(--text-muted)]">Завантаження...</p>
      ) : campaigns.length === 0 ? (
        <p className="text-center py-10 text-sm text-[var(--text-muted)]">
          Кампаній ще немає — додайте першу або вони підтягнуться з існуючих лідів.
        </p>
      ) : (
        grouped.map(({ type, items }) => {
          const accent = AD_TRAFFIC_ACCENT[type] ?? "#C98C0A";
          return (
            <div key={type} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span
                  className="text-xs px-2 py-0.5 rounded-md font-semibold border"
                  style={{ color: accent, borderColor: `${accent}40`, background: `${accent}12` }}
                >
                  {type}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{items.length} кампаній</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      <th className="text-left font-medium px-4 py-2">Назва</th>
                      <th className="text-right font-medium px-3 py-2">{type === "Автопрозвон" ? "Бюджет кампанії" : "Денний бюджет"}</th>
                      <th className="text-left font-medium px-3 py-2">Початок</th>
                      <th className="text-left font-medium px-3 py-2">Закінчення</th>
                      <th className="text-left font-medium px-3 py-2">Стан</th>
                      <th className="text-right font-medium px-4 py-2">Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      editId === c.id ? (
                        <tr key={c.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td colSpan={6} className="px-4 py-3">
                            <div className="space-y-3">
                              <DraftFields draft={editDraft} set={(p) => setEditDraft((d) => ({ ...d, ...p }))} />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setEditId(null)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
                                  <X size={12} /> Скасувати
                                </button>
                                <button onClick={() => saveEdit(c.id)} disabled={saving || !editDraft.name.trim()}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-black disabled:opacity-50 cursor-pointer"
                                  style={{ background: "var(--accent)" }}>
                                  <Check size={12} /> Зберегти
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={c.id} className="hover:bg-white/[0.02] transition-colors" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-2.5 font-medium text-[var(--text)]">{c.name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--accent)" }}>
                            {fmtMoney(c.trafficType === "Автопрозвон" ? c.totalBudget : c.dailyBudget)}
                            {c.trafficType !== "Автопрозвон" && c.dailyBudget != null && <span className="text-[var(--text-dim)]"> /день</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)]">{fmtDate(c.startDate)}</td>
                          <td className="px-3 py-2.5 text-[var(--text-muted)]">{fmtDate(c.endDate)}</td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => toggleActive(c)}
                              className="flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                              style={{ color: c.active ? "#22c55e" : "var(--text-dim)" }}
                              title={c.active ? "Вимкнути" : "Увімкнути"}
                            >
                              <Power size={12} />
                              {c.active ? "Крутиться" : "Вимкнена"}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => startEdit(c)}
                                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04] transition-colors cursor-pointer" title="Редагувати">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => remove(c)}
                                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-red-500/5 transition-colors cursor-pointer" title="Видалити">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
