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
  "Google Ads",
  "Target Ads",
  "SEO",
  "Google Maps",
  "Branding",
  "TikTok Ads",
  "Graphic Design",
];

const fieldCls =
  "w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const labelCls = "block text-xs font-medium text-[var(--text-muted)] mb-1";
const sectionCls = "pt-3 border-t border-[var(--border)]";

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

  const set =
    (k: keyof LeadFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setData((d) => ({ ...d, [k]: e.target.value }));

  function toggleService(service: string) {
    setData((d) => ({
      ...d,
      usedServices: d.usedServices.includes(service)
        ? d.usedServices.filter((s) => s !== service)
        : [...d.usedServices, service],
    }));
  }

  const isShop = SHOP_SERVICES.includes(data.service);
  const upsellServices = ALL_UPSELL_SERVICES.filter((s) => !data.usedServices.includes(s));
  const effectivePayment = data.paymentSystem === "Інше" ? data.paymentSystemCustom : data.paymentSystem;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...data,
        paymentSystem: isShop ? effectivePayment : "",
        languages: data.hasExtraLang ? data.languages : "",
      };
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Name */}
      <div>
        <label className={labelCls}>Ім'я *</label>
        <input value={data.name} onChange={set("name")} required autoFocus className={fieldCls} placeholder="Іван Петренко" />
      </div>

      {/* Social */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}><span style={{ color: "#E4405F" }}>■</span> Instagram</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] text-sm select-none">@</span>
            <input value={data.instagram} onChange={set("instagram")} className={`${fieldCls} pl-7`} placeholder="username" />
          </div>
        </div>
        <div>
          <label className={labelCls}><span style={{ color: "#26A5E4" }}>■</span> Telegram</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] text-sm select-none">@</span>
            <input value={data.telegram} onChange={set("telegram")} className={`${fieldCls} pl-7`} placeholder="username" />
          </div>
        </div>
      </div>

      {/* Phone + Email */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Телефон</label>
          <input value={data.phone} onChange={set("phone")} className={fieldCls} placeholder="+380..." />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input value={data.email} onChange={set("email")} type="email" className={fieldCls} placeholder="email@..." />
        </div>
      </div>

      {/* Source + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Джерело</label>
          <select value={data.source} onChange={set("source")} className={`${fieldCls} cursor-pointer`}>
            <option value="">— не вказано —</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Статус</label>
          <select value={data.status} onChange={set("status")} className={`${fieldCls} cursor-pointer`}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Geo + Niche + Amount */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Гео</label>
          <input value={data.geo} onChange={set("geo")} className={fieldCls} placeholder="UA, PL..." />
        </div>
        <div>
          <label className={labelCls}>Ніша</label>
          <input value={data.niche} onChange={set("niche")} className={fieldCls} placeholder="e-commerce..." />
        </div>
        <div>
          <label className={labelCls}>Сума ($)</label>
          <input value={data.amount} onChange={set("amount")} type="number" min="0" step="0.01" className={fieldCls} placeholder="0" />
        </div>
      </div>

      {/* Comment */}
      <div>
        <label className={labelCls}>Загальний коментар</label>
        <textarea value={data.comment} onChange={set("comment")} rows={2} className={`${fieldCls} resize-none`} placeholder="Нотатки..." />
      </div>

      {/* ── SERVICE SECTION ── */}
      <div className={sectionCls}>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Послуга</p>

        {/* Service dropdown */}
        <div>
          <label className={labelCls}>Послуга</label>
          <select
            value={data.service}
            onChange={(e) => setData((d) => ({ ...d, service: e.target.value, paymentSystem: "", paymentSystemCustom: "" }))}
            className={`${fieldCls} cursor-pointer`}
          >
            <option value="">— не вибрано —</option>
            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Payment — only for shops */}
        {isShop && (
          <div className="mt-3">
            <label className={labelCls}>Платіжна система</label>
            <select
              value={data.paymentSystem}
              onChange={set("paymentSystem")}
              className={`${fieldCls} cursor-pointer`}
            >
              <option value="">— не вибрано —</option>
              {PAYMENT_SYSTEMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {data.paymentSystem === "Інше" && (
              <input
                value={data.paymentSystemCustom}
                onChange={set("paymentSystemCustom")}
                className={`${fieldCls} mt-2`}
                placeholder="Вкажіть платіжну систему..."
              />
            )}
          </div>
        )}
      </div>

      {/* ── SITE STRUCTURE ── */}
      <div className={sectionCls}>
        <label className={labelCls}>Структура сайту</label>
        <textarea
          value={data.siteStructure}
          onChange={set("siteStructure")}
          rows={3}
          className={`${fieldCls} resize-none`}
          placeholder="Опис структури сторінок, розділів..."
        />
      </div>

      {/* ── EXTRA LANG ── */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.hasExtraLang}
            onChange={(e) => setData((d) => ({ ...d, hasExtraLang: e.target.checked, languages: e.target.checked ? d.languages : "" }))}
            className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-sm text-[var(--text)]">Додаткова мова</span>
        </label>
        {data.hasExtraLang && (
          <input
            value={data.languages}
            onChange={set("languages")}
            className={`${fieldCls} mt-2`}
            placeholder="EN, PL, DE..."
          />
        )}
      </div>

      {/* ── USED SERVICES (multi-select) ── */}
      <div className={sectionCls}>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Клієнт вже використовує</p>
        <div className="flex flex-wrap gap-2">
          {ALL_UPSELL_SERVICES.map((s) => {
            const checked = data.usedServices.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleService(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  checked
                    ? "text-black border-transparent"
                    : "text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                }`}
                style={checked ? { background: "var(--accent)", borderColor: "var(--accent)" } : {}}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── UPSELL (auto-computed) ── */}
      {upsellServices.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Рекомендовано допродати</p>
          <div className="flex flex-wrap gap-1.5">
            {upsellServices.map((s) => (
              <span
                key={s}
                className="px-2.5 py-1 rounded-lg text-xs border"
                style={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)" }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── SCHEDULE ── */}
      <div className={sectionCls}>
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Дедлайни</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Коли запушити</label>
            <input
              type="datetime-local"
              value={data.pushAt}
              onChange={set("pushAt")}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Термін проєкту</label>
            <input
              value={data.projectDeadline}
              onChange={set("projectDeadline")}
              className={fieldCls}
              placeholder="30 днів, 2026-06-01..."
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
          Скасувати
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer text-black"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Збереження..." : "Зберегти"}
        </button>
      </div>
    </form>
  );
}
