"use client";

import { useState } from "react";
import { Layers, Megaphone, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ask } from "@/components/ui/dialogs";
import { toastError } from "@/components/ui/toast";
import { AD_COLORS, AD_MODES, type AdMode, type AdSettings, type AdType } from "@/lib/adTypes";
import { send, useAdsRefresh, type AdCampaignRow } from "@/components/ads/adsData";

const field = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors";
const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";
const MODE_ICON: Partial<Record<AdMode, typeof Layers>> = { daily: Megaphone, spend: Layers };

function Buttons({ busy, onClose, onDelete, submit }: { busy: boolean; onClose: () => void; onDelete?: () => void; submit: string }) {
  return (
    <div className="flex gap-2 pt-1">
      {onDelete && <button type="button" onClick={onDelete} className="px-3 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-dim)] hover:text-red-400 hover:border-red-500/40 cursor-pointer" aria-label="Видалити"><Trash2 size={15} /></button>}
      <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
      <button type="submit" disabled={busy} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer disabled:opacity-50 hover:brightness-110" style={{ background: "var(--accent)" }}>{submit}</button>
    </div>
  );
}

// ── Кампанія: тип + назва (витрати — з кешфлоу) ──
export function CampaignModal({ settings, item, type: initialType, onClose }: { settings: AdSettings; item: AdCampaignRow | null; type: string; onClose: () => void }) {
  const refresh = useAdsRefresh();
  const types = settings.types.filter((t) => t.mode !== "spend");
  const [type, setType] = useState(item?.trafficType ?? (types.some((t) => t.name === initialType) ? initialType : types[0]?.name ?? ""));
  const [name, setName] = useState(item?.name ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toastError("Вкажи назву кампанії");
    setBusy(true);
    try {
      await send(item ? `/api/ad-campaigns/${item.id}` : "/api/ad-campaigns", item ? "PATCH" : "POST", { name: name.trim(), trafficType: type });
      refresh();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!item || !(await ask(`Видалити кампанію «${item.name}»? Ліди й оплати залишаться, але без кампанії.`))) return;
    await send(`/api/ad-campaigns/${item.id}`, "DELETE").catch(() => toastError("Не вдалося видалити"));
    refresh();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={item ? "Кампанія" : "Нова кампанія"} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className={label}>Тип трафіку</span>
          <div className="flex flex-wrap p-1 gap-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
            {types.map((t) => {
              const on = t.name === type;
              return (
                <button key={t.name} type="button" onClick={() => setType(t.name)}
                  className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 ${on ? "" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  style={on ? { color: t.color, background: `${t.color}1f`, boxShadow: `inset 0 0 0 1px ${t.color}55` } : undefined}>
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className={label}>Назва кампанії</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Лендинги · листопад" />
          <div className="mt-1.5 text-[11px] text-[var(--text-dim)]">Витрати підтягуються з кешфлоу — там у витраті «Реклама» вибираєш цю кампанію</div>
        </div>
        <Buttons busy={busy} onClose={onClose} onDelete={item ? remove : undefined} submit={item ? "Зберегти" : "Створити кампанію"} />
      </form>
    </Modal>
  );
}

// ── Тип трафіку: додати / змінити ──
export function TypeModal({ settings, type, onClose }: { settings: AdSettings; type: AdType | null; onClose: () => void }) {
  const refresh = useAdsRefresh();
  const [name, setName] = useState(type?.name ?? "");
  const [color, setColor] = useState(type?.color ?? AD_COLORS[settings.types.length % AD_COLORS.length]);
  const [mode, setMode] = useState<AdMode>(type?.mode === "spend" ? "spend" : type ? "daily" : "spend");
  const [busy, setBusy] = useState(false);

  async function save(types: AdType[], rename?: { from: string; to: string }) {
    setBusy(true);
    try {
      await send("/api/ads/settings", "PUT", { types, rename });
      refresh();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toastError("Вкажи назву");
    if (settings.types.some((t) => t.name.toLowerCase() === n.toLowerCase() && t !== type)) return toastError("Такий тип уже є");
    // a legacy «total» type (Автопрозвон) stays as is while it has campaigns
    const next: AdType = { name: n, color, mode: mode === "daily" && type?.mode === "total" ? "total" : mode };
    save(type ? settings.types.map((t) => (t === type ? next : t)) : [...settings.types, next], type && type.name !== n ? { from: type.name, to: n } : undefined);
  }
  async function remove() {
    if (!type || !(await ask(`Видалити тип «${type.name}»?`))) return;
    save(settings.types.filter((t) => t !== type));
  }

  return (
    <Modal open onClose={onClose} title={type ? "Тип трафіку" : "Новий тип трафіку"} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div><span className={label}>Назва</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Контекст, TikTok…" /></div>
          <div className="flex gap-1 pb-2">
            {AD_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${color === c ? "scale-110 ring-2 ring-white/70 ring-offset-2 ring-offset-[#101013]" : "hover:scale-110"}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Як ведемо</span>
          <div className="space-y-1.5">
            {AD_MODES.map((m) => {
              const I = MODE_ICON[m.key] ?? Layers;
              const on = mode === m.key;
              return (
                <button key={m.key} type="button" onClick={() => setMode(m.key)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left cursor-pointer transition-colors ${on ? "border-[var(--accent)]/50 bg-[var(--accent)]/[0.07]" : "border-[var(--border)] bg-white/[0.015] hover:border-white/15"}`}>
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/[0.05] text-[var(--text-dim)]"}`}><I size={15} /></span>
                  <span><span className="block text-sm font-medium text-[var(--text)]">{m.label}</span><span className="block text-[11px] text-[var(--text-dim)]">{m.hint}</span></span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-dim)]">Витрати завжди беруться з кешфлоу — витрата «Реклама» з вибраною кампанією або типом</div>
        </div>
        <Buttons busy={busy} onClose={onClose} onDelete={type ? remove : undefined} submit={type ? "Зберегти" : "Додати тип"} />
      </form>
    </Modal>
  );
}
