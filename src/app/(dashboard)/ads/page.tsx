"use client";

import { useState } from "react";
import Link from "next/link";
import DashHeader from "@/components/dashboard/DashHeader";
import { ArrowRight, BadgeDollarSign, Pencil, Plus, Receipt, Target, Users, Wallet } from "lucide-react";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import { fmtMoney, periodOf, periodRange } from "@/lib/finance";
import type { AdType } from "@/lib/adTypes";
import { CampaignModal, TypeModal } from "@/components/ads/AdModals";
import { DAY, useAdsOverview, ymd, type AdCampaignRow, type AdPayment, type AdsOverview } from "@/components/ads/adsData";

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const price = (spent: number, n: number) => (spent > 0 && n > 0 ? fmtMoney(spent / n) : "—");

// picker value → inclusive dates (calendar months here: startDay = 1)
function datesOf(v: PeriodValue): { from: string; to: string } {
  if (v.mode === "range") return { from: v.from, to: v.to };
  if (v.mode === "all") return { from: "2020-01-01", to: ymd(new Date()) };
  const r = periodRange(v.p, 1);
  return { from: ymd(r.from), to: ymd(new Date(r.to.getTime() - DAY)) };
}

// «Реклама»: витрати — з кешфлоу (витрати «Реклама» з кампанією / типом), ліди й продажі — з CRM.
export default function AdsPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: periodOf(new Date(), 1) }));
  const { from, to } = datesOf(period);
  const q = useAdsOverview(from, to);
  const data = q.data;
  const [tab, setTab] = useState<string | null>(null);
  const [campaignModal, setCampaignModal] = useState<{ item: AdCampaignRow | null } | null>(null);
  const [typeModal, setTypeModal] = useState<{ type: AdType | null } | null>(null);

  const types = data?.settings.types ?? [];
  const current = types.find((t) => t.name === tab) ?? types[0];
  const all = data?.campaigns ?? [];
  const spent = (data?.payments ?? []).reduce((s, p) => s + p.uah, 0);
  const untyped = (data?.payments ?? []).filter((p) => !p.type);
  const fb = (k: "leads" | "won") => Object.values(data?.fallback ?? {}).reduce((s, f) => s + (f?.[k] ?? 0), 0);
  const leads = all.reduce((s, c) => s + c.leads, 0) + fb("leads");
  const won = all.reduce((s, c) => s + c.won, 0) + fb("won");
  const typeSpent = (t: string) => all.filter((c) => c.trafficType === t).reduce((s, c) => s + c.cash, 0);
  const hasCampaignTypes = types.some((t) => t.mode !== "spend");

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      <DashHeader tab="ads" right={<>
        <PeriodPicker value={period} onChange={setPeriod} startDay={1} align="right" />
        {hasCampaignTypes && (
          <button onClick={() => setCampaignModal({ item: null })}
            className="h-[38px] flex items-center gap-1.5 px-3.5 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 transition-[filter]" style={{ background: "var(--accent)" }}>
            <Plus size={15} /> Кампанія
          </button>
        )}
      </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat icon={Wallet} color="#f472b6" label="Витрачено на рекламу" sub={`${data?.payments.length ?? 0} оплат у кешфлоу`}>{fmtMoney(spent)}</Stat>
        <Stat icon={Users} color="#38bdf8" label="Ліди з реклами" sub={from === to ? "за день" : "за період"}>{leads}</Stat>
        <Stat icon={Target} color="#C98C0A" label="Ціна ліда" sub="витрачено ÷ ліди">{price(spent, leads)}</Stat>
        <Stat icon={BadgeDollarSign} color="#22c55e" label="Ціна продажу" sub={won ? `${won} продаж(ів)` : "продажів ще немає"}>{price(spent, won)}</Stat>
      </div>

      {untyped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[#fbbf24]/40 bg-[#fbbf24]/[0.05] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          <Receipt size={13} className="text-[#fbbf24]" />
          <span><b className="text-[#fbbf24] tabular-nums">{fmtMoney(untyped.reduce((s, p) => s + p.uah, 0))}</b> реклами в кешфлоу без типу ({untyped.length}) — відкрий витрату і вибери кампанію або тип, щоб порахувалось у ціну ліда</span>
          <Link href="/pnl/cashflow" className="ml-auto flex items-center gap-1 text-[var(--text)] hover:text-[var(--accent)]">Кешфлоу <ArrowRight size={12} /></Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {types.map((t) => {
          const on = t.name === current?.name;
          return (
            <button key={t.name} onClick={() => setTab(t.name)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${on ? "font-semibold" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
              style={on ? { color: t.color, borderColor: `${t.color}55`, background: `${t.color}14` } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
              {t.name}
              <span className="text-[11px] font-normal tabular-nums opacity-80">{fmtMoney(typeSpent(t.name))}</span>
              {on && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setTypeModal({ type: t }); }} className="ml-0.5 p-0.5 rounded hover:bg-white/10" aria-label="Змінити тип"><Pencil size={11} /></span>}
            </button>
          );
        })}
        <button onClick={() => setTypeModal({ type: null })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/20 cursor-pointer transition-colors">
          <Plus size={14} /> Тип трафіку
        </button>
      </div>

      {q.isLoading || !data || !current ? (
        <div className="py-16 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>
      ) : (
        <TypeView key={current.name} data={data} type={current} onEdit={(c) => setCampaignModal({ item: c })} />
      )}

      {data && campaignModal && <CampaignModal settings={data.settings} item={campaignModal.item} type={current?.name ?? ""} onClose={() => setCampaignModal(null)} />}
      {data && typeModal && <TypeModal settings={data.settings} type={typeModal.type} onClose={() => setTypeModal(null)} />}
    </div>
  );
}

function Stat({ icon: I, color, label, children, sub }: { icon: typeof Users; color: string; label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={15} /></span>
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="relative mt-3 text-2xl font-bold tabular-nums text-[var(--text)]">{children}</div>
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}

const GRID = "grid grid-cols-[minmax(150px,1.6fr)_100px_52px_92px_60px_100px] 2xl:grid-cols-[minmax(200px,1.6fr)_120px_70px_110px_70px_110px] items-center gap-x-3";

// One traffic type: its numbers, campaigns (if it has them) and the cashflow payments behind them.
function TypeView({ data, type, onEdit }: { data: AdsOverview; type: AdType; onEdit: (c: AdCampaignRow) => void }) {
  const [showAll, setShowAll] = useState(false);
  const general = type.mode === "spend";
  const list = data.campaigns.filter((c) => c.trafficType === type.name).sort((a, b) => b.cash - a.cash || b.leads - a.leads);
  const fb = data.fallback[type.name];
  const spent = list.reduce((s, c) => s + c.cash, 0);
  const leads = list.reduce((s, c) => s + c.leads, 0) + (fb?.leads ?? 0);
  const won = list.reduce((s, c) => s + c.won, 0) + (fb?.won ?? 0);
  const active = list.filter((c) => c.cash > 0 || c.leads > 0);
  const rows = showAll ? list : active;
  const pays = data.payments.filter((p) => p.type === type.name);
  const name = (id: string | null) => data.campaigns.find((c) => c.id === id)?.name ?? "";

  // last 6 calendar months of this type
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, uah: data.months.filter((m) => m.type === type.name && m.month === key).reduce((s, m) => s + m.uah, 0) };
  });
  const maxM = Math.max(1, ...months.map((m) => m.uah));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {[["Витрачено", fmtMoney(spent), type.color], ["Ліди", String(leads), "#38bdf8"], ["Ціна ліда", price(spent, leads), "#C98C0A"], ["Продажі", String(won), "#22c55e"], ["Ціна продажу", price(spent, won), "#22c55e"]].map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-muted)]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{l}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-[var(--text)]">{v}</div>
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-1 ${general ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "xl:grid-cols-[minmax(0,1fr)_360px]"} gap-2.5 items-start`}>
        {general ? (
          <Payments title={`Оплати «${type.name}» з кешфлоу`} pays={pays} name={name} empty={`За період оплат «${type.name}» немає — у кешфлоу витрата «Реклама» → вибери «${type.name}»`} />
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className={`${GRID} px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)]`}>
                  <span>Кампанія</span><span className="text-right">Витрачено</span><span className="text-right">Ліди</span><span className="text-right">Ціна ліда</span><span className="text-right">Продажі</span><span className="text-right">Ціна продажу</span>
                </div>
                {!rows.length && <div className="py-10 text-center text-sm text-[var(--text-muted)]">За період немає ні витрат, ні лідів по кампаніях «{type.name}»</div>}
                {rows.map((c) => (
                  <div key={c.id} onClick={() => onEdit(c)} className={`${GRID} px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] cursor-pointer transition-colors ${c.cash || c.leads ? "" : "opacity-45"}`}>
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--text)]">{c.name}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-[#f472b6]">{c.cash ? fmtMoney(c.cash) : "—"}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text)]">{c.leads || "—"}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--accent)]">{price(c.cash, c.leads)}</span>
                    <span className="text-right text-sm tabular-nums text-[#4ade80]">{c.won || "—"}</span>
                    <span className="text-right text-sm tabular-nums text-[var(--text-muted)]">{price(c.cash, c.won)}</span>
                  </div>
                ))}
                {fb && fb.leads > 0 && (
                  <div className={`${GRID} px-4 py-2.5 border-t border-white/[0.06] text-[var(--text-dim)]`}>
                    <span className="text-sm italic">Ліди без кампанії</span><span />
                    <span className="text-right text-sm tabular-nums">{fb.leads}</span><span />
                    <span className="text-right text-sm tabular-nums">{fb.won || "—"}</span><span />
                  </div>
                )}
              </div>
            </div>
            {list.length > active.length && (
              <button onClick={() => setShowAll((v) => !v)} className="w-full py-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] border-t border-white/[0.05] cursor-pointer">
                {showAll ? "лише з витратами або лідами" : `показати всі кампанії (${list.length})`}
              </button>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: type.color, background: `${type.color}1f` }}><Wallet size={14} /></span>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">По місяцях · з кешфлоу</h3>
            </div>
            <div className="space-y-2.5">
              {months.map((m) => (
                <div key={m.key}>
                  <div className="flex items-center text-xs mb-1">
                    <span className="flex-1 text-[var(--text-muted)]">{m.label}</span>
                    <span className="tabular-nums text-[var(--text)]">{m.uah ? fmtMoney(m.uah) : "—"}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(m.uah / maxM) * 100}%`, background: type.color }} /></div>
                </div>
              ))}
            </div>
          </div>
          {!general && <Payments title="Оплати за період" pays={pays} name={name} empty="Оплат за період немає" compact />}
        </div>
      </div>
    </div>
  );
}

function Payments({ title, pays, name, empty, compact }: { title: string; pays: AdPayment[]; name: (id: string | null) => string; empty: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-auto">{title}</h3>
        <span className="text-[11px] tabular-nums text-[var(--text-dim)]">{pays.length}</span>
      </div>
      {!pays.length && <div className="px-4 py-8 text-center text-xs text-[var(--text-dim)]">{empty}</div>}
      <div className={compact ? "max-h-72 overflow-y-auto" : ""}>
        {pays.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0">
            <span className="w-12 text-xs tabular-nums text-[var(--text-muted)]">{p.date.slice(8, 10)}.{p.date.slice(5, 7)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-[var(--text)] truncate">{[p.who, compact ? name(p.campaignId) : null].filter(Boolean).join(" · ") || "Реклама"}</span>
              {p.comment && <span className="block text-[11px] text-[var(--text-dim)] truncate">{p.comment}</span>}
            </span>
            <span className="text-right">
              <span className="block text-sm font-semibold tabular-nums text-[#f472b6]">{fmtMoney(p.uah)}</span>
              {p.currency !== "UAH" && <span className="block text-[10px] tabular-nums text-[var(--text-dim)]">{fmtMoney(p.amount, p.currency, 2)}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
