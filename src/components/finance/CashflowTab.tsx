"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeftRight, ArrowRight, Briefcase, Check, ListChecks, MessageSquareText, Building2, Copy, CreditCard, Crown, Landmark, Link2, Megaphone, Plus, Repeat, Search, SlidersHorizontal,
  Sparkles, Tag, Trash2, UserRound, Wallet, X, type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ask } from "@/components/ui/dialogs";
import { toast, toastError } from "@/components/ui/toast";
import {
  CONV_CAT, CURRENCIES, PRESET_META, WD_CAT, accountShort, projectTitle, TX_PRESETS, fmtMoney, needsTax6, periodLabel, periodOf, periodRange, presetOf, txPeriod,
  type FinanceSettings, type TxPreset,
} from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";
import TxModal, { TaxModal, type TaxIncome } from "@/components/finance/TxModal";
import { Avatar } from "@/components/finance/Person";
import AccountIcon from "@/components/finance/AccountIcon";
import PeriodPicker, { type PeriodValue } from "@/components/finance/PeriodPicker";
import Select from "@/components/finance/Select";
import ListPager, { usePager } from "@/components/ui/ListPager";
import { SCHEDULE_KEY, TX_KEY, useAdCampaigns, useFinance, useRecurring, useTransactions, type TxRow } from "@/components/finance/useFinance";
import { useFx } from "@/lib/useFx";
import { groupNum } from "@/lib/numInput";

const NONE = "__none";
const SYM: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€" };
const TYPE = {
  in: { label: "Дохід", color: "#4ade80" },
  out: { label: "Витрата", color: "#fb923c" },
  move: { label: "Переказ", color: "#7dd3fc" },
} as const;

interface Filters {
  presets: Set<TxPreset>;
  accountId: string;
  currency: string;
  project: string;    // key of a project / deal, or NONE
  category: string;   // or NONE
  who: string;        // counterparty
  min: string;
  max: string;
  todo: boolean;
}
const EMPTY: Filters = { presets: new Set(), accountId: "", currency: "", project: "", category: "", who: "", min: "", max: "", todo: false };

// «Кешфлоу» — the working ledger of the company: every operation in one table, with a period and filters.
// «Рух грошей» (mode="transfers") — the same ledger, only moves between accounts.
export default function CashflowTab({ onOpenLead, mode: initialMode = "cash" }: { onOpenLead: (id: string) => void; mode?: "cash" | "transfers" }) {
  const [mode, setMode] = useState<"cash" | "transfers">(initialMode);
  const transfers = mode === "transfers";
  const qc = useQueryClient();
  const { fin } = useFinance();
  const { fx } = useFx();
  const txQ = useTransactions();
  const journal = useMemo(() => txQ.data ?? [], [txQ.data]);
  const all = useMemo(() => (transfers ? journal.filter((x) => x.kind === "transfer") : journal), [journal, transfers]);
  const adsQ = useAdCampaigns(!transfers);
  const peopleQ = useRecurring(!transfers);
  const adName = (id: string | null | undefined) => (id ? adsQ.data?.find((c) => c.id === id)?.name : undefined);
  const roleOf = (name: string) => peopleQ.data?.find((r) => r.type === "employee" && r.name === name)?.role ?? null;
  const startDay = fin.monthStartDay;
  const [period, setPeriod] = useState<PeriodValue>(() => ({ mode: "period", p: periodOf(new Date(), startDay) }));
  const [f, setF] = useState<Filters>(EMPTY);
  const [panel, setPanel] = useState(false);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ edit?: TxRow; copy?: TxRow } | null>(null);
  const [taxFor, setTaxFor] = useState<TaxIncome | null>(null);
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));

  // N — new operation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (e.key === "n" || e.key === "т") { e.preventDefault(); setModal({}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const acc = (id: string | null) => fin.accounts.find((a) => a.id === id);
  const childOf = useMemo(() => new Map(journal.filter((x) => x.parentId && x.kind === "tax").map((x) => [x.parentId!, x])), [journal]);
  const missingTax = (x: TxRow) => needsTax6(x, fin) && !childOf.has(x.id);
  const projectKey = (x: TxRow) => x.leadId ?? x.projectId ?? "";
  const projectName = (x: TxRow) => (x.lead ? projectTitle(x.lead, x.project?.name) : x.project?.name ?? "");

  // how much of a deal is paid (for the progress bar), UAH
  const paidByLead = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of journal) if (x.kind === "income" && x.leadId) m.set(x.leadId, (m.get(x.leadId) ?? 0) + x.amountUah);
    return m;
  }, [journal]);
  const progress = (x: TxRow): number | null => {
    if (!x.lead?.amount) return null;
    const total = x.lead.amount * (x.lead.currency === "EUR" ? fx.eurUah : x.lead.currency === "USD" ? fx.usdUah : 1);
    return total > 0 ? Math.min(1, (paidByLead.get(x.lead.id) ?? 0) / total) : null;
  };

  // «Розібрати»: money without a project, expenses without a category / campaign, income without its 6%
  const needsWork = (x: TxRow) =>
    (x.kind === "income" && !projectKey(x) && !x.category) || (x.kind === "expense" && !x.category) ||
    (presetOf(x) === "ads" && !x.adCampaignId) || missingTax(x);

  const inPeriod = all.filter((t) => {
    if (period.mode === "all") return true;
    if (period.mode === "period") return txPeriod(t, startDay) === period.p;
    const day = localDate(new Date(t.date));
    return day >= period.from && day <= period.to;
  });
  const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));
  const needle = q.trim().toLowerCase();
  const rows = inPeriod.filter((x) => {
    if (f.presets.size && !f.presets.has(presetOf(x))) return false;
    if (f.accountId && x.accountId !== f.accountId && x.toAccountId !== f.accountId) return false;
    if (f.currency && x.currency !== f.currency) return false;
    if (f.project && (f.project === NONE ? !!projectKey(x) : projectKey(x) !== f.project)) return false;
    if (f.category && (f.category === NONE ? !!x.category : x.category !== f.category)) return false;
    if (f.who && (x.counterparty ?? "") !== f.who) return false;
    if (f.min && x.amount < num(f.min)) return false;
    if (f.max && x.amount > num(f.max)) return false;
    if (f.todo && !needsWork(x)) return false;
    if (needle) {
      const hay = `${x.comment ?? ""} ${x.counterparty ?? ""} ${x.category ?? ""} ${projectName(x)} ${adName(x.adCampaignId) ?? ""} ${acc(x.accountId)?.name ?? ""} ${acc(x.toAccountId)?.name ?? ""} ${PRESET_META[presetOf(x)].label} ${x.amount} ${x.currency}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  // options of the filter panel — from what exists in the chosen period
  const projectOpts = new Map<string, string>();
  const catOpts = new Set<string>();
  const whoOpts = new Set<string>();
  for (const x of inPeriod) {
    const k = projectKey(x);
    if (k) projectOpts.set(k, projectName(x) || "—");
    if (x.category) catOpts.add(x.category);
    if (x.counterparty) whoOpts.add(x.counterparty);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "uk");

  // operations born from another one (6% tax, conversion, withdrawal) are shown right under it, linked
  const groups = (() => {
    const ids = new Set(rows.map((r) => r.id));
    const kids = new Map<string, TxRow[]>();
    for (const r of rows) if (r.parentId && ids.has(r.parentId)) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
    const order = (t: TxRow) => (t.category === CONV_CAT ? 0 : t.category === WD_CAT ? 1 : 2);
    return rows.filter((r) => !(r.parentId && ids.has(r.parentId))).map((r) => ({ x: r, kids: (kids.get(r.id) ?? []).sort((a, b) => order(a) - order(b)) }));
  })();
  const pager = usePager(groups, transfers ? "transfers" : "cashflow");
  const active = f.presets.size + [f.accountId, f.currency, f.project, f.category, f.who, f.min || f.max].filter(Boolean).length + (f.todo ? 1 : 0);
  const todoCount = transfers ? 0 : inPeriod.filter(needsWork).length;

  async function remove(x: TxRow): Promise<boolean> {
    const child = childOf.get(x.id);
    if (!(await ask(`Видалити операцію на ${fmtMoney(x.amount, x.currency)}?${child ? ` Разом з її податком ${fmtMoney(child.amount)}.` : ""} Якщо вона закривала платіж угоди — він знову стане неоплаченим.`))) return false;
    const res = await fetch(`/api/finance/transactions/${x.id}`, { method: "DELETE" });
    if (!res.ok) { toastError("Не вдалося видалити"); return false; }
    qc.invalidateQueries({ queryKey: TX_KEY });
    qc.invalidateQueries({ queryKey: SCHEDULE_KEY });
    return true;
  }

  const togglePreset = (k: TxPreset) => setF((x) => { const n = new Set(x.presets); if (n.has(k)) n.delete(k); else n.add(k); return { ...x, presets: n }; });
  const sel = "w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text)] cursor-pointer outline-none focus:border-[var(--accent)]";
  const lbl = "block text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1";
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // 13–14" laptops get tighter columns; big monitors (2xl) keep the roomy layout
  const cols = `grid ${picking
    ? "grid-cols-[22px_84px_86px_128px_minmax(140px,1fr)_minmax(170px,1.5fr)_minmax(150px,1.2fr)_24px_52px] 2xl:grid-cols-[22px_96px_96px_150px_minmax(180px,1fr)_minmax(220px,1.5fr)_minmax(200px,1.2fr)_24px_60px]"
    : "grid-cols-[84px_86px_128px_minmax(140px,1fr)_minmax(170px,1.5fr)_minmax(150px,1.2fr)_24px_52px] 2xl:grid-cols-[96px_96px_150px_minmax(180px,1fr)_minmax(220px,1.5fr)_minmax(200px,1.2fr)_24px_60px]"} items-center gap-x-3 2xl:gap-x-4`;
  const flip = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const visibleIds = pager.visible.flatMap(({ x, kids }) => [x.id, ...kids.map((k) => k.id)]);
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));
  async function removePicked() {
    const ids = [...picked];
    if (!ids.length) return;
    const sum = journal.filter((t) => picked.has(t.id)).reduce((s2, t) => s2 + t.amountUah, 0);
    if (!(await ask(`Видалити ${ids.length} операц${ids.length === 1 ? "ію" : ids.length < 5 ? "ії" : "ій"} на ${fmtMoney(sum)}? Разом з ними видаляться їхні податки, конвертації й виводи. Скасувати це не можна.`))) return;
    const res = await Promise.all(ids.map((id) => fetch(`/api/finance/transactions/${id}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false)));
    const failed = res.filter((ok) => !ok).length;
    if (failed) toastError(`Не вдалося видалити ${failed} з ${ids.length}`);
    else toast({ kind: "success", title: "Видалено", text: `${ids.length} операцій`, duration: 3000 });
    setPicked(new Set());
    setPicking(false);
    qc.invalidateQueries({ queryKey: TX_KEY });
    qc.invalidateQueries({ queryKey: SCHEDULE_KEY });
  }

  return (
    <div className="space-y-3">
      {/* period + new */}
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker value={period} onChange={setPeriod} startDay={startDay} full />
        <button onClick={() => setModal({})} title="Нова операція (N)"
          className="ml-auto hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 transition-[filter]" style={{ background: "var(--accent)" }}>
          <Plus size={15} /> {transfers ? "Переказ" : "Операція"} <kbd className="ml-1 px-1 rounded bg-black/15 text-[10px] font-mono">N</kbd>
        </button>
      </div>

      {/* view switch + search + filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex w-full md:w-auto p-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {([["cash", "Кешфлоу", Wallet], ["transfers", "Рух грошей", ArrowLeftRight]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => { if (mode !== k) { setMode(k); setF(EMPTY); setPicking(false); setPicked(new Set()); } }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 rounded-[10px] text-xs font-medium cursor-pointer transition-colors ${mode === k ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
              <I size={12} /> {l}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук: коментар, проєкт, кому, сума, рахунок…"
            className="w-full pl-8 pr-8 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-dim)] outline-none focus:border-[var(--accent)]" />
          {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Очистити"><X size={12} /></button>}
        </div>
        <button onClick={() => setPanel((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${panel || active ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
          <SlidersHorizontal size={12} /> Фільтри{active > 0 && <span className="px-1.5 rounded-full bg-[var(--accent)] text-black text-[10px] font-semibold">{active}</span>}
        </button>
        {todoCount > 0 && (
          <button onClick={() => set({ todo: !f.todo })} title="Оплати без проєкту, витрати без категорії, реклама без кампанії, доходи ФОП 3 групи без податку"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${f.todo ? "border-[#38bdf8] text-[#7dd3fc] bg-[#38bdf8]/10" : "border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
            <Sparkles size={11} /> Розібрати <span className="opacity-60 tabular-nums">{todoCount}</span>
          </button>
        )}
        {(active > 0 || q) && <button onClick={() => { setF(EMPTY); setQ(""); }} className="px-2 py-1.5 text-xs text-[var(--text-dim)] hover:text-[var(--text)] underline decoration-dotted cursor-pointer">скинути</button>}
        <button onClick={() => { setPicking((v) => !v); setPicked(new Set()); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${picking ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
          <ListChecks size={12} /> {picking ? "Готово" : "Вибрати"}
        </button>
        {picking && (
          <div className="flex items-center gap-1.5 pl-1">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">Вибрано <b className="text-[var(--text)]">{picked.size}</b></span>
            <button onClick={removePicked} disabled={!picked.size}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              <Trash2 size={12} /> Видалити вибрані
            </button>
          </div>
        )}
        <span className="ml-auto text-[11px] text-[var(--text-dim)] tabular-nums">{rows.length === inPeriod.length ? `${rows.length} операцій` : `${rows.length} з ${inPeriod.length}`}</span>
      </div>

      {/* phone: totals of what is shown */}
      {!txQ.isLoading && rows.length > 0 && <MobileSummary rows={rows} transfers={transfers} />}

      {panel && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-3">
          {!transfers && (
            <div>
              <span className={lbl}>Тип</span>
              <div className="flex flex-wrap gap-1.5">
                {TX_PRESETS.map((p) => {
                  const on = f.presets.has(p.key);
                  return (
                    <button key={p.key} onClick={() => togglePreset(p.key)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-colors"
                      style={on ? { borderColor: p.color, color: p.color, background: `${p.color}17` } : { borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />{p.short}
                      <span className="opacity-60 tabular-nums">{inPeriod.filter((x) => presetOf(x) === p.key).length}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
            <div><span className={lbl}>Рахунок</span>
              <Select variant="small" value={f.accountId} onChange={(v) => set({ accountId: v })}
                options={[{ value: "", label: "Усі рахунки" }, ...fin.accounts.map((a) => ({ value: a.id, label: a.name, group: a.group, sub: a.currency }))]} />
            </div>
            <div><span className={lbl}>Валюта</span>
              <Select variant="small" value={f.currency} onChange={(v) => set({ currency: v })}
                options={[{ value: "", label: "Усі" }, ...CURRENCIES.map((c) => ({ value: c, label: `${SYM[c]} ${c}` }))]} />
            </div>
            {!transfers && <div><span className={lbl}>Проєкт</span>
              <Select variant="small" value={f.project} onChange={(v) => set({ project: v })}
                options={[{ value: "", label: "Усі" }, { value: NONE, label: "— без проєкту —" }, ...[...projectOpts].sort((a, b) => byName(a[1], b[1])).map(([k, n]) => ({ value: k, label: n }))]} />
            </div>}
            {!transfers && <div><span className={lbl}>Категорія</span>
              <Select variant="small" value={f.category} onChange={(v) => set({ category: v })}
                options={[{ value: "", label: "Усі" }, { value: NONE, label: "— без категорії —" }, ...[...catOpts].sort(byName).map((c) => ({ value: c, label: c }))]} />
            </div>}
            {!transfers && <div><span className={lbl}>Куди / кому</span>
              <Select variant="small" value={f.who} onChange={(v) => set({ who: v })}
                options={[{ value: "", label: "Усі" }, ...[...whoOpts].sort(byName).map((c) => ({ value: c, label: c }))]} />
            </div>}
            <div><span className={lbl}>Сума</span>
              <div className="flex gap-1">
                <input value={f.min} onChange={(e) => set({ min: e.target.value })} inputMode="decimal" placeholder="від" className={`${sel} cursor-text`} />
                <input value={f.max} onChange={(e) => set({ max: e.target.value })} inputMode="decimal" placeholder="до" className={`${sel} cursor-text`} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* phone: operations by day, one tappable card each */}
      <div className="md:hidden">
        <MobileLedger groups={pager.visible} fin={fin} acc={acc} adName={adName} onOpenLead={onOpenLead}
          needsWork={needsWork} progress={progress} missingTax={missingTax} picking={picking} picked={picked}
          onTap={(t) => (picking ? flip(t.id) : setModal({ edit: t }))}
          onTax={(x) => setTaxFor({ id: x.id, amount: x.amount, currency: x.currency, rate: x.rate, accountId: x.accountId, date: x.date, period: txPeriod(x, startDay) })} />
        {txQ.isLoading && <div className="py-12 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
        {!txQ.isLoading && !rows.length && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] py-10 px-6 text-center text-sm text-[var(--text-muted)]">
            {inPeriod.length ? "Нічого не знайдено — зміни фільтри" : transfers ? "Переказів за цей період немає" : "За цей період операцій немає"}
            {!inPeriod.length && <button onClick={() => setModal({})} className="mt-3 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-black cursor-pointer" style={{ background: "var(--accent)" }}><Plus size={15} /> {transfers ? "Переказ" : "Операція"}</button>}
          </div>
        )}
        {!txQ.isLoading && rows.length > 0 && <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"><ListPager pager={pager} noun="операцій" /></div>}
        <div className="h-20" />
      </div>
      {/* phone: the main action under the thumb */}
      <button onClick={() => setModal({})} aria-label={transfers ? "Новий переказ" : "Нова операція"}
        className="md:hidden fixed z-30 right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] w-14 h-14 rounded-2xl flex items-center justify-center text-black cursor-pointer active:scale-95 transition-transform"
        style={{ background: "var(--accent)", boxShadow: "0 12px 32px -8px rgba(201,140,10,0.6), 0 0 0 1px rgba(255,255,255,0.08) inset" }}>
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ledger */}
      <div className="hidden md:block rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[940px] 2xl:min-w-[1120px] px-2 pb-2">
            <div className={`${cols} px-3 py-3 text-[10px] uppercase tracking-wider text-[var(--text-dim)]`}>
              {picking && <Check3 on={allPicked} onClick={() => setPicked(allPicked ? new Set() : new Set(visibleIds))} title="Вибрати всі на сторінці" />}
              <span>Дата</span><span>Тип</span><span>Сума</span><span>Рахунок</span><span>Проєкт / категорія</span><span>Куди / кому</span><span /><span />
            </div>
            {pager.visible.map(({ x, kids }) => {
              const row = (t: TxRow, child: boolean, last: boolean) => (
                <Row key={t.id} x={t} fin={fin} cols={cols} acc={acc} adName={adName} roleOf={roleOf} onOpenLead={onOpenLead}
                  child={child} last={last} needsWork={needsWork(t)} progress={progress(t)}
                  picking={picking} picked={picked.has(t.id)}
                  onEdit={() => (picking ? flip(t.id) : setModal({ edit: t }))} onCopy={() => setModal({ copy: t })} onRemove={() => remove(t)} />
              );
              const ghost = missingTax(x);
              return (
                <div key={x.id} className={kids.length || ghost ? "my-1 rounded-xl bg-white/[0.015] ring-1 ring-white/[0.04]" : ""}>
                  {row(x, false, false)}
                  {kids.map((k, i) => row(k, true, i === kids.length - 1 && !ghost))}
                  {ghost && (
                    <div className={`${cols} px-3 py-1.5`}>
                      {picking && <span />}
                      <Connector last />
                      <button onClick={() => setTaxFor({ id: x.id, amount: x.amount, currency: x.currency, rate: x.rate, accountId: x.accountId, date: x.date, period: txPeriod(x, startDay) })}
                        className="col-span-3 flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-lg border border-dashed border-amber-400/50 text-[11px] text-amber-300 hover:bg-amber-400/10 cursor-pointer">
                        <Plus size={11} /> додати податок 6% до цієї оплати
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {!txQ.isLoading && <ListPager pager={pager} noun="операцій" />}
        {txQ.isLoading && <div className="py-12 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
        {!txQ.isLoading && !rows.length && (
          <div className="pb-14 pt-6 text-center text-sm text-[var(--text-muted)]">
            {inPeriod.length ? "Нічого не знайдено — зміни фільтри" : transfers ? "Переказів за цей період немає — натисни «Переказ» (N)" : "За цей період операцій немає — натисни «Операція» (N)"}
          </div>
        )}
      </div>

      <TxModal open={!!modal} edit={modal?.edit ?? null} copy={modal?.copy ?? null} onClose={() => setModal(null)}
        onCopy={modal?.edit ? () => setModal({ copy: modal.edit }) : undefined}
        onRemove={modal?.edit ? async () => { if (await remove(modal.edit!)) setModal(null); } : undefined}
        kinds={transfers ? ["transfer"] : undefined} preset={transfers ? { kind: "transfer" } : undefined} />
      {taxFor && <TaxModal income={taxFor} onClose={() => setTaxFor(null)} />}
    </div>
  );
}

// account: its icon (native colour by kind) + short name
function AccPill({ a }: { a: FinanceSettings["accounts"][number] }) {
  return (
    <span title={a.name} className="inline-flex items-center gap-2 max-w-full text-[13px] text-[var(--text-muted)]">
      <AccountIcon a={a} size={24} />
      <span className="truncate">{accountShort(a)}</span>
    </span>
  );
}

function Check3({ on, onClick, title }: { on: boolean; onClick?: () => void; title?: string }) {
  return (
    <span onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} title={title}
      className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors ${onClick ? "cursor-pointer" : ""} ${on ? "bg-[var(--accent)] border-[var(--accent)] text-black" : "border-white/25"}`}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  );
}

// tree line in the date column of a linked operation
function Connector({ last }: { last?: boolean }) {
  return (
    <span className="relative h-full min-h-[28px] flex items-center pl-3">
      <span className={`absolute left-3 top-0 w-px bg-white/[0.12] ${last ? "h-1/2" : "h-full"}`} />
      <span className="absolute left-3 top-1/2 w-3 h-px bg-white/[0.12]" />
      <Link2 size={11} className="ml-5 text-[var(--text-dim)]" />
    </span>
  );
}

// icon square + text — one style for project / category / where-to cells
function Tile({ icon: I, color, text, sub, onClick, dashed }: { icon: LucideIcon; color: string; text: React.ReactNode; sub?: string; onClick?: (e: React.MouseEvent) => void; dashed?: boolean }) {
  const body = (
    <>
      <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${dashed ? "border border-dashed" : ""}`}
        style={{ background: dashed ? "transparent" : `${color}1a`, color, borderColor: dashed ? `${color}80` : undefined }}><I size={13} /></span>
      <span className="min-w-0 truncate">{text}</span>
      {sub && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[var(--text-dim)]">{sub}</span>}
    </>
  );
  return onClick
    ? <button onClick={onClick} className="min-w-0 max-w-full flex items-center gap-2.5 text-sm text-left text-[var(--text)] hover:text-[var(--accent)] cursor-pointer">{body}</button>
    : <span className="min-w-0 max-w-full flex items-center gap-2.5 text-sm text-[var(--text)]">{body}</span>;
}

function Row({ x, fin, cols, acc, adName, roleOf, onOpenLead, onEdit, onCopy, onRemove, needsWork, progress, child, last, picking, picked }: {
  x: TxRow; fin: FinanceSettings; cols: string;
  acc: (id: string | null) => FinanceSettings["accounts"][number] | undefined;
  adName: (id: string | null | undefined) => string | undefined; roleOf: (name: string) => string | null;
  onOpenLead: (id: string) => void; onEdit: () => void; onCopy: () => void; onRemove: () => void;
  needsWork: boolean; progress: number | null; child?: boolean; last?: boolean; picking?: boolean; picked?: boolean;
}) {
  const p = PRESET_META[presetOf(x)];
  const type = TYPE[p.group];
  const sign = p.group === "in" ? "+" : p.group === "out" ? "−" : "";
  const from = acc(x.accountId);
  const to = acc(x.toAccountId);
  const dim = <span className="text-[var(--text-dim)]">—</span>;
  const todo = (t: string) => <Tile icon={Tag} color={needsWork ? "#7dd3fc" : "#71717a"} dashed text={<span className={needsWork ? "text-[#7dd3fc]" : "text-[var(--text-dim)]"}>{t}</span>} />;

  // project / category
  const projName = x.lead ? projectTitle(x.lead, x.project?.name) : x.project?.name ?? null;
  const projTile = projName ? (
    <Tile icon={Briefcase} color="#C98C0A" text={projName} sub={progress !== null ? `${Math.round(progress * 100)}%` : undefined}
      onClick={x.lead ? (e) => { e.stopPropagation(); onOpenLead(x.lead!.id); } : undefined} />
  ) : null;
  const what = (() => {
    switch (p.key) {
      case "income": return projTile ?? todo("без проєкту");
      case "acquiring": return <Tile icon={CreditCard} color="#4ade80" text="Еквайринг" />;
      case "contractor": return projTile ?? <Tile icon={UserRound} color="#ef4444" text={<span className="text-[var(--text-muted)]">Підряд · без проєкту</span>} />;
      case "expense": return x.category ? <Tile icon={Building2} color="#f97316" text={x.category} /> : projTile ?? todo("без категорії");
      case "ads": return x.adCampaignId ? <Tile icon={Megaphone} color="#ec4899" text={adName(x.adCampaignId) ?? "Кампанія"} /> : todo("без кампанії");
      case "tax": return <Tile icon={Landmark} color="#eab308" text={x.category ?? "Податок"} />;
      case "owner": return <Tile icon={Crown} color="#a855f7" text={`Дивіденди · ${periodLabel(txPeriod(x, fin.monthStartDay)).toLowerCase()}`} />;
      default: return x.category ? <Tile icon={x.category === CONV_CAT ? Repeat : ArrowRight} color="#38bdf8" text={x.category} /> : dim;
    }
  })();

  // where / who
  const whoName = x.counterparty;
  const who = p.key === "transfer"
    ? (to ? <span className="flex items-center gap-1.5 min-w-0"><ArrowRight size={13} className="shrink-0 text-[#38bdf8]" /><AccPill a={to} /></span> : dim)
    : p.key === "tax" ? <Tile icon={Landmark} color="#eab308" text="ДПС" />
    : whoName && (p.key === "contractor" || p.key === "owner") ? (
      <span className="min-w-0 flex items-center gap-2.5 text-sm text-[var(--text)]">
        <Avatar name={whoName} size={28} /><span className="truncate">{whoName}</span>
        {p.key === "contractor" && roleOf(whoName) && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[var(--text-dim)]">{roleOf(whoName)}</span>}
      </span>
    )
    : whoName ? <Tile icon={p.key === "ads" ? Megaphone : UserRound} color="#a1a1aa" text={whoName} />
    : dim;

  return (
    <div onClick={onEdit} className={`group ${cols} px-3 ${child ? "py-1.5" : "py-2.5"} rounded-xl cursor-pointer transition-colors ${picked ? "bg-[var(--accent)]/[0.08] ring-1 ring-[var(--accent)]/30" : "hover:bg-white/[0.035]"}`}>
      {picking && <Check3 on={!!picked} />}
      {child ? <Connector last={last} /> : (
        <span className="text-sm font-medium tabular-nums text-[var(--text)]">{format(new Date(x.date), "dd-MM-yyyy")}</span>
      )}
      <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ color: type.color, background: `${type.color}1a` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: type.color }} />{type.label}
      </span>
      <span className="tabular-nums whitespace-nowrap">
        <span className={`${child ? "text-sm" : "text-[15px]"} font-semibold`} style={{ color: p.group === "in" ? "#4ade80" : p.group === "move" ? "#7dd3fc" : "var(--text)" }}>
          {sign}{x.amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 }).replace(/ /g, " ")}
        </span>
        <span className="ml-1.5 text-[13px] font-medium text-[var(--text-muted)]">{SYM[x.currency] ?? x.currency}</span>
      </span>
      <div className="min-w-0">{from ? <AccPill a={from} /> : dim}</div>
      <div className="min-w-0">{what}</div>
      <div className="min-w-0">{who}</div>
      <span className="flex justify-center">
        {x.comment && <span title={x.comment} className="w-6 h-6 rounded-md flex items-center justify-center bg-[#facc15]/10 text-[#facc15]"><MessageSquareText size={13} /></span>}
      </span>
      <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!child && <button onClick={(e) => { e.stopPropagation(); onCopy(); }} title="Повторити — така сама операція сьогодні"
          className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06] cursor-pointer"><Copy size={13} /></button>}
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Видалити"
          className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ── phone view ──

const PRESET_ICON: Record<TxPreset, LucideIcon> = {
  income: Briefcase, acquiring: CreditCard, contractor: UserRound, expense: Building2, ads: Megaphone, tax: Landmark, owner: Crown, transfer: ArrowLeftRight,
};
const money = (v: number) => Math.round(v).toLocaleString("uk-UA").replace(/\u00a0/g, " ");
const signedUah = (t: TxRow) => { const g = PRESET_META[presetOf(t)].group; return g === "in" ? t.amountUah : g === "out" ? -t.amountUah : 0; };

// «Надійшло · Витрачено · Результат» of what the list shows (hryvnia at the operation rate)
function MobileSummary({ rows, transfers }: { rows: TxRow[]; transfers: boolean }) {
  if (transfers) {
    const sum = rows.reduce((s, t) => s + t.amountUah, 0);
    return (
      <div className="md:hidden flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <span className="text-xs text-[var(--text-muted)]">{rows.length} переказів</span>
        <span className="text-base font-bold tabular-nums text-[#7dd3fc]">{money(sum)} ₴</span>
      </div>
    );
  }
  let inc = 0, out = 0;
  for (const t of rows) { const v = signedUah(t); if (v > 0) inc += v; else out -= v; }
  const net = inc - out;
  const cell = (label: string, v: string, color: string) => (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums truncate" style={{ color }}>{v}</div>
    </div>
  );
  return (
    <div className="md:hidden grid grid-cols-3 divide-x divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {cell("Надійшло", `+${money(inc)}`, "#4ade80")}
      {cell("Витрачено", `−${money(out)}`, "#fb923c")}
      {cell("Результат", `${net < 0 ? "−" : "+"}${money(Math.abs(net))} ₴`, net < 0 ? "#f87171" : "var(--accent)")}
    </div>
  );
}

type Acc = (id: string | null) => FinanceSettings["accounts"][number] | undefined;

function MobileLedger({ groups, fin, acc, adName, onOpenLead, needsWork, progress, missingTax, picking, picked, onTap, onTax }: {
  groups: { x: TxRow; kids: TxRow[] }[]; fin: FinanceSettings; acc: Acc; adName: (id: string | null | undefined) => string | undefined;
  onOpenLead: (id: string) => void; needsWork: (x: TxRow) => boolean; progress: (x: TxRow) => number | null; missingTax: (x: TxRow) => boolean;
  picking: boolean; picked: Set<string>; onTap: (t: TxRow) => void; onTax: (x: TxRow) => void;
}) {
  // consecutive operations of one day → one block
  const days: { day: string; items: { x: TxRow; kids: TxRow[] }[] }[] = [];
  for (const g of groups) {
    const day = localDate(new Date(g.x.date));
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(g); else days.push({ day, items: [g] });
  }
  const now = new Date();
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
  return (
    <div className="space-y-3">
      {days.map(({ day, items }) => {
        const d = new Date(`${day}T12:00`);
        const name = day === today ? "Сьогодні" : day === yesterday ? "Вчора" : d.toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "long" });
        const net = items.reduce((s, g) => s + signedUah(g.x) + g.kids.reduce((k, t) => k + signedUah(t), 0), 0);
        return (
          <section key={day}>
            <div className="sticky top-0 z-10 -mx-3 px-4 py-1.5 flex items-baseline justify-between bg-[var(--background)]/85 backdrop-blur-md">
              <span className="text-xs font-semibold text-[var(--text-muted)] first-letter:uppercase">{name}{day !== today && day !== yesterday ? "" : <span className="ml-1.5 font-normal text-[var(--text-dim)]">{d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}</span>}</span>
              {net !== 0 && <span className={`text-[11px] font-semibold tabular-nums ${net > 0 ? "text-[#4ade80]/80" : "text-[var(--text-dim)]"}`}>{net > 0 ? "+" : "−"}{money(Math.abs(net))} ₴</span>}
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-white/[0.04] overflow-hidden">
              {items.map(({ x, kids }) => (
                <div key={x.id}>
                  <MRow x={x} fin={fin} acc={acc} adName={adName} onOpenLead={onOpenLead} todo={needsWork(x)} progress={progress(x)}
                    picking={picking} picked={picked.has(x.id)} onTap={() => onTap(x)} />
                  {kids.map((k) => (
                    <MRow key={k.id} x={k} fin={fin} acc={acc} adName={adName} onOpenLead={onOpenLead} todo={needsWork(k)} progress={null}
                      picking={picking} picked={picked.has(k.id)} onTap={() => onTap(k)} child />
                  ))}
                  {missingTax(x) && (
                    <div className="pl-[58px] pr-3 pb-2.5 -mt-1">
                      <button onClick={() => onTax(x)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-amber-400/50 text-[11px] text-amber-300 active:bg-amber-400/10 cursor-pointer">
                        <Plus size={11} /> податок 6% до цієї оплати
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MRow({ x, fin, acc, adName, onOpenLead, todo, progress, picking, picked, onTap, child }: {
  x: TxRow; fin: FinanceSettings; acc: Acc; adName: (id: string | null | undefined) => string | undefined; onOpenLead: (id: string) => void;
  todo: boolean; progress: number | null; picking: boolean; picked: boolean; onTap: () => void; child?: boolean;
}) {
  const pk = presetOf(x);
  const p = PRESET_META[pk];
  const Icon = x.category === CONV_CAT ? Repeat : PRESET_ICON[pk];
  const from = acc(x.accountId);
  const to = acc(x.toAccountId);
  const proj = x.lead ? projectTitle(x.lead, x.project?.name) : x.project?.name ?? null;
  const who = x.counterparty;

  // what it is (title) and the second line
  let title: React.ReactNode;
  const sub: string[] = [];
  switch (pk) {
    case "income": title = proj ?? <span className="text-[#7dd3fc]">Оплата без проєкту</span>; break;
    case "acquiring": title = "Еквайринг"; break;
    case "contractor": title = who || proj || "Підряд"; if (who && proj) sub.push(proj); break;
    case "expense": title = x.category ?? proj ?? <span className="text-[#7dd3fc]">Витрата без категорії</span>; if (x.category && proj) sub.push(proj); if (who) sub.push(who); break;
    case "ads": title = adName(x.adCampaignId) ?? <span className="text-[#7dd3fc]">Реклама без кампанії</span>; if (who) sub.push(who); break;
    case "tax": title = x.category ?? "Податок"; break;
    case "owner": title = `Дивіденди${who ? ` · ${who}` : ""}`; sub.push(periodLabel(txPeriod(x, fin.monthStartDay)).toLowerCase()); break;
    default: title = x.category ?? (to ? <>{from ? accountShort(from) : "—"} <ArrowRight size={12} className="inline -mt-0.5 text-[#38bdf8]" /> {accountShort(to)}</> : "Переказ");
  }
  const accText = pk === "transfer" ? (x.category && from && to ? `${accountShort(from)} → ${accountShort(to)}` : "") : from ? accountShort(from) : "";
  const color = p.group === "in" ? "#4ade80" : p.group === "move" ? "#7dd3fc" : "var(--text)";
  const sign = p.group === "in" ? "+" : p.group === "out" ? "−" : "";

  return (
    <div onClick={onTap} role="button"
      className={`flex items-center gap-3 ${child ? "pl-6 pr-3 py-2" : "px-3 py-3"} cursor-pointer transition-colors active:bg-white/[0.05] ${picked ? "bg-[var(--accent)]/[0.08]" : ""}`}>
      {picking ? (
        <span className={`shrink-0 ${child ? "w-7" : "w-9"} flex justify-center`}><Check3 on={picked} /></span>
      ) : child ? (
        <span className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-[var(--text-dim)]"><Link2 size={13} /></span>
      ) : (
        <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${p.color}1f`, color: p.color }}><Icon size={16} /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className={`${child ? "text-[13px] text-[var(--text-muted)]" : "text-[14px] text-[var(--text)] font-medium"} leading-snug line-clamp-2 break-words`}>
          {pk === "income" && x.lead && !child
            ? <span onClick={(e) => { e.stopPropagation(); onOpenLead(x.lead!.id); }} className="underline decoration-white/15 underline-offset-2">{title}</span>
            : title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[11px] text-[var(--text-dim)]">
          {from && !child && pk !== "transfer" && <AccountIcon a={from} size={14} />}
          <span className="truncate">{[...sub, accText].filter(Boolean).join(" · ")}</span>
          {x.comment && <MessageSquareText size={11} className="shrink-0 text-[#facc15]/80" />}
        </div>
        {x.comment && !child && <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{x.comment}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className={`${child ? "text-[13px]" : "text-[15px]"} font-semibold tabular-nums whitespace-nowrap`} style={{ color }}>
          {sign}{x.amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 }).replace(/\u00a0/g, " ")}<span className="ml-1 text-[11px] font-medium text-[var(--text-muted)]">{SYM[x.currency] ?? x.currency}</span>
        </div>
        {todo ? <div className="mt-0.5 text-[10px] text-[#7dd3fc]">розібрати</div>
          : progress !== null ? <div className="mt-0.5 text-[10px] tabular-nums text-[var(--text-dim)]">оплачено {Math.round(progress * 100)}%</div>
          : !child ? <div className="mt-0.5 text-[10px]" style={{ color: `${p.color}cc` }}>{p.short}</div> : null}
      </div>
    </div>
  );
}

// «Поділити прибуток»: the month's net profit → dividends to the owners (equal shares by default).
export function DividendModal({ period, amount, onClose }: { period: string; amount: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { fin } = useFinance();
  const owners = fin.owners.length ? fin.owners : ["Власник"];
  const each = Math.floor(amount / owners.length);
  const [parts, setParts] = useState<string[]>(() => owners.map(() => String(each)));
  const live = fin.accounts.filter((a) => !a.archived && a.currency === "UAH");
  const [accountId, setAccountId] = useState(live[0]?.id ?? "");
  // split day = the 10th that closes the month (or today if it hasn't come yet)
  const [date, setDate] = useState(() => {
    const closeDay = periodRange(period, fin.monthStartDay).to;
    return localDate(closeDay > new Date() ? new Date() : closeDay);
  });
  const [busy, setBusy] = useState(false);
  const sum = parts.reduce((s, v) => s + (Number(v.replace(/\s/g, "").replace(",", ".")) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return toastError("Вибери рахунок");
    setBusy(true);
    try {
      for (const [i, who] of owners.entries()) {
        const v = Number(parts[i].replace(/\s/g, "").replace(",", ".")) || 0;
        if (v <= 0) continue;
        const res = await fetch("/api/finance/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "owner", amount: v, currency: "UAH", accountId, counterparty: who, period, comment: `Дивіденди за ${periodLabel(period).toLowerCase()}`, date: new Date(`${date}T12:00`).toISOString() }),
        });
        if (!res.ok) { toastError((await res.json().catch(() => ({}))).error ?? `Не вдалося записати для ${who}`); break; }
      }
      qc.invalidateQueries({ queryKey: TX_KEY });
      toast({ kind: "success", title: "Прибуток поділено", text: `${fmtMoney(sum)} · ${periodLabel(period)}`, duration: 4000 });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)]";
  return (
    <Modal open onClose={onClose} title={`Поділити прибуток · ${periodLabel(period)}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-[#C98C0A]/30 bg-[#C98C0A]/[0.07] px-3 py-2.5">
          <div className="text-[11px] text-[var(--text-muted)]">До поділу (чистий прибуток − уже виплачені дивіденди)</div>
          <div className="text-xl font-bold tabular-nums text-[#C98C0A]">{fmtMoney(amount)}</div>
        </div>
        <div className="space-y-2">
          {owners.map((o, i) => (
            <div key={o} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-[var(--text)] truncate">{o}</span>
              <input value={parts[i]} inputMode="decimal" onChange={(e) => setParts(parts.map((p, j) => (j === i ? groupNum(e.target.value) : p)))}
                className="w-36 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-right tabular-nums text-[#c084fc] outline-none focus:border-[#a855f7]" />
            </div>
          ))}
          <div className={`text-[11px] text-right tabular-nums ${Math.round(sum) > Math.round(amount) ? "text-amber-400" : "text-[var(--text-dim)]"}`}>
            Разом {fmtMoney(sum)}{Math.round(sum) !== Math.round(amount) ? ` із ${fmtMoney(amount)}` : ""}
            <button type="button" onClick={() => setParts(owners.map(() => String(each)))} className="ml-2 underline decoration-dotted cursor-pointer hover:text-[var(--text-muted)]">порівну</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">З рахунку</label>
            <Select value={accountId} onChange={setAccountId} accent="#C98C0A" options={live.map((a) => ({ value: a.id, label: a.name, group: a.group }))} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} style={{ colorScheme: "dark" }} />
          </div>
        </div>
        <div className="text-[11px] text-[var(--text-dim)]">Запишеться як «Дивіденди» за {periodLabel(period).toLowerCase()} — окремою операцією на кожного власника.</div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button type="submit" disabled={busy || sum <= 0} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer disabled:opacity-50 hover:brightness-110" style={{ background: "#C98C0A" }}>
            {busy ? "Записую…" : `Виплатити ${fmtMoney(sum)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Kpi({ label, value, color, negative, big, sub, hint, currency = "UAH" }: { label: string; value: number; color: string; negative?: boolean; big?: boolean; sub?: string; hint?: string; currency?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 ${big ? "col-span-2 lg:col-span-1" : ""}`} title={hint}>
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none" style={{ background: color }} />
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: big ? color : "var(--text)" }}>
        {negative && value > 0 ? "−" : ""}{fmtMoney(value, currency)}
      </div>
      {sub && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{sub}</div>}
    </div>
  );
}
