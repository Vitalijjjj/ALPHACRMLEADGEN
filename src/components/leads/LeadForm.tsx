"use client";

import { useState } from "react";
import {
  Briefcase, Building2, ChevronDown, FileText, Globe, LayoutGrid, Plus, Search, ShoppingCart, Sparkles, Store, Target, type LucideIcon,
} from "lucide-react";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/currency";
import { getFunnel, resolveStage } from "@/lib/crmSettings";
import { cleanPhone } from "@/lib/leadFilter";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { PAYMENT_SYSTEMS, LEAD_SERVICES as SERVICES, COMMUNICATION_CHANNELS } from "@/lib/leadOptions";
import { useAdCampaigns } from "@/lib/useAdCampaigns";
import { groupNum } from "@/lib/numInput";
import { useLeadSources } from "@/lib/useLeadSources";
import Select from "@/components/finance/Select";
import { ChipRow, CurrencyButtons, FieldLabel, FormFooter, TemplateCards, cellLabelCls, fieldCls } from "@/components/ui/formKit";

interface LeadFormProps {
  onSave: (data: LeadFormData) => Promise<void>;
  onCancel: () => void;
  initial?: Partial<LeadFormData>;
  funnelId?: string | null; // stages in the «Статус» come from this funnel
  edit?: boolean;
}

export interface LeadFormData {
  name: string;
  instagram: string;
  telegram: string;
  phone: string;
  email: string;
  comment: string;
  source: string;
  sourceDetail: string;
  geo: string;
  niche: string;
  amount: string;
  currency?: string; // EUR | UAH | USD
  status: string;
  siteStructure: string;
  hasExtraLang: boolean;
  languages: string;
  service: string;
  paymentSystem: string;
  paymentSystemCustom: string;
  projectDeadline: string;
  pushAt: string;
  pushComment: string;
  pushStage: string;
  messenger: string;
  createdAt: string;
}

const SHOP_SERVICES = ["ШБ Інтернет магазин", "Індив Інтернет магазин"];

// template cards on top: «Новий» (no service) + every service
const SERVICE_META: Record<string, { icon: LucideIcon; color: string; short: string }> = {
  "АІ лендос": { icon: Sparkles, color: "#a78bfa", short: "АІ лендос" },
  "АІ корпоративний": { icon: Building2, color: "#c084fc", short: "АІ корпоративний" },
  "АІ каталог": { icon: LayoutGrid, color: "#e879f9", short: "АІ каталог" },
  "ШБ лендинг": { icon: FileText, color: "#38bdf8", short: "ШБ лендинг" },
  "ШБ Корпоративний": { icon: Briefcase, color: "#22d3ee", short: "ШБ корпоративний" },
  "ШБ Інтернет магазин": { icon: ShoppingCart, color: "#2dd4bf", short: "ШБ магазин" },
  "Індив Інтернет магазин": { icon: Store, color: "#f59e0b", short: "Індив магазин" },
};
const NEW = { key: "", label: "Новий", icon: Plus, color: "#C98C0A" };
// cards on top: only the АІ services (others stay readable on old leads)
const CARD_SERVICES = ["АІ лендос", "АІ корпоративний", "АІ каталог"];
// quick source buttons; the rest — in the dropdown
const QUICK_SOURCES: { key: string; label: string; icon: LucideIcon; color: string; hint: string }[] = [
  { key: "Контекст", label: "Контекст", icon: Search, color: "#4285F4", hint: "Google Ads" },
  { key: "Сайт", label: "Сайт", icon: Globe, color: "#22c55e", hint: "Заявка з сайту" },
  { key: "Таргет", label: "Таргет", icon: Target, color: "#E4405F", hint: "Реклама Meta" },
];
const templateOf = (service: string) => {
  const m = SERVICE_META[service];
  return m ? { key: service, label: m.short, icon: m.icon, color: m.color } : NEW;
};

export function LeadForm({ onSave, onCancel, initial, funnelId, edit }: LeadFormProps) {
  const { settings } = useCrmSettings();
  const funnel = getFunnel(settings, funnelId);
  const [statusTouched, setStatusTouched] = useState(false);
  const { sources: SOURCES, adTypeOf } = useLeadSources();
  const [data, setData] = useState<LeadFormData>({
    name: initial?.name ?? "",
    instagram: initial?.instagram ?? "",
    telegram: initial?.telegram ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    comment: initial?.comment ?? "",
    source: initial?.source ?? "",
    sourceDetail: initial?.sourceDetail ?? "",
    geo: initial?.geo ?? "",
    niche: initial?.niche ?? "",
    amount: initial?.amount ?? "",
    currency: initial?.currency ?? "EUR",
    status: initial?.status ?? "NEW_LEAD",
    siteStructure: initial?.siteStructure ?? "",
    hasExtraLang: initial?.hasExtraLang ?? false,
    languages: initial?.languages ?? "",
    service: initial?.service ?? "",
    paymentSystem: initial?.paymentSystem ?? "",
    paymentSystemCustom: initial?.paymentSystemCustom ?? "",
    projectDeadline: initial?.projectDeadline ?? "",
    pushAt: initial?.pushAt ?? "",
    pushComment: initial?.pushComment ?? "",
    pushStage: initial?.pushStage ?? "",
    messenger: initial?.messenger ?? "",
    createdAt: initial?.createdAt ?? new Date().toISOString().slice(0, 10),
  });
  // «Ще поля» open by itself when one of them is filled (editing)
  const [more, setMore] = useState(() => !!(initial?.name || initial?.instagram || initial?.email || initial?.comment || initial?.siteStructure || initial?.pushAt || initial?.projectDeadline || initial?.messenger || initial?.hasExtraLang || initial?.paymentSystem));
  const [saving, setSaving] = useState(false);
  const [customCampaign, setCustomCampaign] = useState(false);
  const { campaigns } = useAdCampaigns();

  const set = (k: keyof LeadFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setData((d) => ({ ...d, [k]: e.target.value }));
  const put = (patch: Partial<LeadFormData>) => setData((d) => ({ ...d, ...patch }));

  // Status options: working stages of the funnel. A closed lead keeps its win/loss stage
  // (closing with a reason happens via the stage bar / lead card, not here).
  const current = resolveStage(settings, { status: data.status, funnelId });
  const statusOptions = funnel.stages.filter((s) => s.kind === "active" || s.id === current.stage.id);
  const statusSelect = statusOptions.some((s) => s.id === current.stage.id) ? current.stage.id : statusOptions[0]?.id ?? "";
  // Untouched → keep the stored value as is (old status codes stay intact).
  const statusValue = !statusTouched && statusSelect === current.stage.id ? data.status : statusSelect;

  const isShop = SHOP_SERVICES.includes(data.service);
  const tpl = templateOf(data.service);
  const templates = [NEW, ...SERVICES.filter((sv) => CARD_SERVICES.includes(sv) || sv === data.service).map(templateOf)];
  const quick = QUICK_SOURCES.filter((q) => SOURCES.some((x) => x.value === q.key));
  const isQuick = quick.some((q) => q.key === data.source);
  const pickSource = (v: string) => { setCustomCampaign(false); put({ source: v, sourceDetail: "" }); };
  const source = SOURCES.find((s) => s.value === data.source);
  const trafficType = adTypeOf(data.source);
  const n = Number(data.amount.replace(/\s/g, "").replace(",", "."));
  const cur = (data.currency ?? "EUR") as keyof typeof CURRENCY_SYMBOL;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...data,
        status: statusValue,
        paymentSystem: isShop ? (data.paymentSystem === "Інше" ? data.paymentSystemCustom : data.paymentSystem) : "",
        languages: data.hasExtraLang ? data.languages : "",
      });
    } finally {
      setSaving(false);
    }
  }

  const cell = "px-3 py-2 min-w-0";
  const bare = "w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]";

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* what we sell — the template of the lead */}
      <div>
        <FieldLabel>Що продаємо</FieldLabel>
        <TemplateCards options={templates} value={tpl.key} cols="grid-cols-2 sm:grid-cols-4" onChange={(k) => put({ service: k, paymentSystem: "", paymentSystemCustom: "" })} />
      </div>

      {/* contact: phone · telegram — one line */}
      <div className="grid grid-cols-1 sm:grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]/60 transition-colors overflow-hidden">
        <label className={`${cell} border-b sm:border-b-0 sm:border-r border-[var(--border)]`}>
          <span className={cellLabelCls}>Телефон</span>
          {/* stored without spaces / dashes / brackets — cleaned while typing or pasting */}
          <input autoFocus={!edit} value={data.phone} onChange={(e) => put({ phone: cleanPhone(e.target.value) })} inputMode="tel" placeholder="+380…"
            className={`${bare} text-lg font-semibold tabular-nums`} />
        </label>
        <label className={cell}>
          <span className={cellLabelCls}><span style={{ color: "#26A5E4" }}>●</span> Telegram</span>
          <div className="flex items-center gap-1">
            <span className="text-[var(--text-dim)] text-lg select-none">@</span>
            <input value={data.telegram} onChange={set("telegram")} placeholder="username" className={`${bare} text-lg font-semibold`} />
          </div>
        </label>
      </div>

      {/* source: quick buttons + the rest in a dropdown */}
      <div>
        <FieldLabel>Звідки лід</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.3fr)] gap-1.5">
          <TemplateCards options={quick} value={isQuick ? data.source : "__none"} cols="grid-cols-3" onChange={(k) => pickSource(k === data.source ? "" : k)} />
          <Select value={isQuick ? "" : data.source} placeholder="Інше джерело…" onChange={pickSource}
            accent={isQuick ? undefined : "var(--accent)"}
            options={SOURCES.filter((x) => !quick.some((q) => q.key === x.value)).map((x) => ({ value: x.value, label: x.value }))} />
        </div>
      </div>
      <div className={`grid grid-cols-1 gap-2 ${source?.detail ? "" : "hidden"}`}>
        {source?.detail && (
          <div>
            <FieldLabel>{trafficType ? "Кампанія" : source.detail}</FieldLabel>
            {!trafficType || customCampaign ? (
              <input value={data.sourceDetail} onChange={set("sourceDetail")} className={fieldCls} placeholder={source.detail} autoFocus={customCampaign} />
            ) : (() => {
              const options = campaigns.filter((c) => c.trafficType === trafficType);
              const hasCurrent = !data.sourceDetail || options.some((c) => c.name.toLowerCase() === data.sourceDetail.trim().toLowerCase());
              return (
                <Select value={data.sourceDetail} placeholder="— кампанія —"
                  onChange={(v) => { if (v === "__custom__") { setCustomCampaign(true); put({ sourceDetail: "" }); } else put({ sourceDetail: v }); }}
                  options={[
                    ...(!hasCurrent ? [{ value: data.sourceDetail, label: data.sourceDetail }] : []),
                    ...options.map((c) => ({ value: c.name, label: c.name, color: c.active ? "#4ade80" : "#71717a", sub: c.active ? undefined : "вимкнена" })),
                    { value: "__custom__", label: "+ Вписати вручну" },
                  ]} />
              );
            })()}
          </div>
        )}
      </div>

      {/* stage the lead lands on */}
      <div>
        <FieldLabel>На який статус падає</FieldLabel>
        <ChipRow options={statusOptions.map((s) => ({ key: s.id, label: s.label, color: s.color }))} value={statusSelect}
          onChange={(k) => { setStatusTouched(true); put({ status: k }); }} />
      </div>

      {/* niche · geo */}
      <div className="grid grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]/60 transition-colors overflow-hidden">
        <label className={`${cell} border-r border-[var(--border)]`}>
          <span className={cellLabelCls}>Ніша</span>
          <input value={data.niche} onChange={set("niche")} placeholder="Барбершоп, e-comm…" className={bare} />
        </label>
        <label className={cell}>
          <span className={cellLabelCls}>Гео</span>
          <input value={data.geo} onChange={set("geo")} placeholder="UA, PL, Київ…" className={bare} />
        </label>
      </div>

      {/* amount · currency */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]/60 transition-colors overflow-hidden">
        <label className={cell}>
          <span className={cellLabelCls}>Сума</span>
          <input value={data.amount} onChange={(e) => put({ amount: groupNum(e.target.value) })} inputMode="decimal" placeholder="0"
            className="w-full bg-transparent text-[26px] leading-tight sm:text-xl font-bold tabular-nums outline-none placeholder:text-[var(--text-dim)]" style={{ color: tpl.color }} />
        </label>
        <CurrencyButtons list={CURRENCIES} value={cur} onChange={(c) => put({ currency: c })} />
      </div>

      {isShop && (
        <div>
          <FieldLabel>Платіжна система</FieldLabel>
          <ChipRow options={PAYMENT_SYSTEMS.map((p) => ({ key: p, label: p, color: tpl.color }))} value={data.paymentSystem} onChange={(k) => put({ paymentSystem: k })} />
          {data.paymentSystem === "Інше" && <input value={data.paymentSystemCustom} onChange={set("paymentSystemCustom")} className={`${fieldCls} mt-2`} placeholder="Вкажіть…" />}
        </div>
      )}

      {/* the rest — folded */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <button type="button" onClick={() => setMore((v) => !v)}
          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.02] cursor-pointer transition-colors">
          <span className="font-semibold">Ще поля</span>
          <span className="text-[var(--text-dim)] truncate">імʼя, Instagram, email, коментар, структура, пуш…</span>
          <ChevronDown size={14} className={`ml-auto shrink-0 transition-transform duration-200 ${more ? "rotate-180" : ""}`} />
        </button>
        {more && (
          <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-[var(--border)]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><FieldLabel>Імʼя</FieldLabel><input value={data.name} onChange={set("name")} className={fieldCls} placeholder="Іван Петренко" /></div>
              <div><FieldLabel>Instagram</FieldLabel><input value={data.instagram} onChange={set("instagram")} className={fieldCls} placeholder="username (без @)" /></div>
              <div><FieldLabel>Email</FieldLabel><input value={data.email} onChange={set("email")} type="email" className={fieldCls} placeholder="email@…" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <FieldLabel>Канал комунікації</FieldLabel>
                <Select value={data.messenger} onChange={(v) => put({ messenger: v })} placeholder="— де переписка —"
                  options={[{ value: "", label: "— не вказано —" }, ...COMMUNICATION_CHANNELS.map((c) => ({ value: c, label: c }))]} />
              </div>
              <div><FieldLabel>Дата створення</FieldLabel><input value={data.createdAt} onChange={set("createdAt")} type="date" className={fieldCls} style={{ colorScheme: "dark" }} /></div>
            </div>
            <div><FieldLabel>Коментар</FieldLabel><textarea value={data.comment} onChange={set("comment")} rows={2} className={`${fieldCls} resize-none`} placeholder="Нотатки…" /></div>
            <div><FieldLabel>Структура сайту</FieldLabel><textarea value={data.siteStructure} onChange={set("siteStructure")} rows={3} className={`${fieldCls} resize-y`} placeholder="Сторінки, розділи…" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="flex items-center gap-1.5 cursor-pointer select-none mb-1.5">
                  <input type="checkbox" checked={data.hasExtraLang} onChange={(e) => put({ hasExtraLang: e.target.checked, languages: e.target.checked ? data.languages : "" })}
                    className="w-3.5 h-3.5 rounded accent-[var(--accent)] cursor-pointer" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)]">Додаткова мова</span>
                </label>
                {data.hasExtraLang && <input value={data.languages} onChange={set("languages")} className={fieldCls} placeholder="EN, PL, DE…" />}
              </div>
              <div><FieldLabel>Термін проєкту</FieldLabel><input value={data.projectDeadline} onChange={set("projectDeadline")} className={fieldCls} placeholder="30 днів…" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2">
              <div><FieldLabel>Коли запушити</FieldLabel><input type="datetime-local" value={data.pushAt} onChange={set("pushAt")} className={fieldCls} style={{ colorScheme: "dark" }} /></div>
              <div><FieldLabel>Коментар до пушу</FieldLabel><input value={data.pushComment} onChange={set("pushComment")} className={fieldCls} placeholder="Буде у Telegram-повідомленні…" /></div>
            </div>
          </div>
        )}
      </div>

      <FormFooter onCancel={onCancel} busy={saving} color={tpl.color}>
        {saving ? "Збереження…" : edit ? "Зберегти" : <>{tpl.key ? `Новий лід · ${tpl.label}` : "Створити лід"}{n > 0 ? ` · ${data.amount} ${CURRENCY_SYMBOL[cur] ?? ""}` : ""}</>}
      </FormFooter>
    </form>
  );
}
