"use client";

import { useState } from "react";

interface LeadFormProps {
  onSave: (data: LeadFormData) => Promise<void>;
  onCancel: () => void;
  initial?: Partial<LeadFormData>;
}

export interface LeadFormData {
  name: string;
  instagram: string;
  telegram: string;
  phone: string;
  email: string;
  comment: string;
  source: string;
  geo: string;
  niche: string;
  amount: string;
  status: string;
  siteStructure: string;
  hasExtraLang: boolean;
  languages: string;
  service: string;
  paymentSystem: string;
  paymentSystemCustom: string;
  usedServices: string[];
  projectDeadline: string;
  pushAt: string;
}

const STATUSES = [
  { value: "NEW", label: "Новий" },
  { value: "CONTACTED", label: "Контакт" },
  { value: "NEGOTIATION", label: "Переговори" },
  { value: "WON", label: "Виграно" },
  { value: "LOST", label: "Програно" },
];

const SOURCES = ["Instagram", "Telegram", "Реклама", "Сайт", "Реферал", "Інше"];

const SERVICES = [
  "АІ лендос",
  "АІ корпоративний",
  "АІ каталог",
  "ШБ лендинг",
  "ШБ Корпоративний",
  "ШБ Інтернет магазин",
  "Індив Інтернет магазин",
];

const SHOP_SERVICES = ["ШБ Інтернет магазин", "Індив Інтернет магазин"];
const PAYMENT_SYSTEMS = ["MonoPay", "LiqPay", "WayForPay", "Fondy", "Portmone", "Інше"];

export const ALL_UPSELL_SERVICES = [
  "Google Ads", "Target Ads", "SEO", "Google Maps", "Branding", "TikTok Ads", "Graphic Design",
];

const f = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-0.5 uppercase tracking-wide";

export function LeadForm({ onSave, onCancel, initial }: LeadFormProps) {
  const [data, setData] = useState<LeadFormData>({
    name: initial?.name ?? "",
    instagram: initial?.instagram ?? "",
    telegram: initial?.telegram ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    comment: initial?.comment ?? "",
    source: initial?.source ?? "",
    geo: initial?.geo ?? "",
    niche: initial?.niche ?? "",
    amount: initial?.amount ?? "",
    status: initial?.status ?? "NEW",
    siteStructure: initial?.siteStructure ?? "",
    hasExtraLang: initial?.hasExtraLang ?? false,
    languages: initial?.languages ?? "",
    service: initial?.service ?? "",
    paymentSystem: initial?.paymentSystem ?? "",
    paymentSystemCustom: initial?.paymentSystemCustom ?? "",
    usedServices: initial?.usedServices ?? [],
    projectDeadline: initial?.projectDeadline ?? "",
    pushAt: initial?.pushAt ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof LeadFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setData((d) => ({ ...d, [k]: e.target.value }));

  function toggleService(s: string) {
    setData((d) => ({
      ...d,
      usedServices: d.usedServices.includes(s)
        ? d.usedServices.filter((x) => x !== s)
        : [...d.usedServices, s],
    }));
  }

  const isShop = SHOP_SERVICES.includes(data.service);
  const upsell = ALL_UPSELL_SERVICES.filter((s) => !data.usedServices.includes(s));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...data,
        paymentSystem: isShop ? (data.paymentSystem === "Інше" ? data.paymentSystemCustom : data.paymentSystem) : "",
        languages: data.hasExtraLang ? data.languages : "",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {/* ── TWO-COLUMN MAIN GRID ── */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">

        {/* LEFT COL */}
        <div className="space-y-2.5">
          <div>
            <label className={lbl}>Ім'я *</label>
            <input value={data.name} onChange={set("name")} required autoFocus className={f} placeholder="Іван Петренко" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}><span style={{ color: "#E4405F" }}>■</span> Instagram</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)] text-xs select-none">@</span>
                <input value={data.instagram} onChange={set("instagram")} className={`${f} pl-5`} placeholder="username" />
              </div>
            </div>
            <div>
              <label className={lbl}><span style={{ color: "#26A5E4" }}>■</span> Telegram</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)] text-xs select-none">@</span>
                <input value={data.telegram} onChange={set("telegram")} className={`${f} pl-5`} placeholder="username" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Телефон</label>
              <input value={data.phone} onChange={set("phone")} className={f} placeholder="+380..." />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input value={data.email} onChange={set("email")} type="email" className={f} placeholder="email@..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Джерело</label>
              <select value={data.source} onChange={set("source")} className={`${f} cursor-pointer`}>
                <option value="">—</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Статус</label>
              <select value={data.status} onChange={set("status")} className={`${f} cursor-pointer`}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>Гео</label>
              <input value={data.geo} onChange={set("geo")} className={f} placeholder="UA..." />
            </div>
            <div>
              <label className={lbl}>Ніша</label>
              <input value={data.niche} onChange={set("niche")} className={f} placeholder="e-comm..." />
            </div>
            <div>
              <label className={lbl}>Сума ($)</label>
              <input value={data.amount} onChange={set("amount")} type="number" min="0" step="0.01" className={f} placeholder="0" />
            </div>
          </div>

          <div>
            <label className={lbl}>Загальний коментар</label>
            <textarea value={data.comment} onChange={set("comment")} rows={3} className={`${f} resize-none`} placeholder="Нотатки..." />
          </div>
        </div>

        {/* RIGHT COL */}
        <div className="space-y-2.5">
          <div>
            <label className={lbl}>Послуга</label>
            <select
              value={data.service}
              onChange={(e) => setData((d) => ({ ...d, service: e.target.value, paymentSystem: "", paymentSystemCustom: "" }))}
              className={`${f} cursor-pointer`}
            >
              <option value="">— не вибрано —</option>
              {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {isShop && (
            <div>
              <label className={lbl}>Платіжна система</label>
              <select value={data.paymentSystem} onChange={set("paymentSystem")} className={`${f} cursor-pointer`}>
                <option value="">—</option>
                {PAYMENT_SYSTEMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {data.paymentSystem === "Інше" && (
                <input value={data.paymentSystemCustom} onChange={set("paymentSystemCustom")} className={`${f} mt-1.5`} placeholder="Вкажіть..." />
              )}
            </div>
          )}

          <div>
            <label className={lbl}>Структура сайту</label>
            <textarea value={data.siteStructure} onChange={set("siteStructure")} rows={isShop ? 2 : 3} className={`${f} resize-none`} placeholder="Сторінки, розділи..." />
          </div>

          <div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none mb-1">
              <input
                type="checkbox"
                checked={data.hasExtraLang}
                onChange={(e) => setData((d) => ({ ...d, hasExtraLang: e.target.checked, languages: e.target.checked ? d.languages : "" }))}
                className="w-3.5 h-3.5 rounded accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-xs text-[var(--text)]">Додаткова мова</span>
            </label>
            {data.hasExtraLang && (
              <input value={data.languages} onChange={set("languages")} className={f} placeholder="EN, PL, DE..." />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Коли запушити</label>
              <input type="datetime-local" value={data.pushAt} onChange={set("pushAt")} className={f} />
            </div>
            <div>
              <label className={lbl}>Термін проєкту</label>
              <input value={data.projectDeadline} onChange={set("projectDeadline")} className={f} placeholder="30 днів..." />
            </div>
          </div>
        </div>
      </div>

      {/* ── SERVICES FULL WIDTH ── */}
      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
        <div>
          <p className={`${lbl} mb-1`}>Клієнт вже використовує</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_UPSELL_SERVICES.map((s) => {
              const on = data.usedServices.includes(s);
              return (
                <button
                  key={s} type="button" onClick={() => toggleService(s)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                    on ? "text-black border-transparent" : "text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                  style={on ? { background: "var(--accent)" } : {}}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {upsell.length > 0 && (
          <div>
            <p className={`${lbl} mb-1`} style={{ color: "#22c55e" }}>Рекомендовано допродати</p>
            <div className="flex flex-wrap gap-1.5">
              {upsell.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-md text-[11px] border" style={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.07)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── ACTIONS ── */}
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--border)]">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
          Скасувати
        </button>
        <button
          type="submit" disabled={saving}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer text-black"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Збереження..." : "Зберегти"}
        </button>
      </div>
    </form>
  );
}
