"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Briefcase, Building2, Check, ChevronDown, ChevronLeft, CreditCard, Crown,
  Copy, Landmark, Link2, Megaphone, Repeat, Search, Trash2, UserRound, X, type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { toast, toastError } from "@/components/ui/toast";
import {
  ADS_CAT, CONV_CAT, CURRENCIES, WD_CAT, kindOf, projectTitle, PRESET_META, TAX6_CAT, TAX_CATS, fmtMoney, periodForNew, periodLabel, periodOf, presetOf, shiftPeriod,
  type TxKind, type TxPreset,
} from "@/lib/finance";
import { leadDisplayName } from "@/lib/leadOptions";
import { localDate } from "@/components/tasks/taskUtils";
import { Avatar } from "@/components/finance/Person";
import Select, { type SelectOption } from "@/components/finance/Select";
import {
  useAdCampaigns, useDeals, useFinance, useProjects, useRecurring, useTransactions,
  DEALS_KEY, FIN_KEY, PROJECTS_KEY, SCHEDULE_KEY, TX_KEY, type TxRow,
} from "@/components/finance/useFinance";
import { useFx } from "@/lib/useFx";
import { groupNum, numText } from "@/lib/numInput";

export interface TxLead { id: string; number: number; name: string; projectName?: string | null; phone?: string | null; currency?: string | null }
export interface TxStage { id: string; idx: number; amount: number; title?: string | null; paidAt: string | null }
// what an operation is booked on: a finance project (client) and/or a deal
export interface TxTarget { projectId: string | null; lead: TxLead | null; name: string }

type Group = "in" | "out" | "move";
const PROJECT_KINDS = new Set<TxKind>(["income", "contractor", "expense"]);
const GROUPS: { key: Group; label: string; icon: LucideIcon; color: string }[] = [
  { key: "in", label: "Дохід", icon: ArrowDownLeft, color: "#22c55e" },
  { key: "out", label: "Витрата", icon: ArrowUpRight, color: "#f97316" },
  { key: "move", label: "Переказ", icon: ArrowLeftRight, color: "#38bdf8" },
];
// subtypes of every group, with an icon and a one-line hint
const SUBTYPES: Record<Group, { key: TxPreset; label: string; icon: LucideIcon; hint: string }[]> = {
  in: [
    { key: "income", label: "Оплата проєкту", icon: Briefcase, hint: "Клієнт заплатив за проєкт" },
    { key: "acquiring", label: "Еквайринг", icon: CreditCard, hint: "Надходження через еквайринг" },
  ],
  out: [
    { key: "contractor", label: "Підряд", icon: UserRound, hint: "Оплата підряднику / співробітнику" },
    { key: "expense", label: "Бізнес", icon: Building2, hint: "Сервіси, офіс, зв'язок…" },
    { key: "ads", label: "Реклама", icon: Megaphone, hint: "Бюджет на рекламну кампанію" },
    { key: "tax", label: "Податок", icon: Landmark, hint: "ЄСВ, єдиний, військовий, 6%" },
    { key: "owner", label: "Дивіденди", icon: Crown, hint: "Виплата власнику" },
  ],
  move: [{ key: "transfer", label: "Між рахунками", icon: ArrowLeftRight, hint: "На прибуток не впливає" }],
};
const groupOf = (p: TxPreset): Group => PRESET_META[p].group;
const subOf = (p: TxPreset) => SUBTYPES[groupOf(p)].find((s) => s.key === p)!;
const num = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));

// «Нова операція»: Дохід / Витрата / Переказ → subtype → date · amount · currency · account in one line →
// the fields of that subtype. An income to a ФОП 3 групи carries its linked 6% tax right in the form.
export default function TxModal({
  open,
  onClose,
  edit,
  copy,
  kinds: allowedKinds,
  lead: fixedLead,
  stages = [],
  preset,
  onSaved,
  onCopy,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  edit?: TxRow | null;
  copy?: TxRow | null;        // «Повторити»: same operation, today, new record
  kinds?: TxKind[];           // which types this form offers («Рух грошей» — only transfers)
  lead?: TxLead | null;        // card of a deal → deal is fixed
  stages?: TxStage[];
  preset?: { kind?: TxKind; amount?: number; currency?: string; stageId?: string; comment?: string };
  onSaved?: () => void;
  onCopy?: () => void;     // phone: «Повторити» / «Видалити» of the edited operation (the table has hover buttons)
  onRemove?: () => void;
}) {
  const qc = useQueryClient();
  const { fin } = useFinance();
  const { fx } = useFx();
  const accounts = fin.accounts.filter((a) => !a.archived || a.id === edit?.accountId);
  const journal = useTransactions(undefined, open).data ?? [];
  // operations born from this one: its 6% tax, the conversion to hryvnia, the withdrawal to the company card
  const kids = edit ? journal.filter((t) => t.parentId === edit.id) : [];
  const child = kids.find((t) => t.kind === "tax");
  const convChild = kids.find((t) => t.kind === "transfer" && t.category === CONV_CAT);
  const wdChild = kids.find((t) => t.kind === "transfer" && t.category === WD_CAT);

  const [pre, setPre] = useState<TxPreset>("income");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [date, setDate] = useState(localDate(new Date()));
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [target, setTarget] = useState<TxTarget | null>(null);
  const [stageId, setStageId] = useState("");
  const [who, setWho] = useState("");
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState("");
  const [adCampaignId, setAdCampaignId] = useState("");
  const [rate, setRate] = useState("");
  const [uahEdit, setUahEdit] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [tax, setTax] = useState<string | null>(null);   // null = automatic
  const [taxAcc, setTaxAcc] = useState("");
  const [convOn, setConvOn] = useState<boolean | null>(null);   // null = default (on for a new income)
  const [convRate, setConvRate] = useState<string | null>(null);
  const [wdOn, setWdOn] = useState<boolean | null>(null);
  const [wdTo, setWdTo] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  // fill the form each time it opens
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form on open */
    setPicking(false);
    setTax(null);
    setTaxAcc("");
    setConvOn(null);
    setConvRate(null);
    setWdOn(null);
    setWdTo("");
    const src = edit ?? copy;
    if (src) {
      setPre(presetOf(src));
      setAmount(numText(src.amount));
      setCurrency(src.currency);
      setDate(localDate(edit ? new Date(src.date) : new Date()));
      setAccountId(src.accountId);
      setToAccountId(src.toAccountId ?? "");
      setTarget(src.lead ? { projectId: src.project?.id ?? null, lead: src.lead, name: projectTitle(src.lead, src.project?.name) } : src.project ? { projectId: src.project.id, lead: null, name: src.project.name } : null);
      setStageId(edit ? src.stageId ?? "" : "");
      setWho(src.counterparty ?? "");
      setComment(src.comment ?? "");
      setCategory(src.category ?? "");
      setAdCampaignId(src.adCampaignId ?? "");
      setRate(src.currency === "UAH" ? "" : String(src.rate));
      setPeriod(edit ? src.period ?? "" : "");
    } else {
      const p: TxPreset = preset?.kind ? presetOf({ kind: preset.kind }) : allowedKinds?.length === 1 ? presetOf({ kind: allowedKinds[0] }) : "income";
      const first = accounts.find((a) => a.id === lastAccount(p)) ?? accounts.find((a) => a.currency === (preset?.currency ?? fixedLead?.currency ?? "UAH")) ?? accounts[0];
      setPre(p);
      setAmount(preset?.amount ? String(preset.amount) : "");
      setCurrency(first?.currency ?? preset?.currency ?? "UAH");
      setDate(localDate(new Date()));
      setAccountId(first?.id ?? "");
      setToAccountId("");
      setTarget(fixedLead ? { projectId: null, lead: fixedLead, name: projectTitle(fixedLead) } : null);
      setStageId(preset?.stageId ?? "");
      setWho("");
      setComment(preset?.comment ?? "");
      setCategory(PRESET_META[p].category ?? "");
      setAdCampaignId("");
      setRate("");
      setPeriod("");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opened
  }, [open]);

  const meta = PRESET_META[pre];
  const kind = meta.kind;
  const group = groupOf(pre);

  function pickPreset(p: TxPreset) {
    if (p === pre) return;
    const k = PRESET_META[p].kind;
    setPre(p);
    setCategory(PRESET_META[p].category ?? "");
    if (k !== kind) setWho("");
    if (!PROJECT_KINDS.has(k)) setTarget(fixedLead ? target : null);
    if (edit) return;
    const a = accounts.find((x) => x.id === lastAccount(p));
    if (a) { setAccountId(a.id); setCurrency(a.currency); }
  }
  const pickGroup = (g: Group) => { if (g !== group) pickPreset(SUBTYPES[g][0].key); };

  // which groups / subtypes this form offers
  const allowed = (p: TxPreset) => {
    if (fixedLead) return p === "income" || p === "contractor" || p === "expense";
    return !allowedKinds || allowedKinds.includes(PRESET_META[p].kind) || (!!edit && presetOf(edit) === p);
  };
  const groups = GROUPS.filter((g) => SUBTYPES[g.key].some((s) => allowed(s.key)));
  const subs = SUBTYPES[group].filter((s) => allowed(s.key));

  const account = accounts.find((a) => a.id === accountId);
  const n = num(amount);
  const autoRate = currency === "UAH" ? 1 : currency === "EUR" ? fx.eurUah : fx.usdUah;
  const r = currency === "UAH" ? 1 : num(rate) || autoRate;
  const uah = Number.isFinite(n) ? n * r : 0;
  const unpaid = stages.filter((s) => !s.paidAt || s.id === edit?.stageId);

  // the 10th: before the dividend split → old month, after it → new month
  const dateObj = new Date(`${date}T12:00`);
  const onBoundary = dateObj.getDate() === fin.monthStartDay;
  const sameDay = edit && localDate(new Date(edit.date)) === date && edit.kind === kind;
  const auto = sameDay && edit?.autoPeriod ? { period: edit.autoPeriod, boundary: onBoundary, split: false } : periodForNew(journal.filter((t) => t.id !== edit?.id), kind, dateObj, fin.monthStartDay);
  const autoPeriod = auto.period;
  const newP = periodOf(dateObj, fin.monthStartDay);
  const oldP = shiftPeriod(newP, -1);
  const txP = period || autoPeriod;
  const splitToday = journal.some((t) => t.kind === "owner" && t.id !== edit?.id && localDate(new Date(t.date)) === date);

  // linked 6% tax: income to a ФОП 3 групи (from the month taxes are real operations)
  const withTax = kind === "income" && !!account?.tax6 && txP >= fin.taxRealFrom;
  const foreign = currency !== "UAH";
  const tax6 = Math.round(uah * 6) / 100;
  const taxValue = tax ?? (child ? String(child.amount) : !foreign && n > 0 ? String(tax6) : "");
  const taxN = num(taxValue) || 0;
  // EUR / USD income to a ФОП: the three accounts of a ФОП are one — the money is converted to its UAH account
  // at the bank rate, then withdrawn to the company card, and the tax is paid after this double conversion.
  const fopUah = kind === "income" && foreign && account
    ? accounts.find((a) => a.group === account.group && a.currency === "UAH" && !a.archived) : undefined;
  const chain = !!fopUah;
  const conv = convOn ?? (edit ? !!convChild : true);
  const convRateStr = convRate ?? (convChild ? String(convChild.rate) : "");
  const convR = num(convRateStr) || 0;
  const converted = Math.round(n * convR * 100) / 100;
  const wd = conv && (wdOn ?? (edit ? !!wdChild : true));
  // withdraw to «Гроші компанії» of the same person (by a word of the ФОП name), else the first company account
  const ownerWords = (account?.group.replace(/^ФОП\s*/i, "") ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const companyCards = accounts.filter((a) => a.currency === "UAH" && !a.offBooks && kindOf(a) !== "fop" && a.id !== fopUah?.id)
    .sort((a, b) => Number(kindOf(b) === "company") - Number(kindOf(a) === "company"));
  const defaultCard = companyCards.find((a) => kindOf(a) === "company" && ownerWords.some((w) => a.name.toLowerCase().includes(w))) ?? companyCards[0];
  const wdToId = wdTo || wdChild?.toAccountId || lastWithdraw() || defaultCard?.id || "";
  const taxPayFrom = taxAcc || child?.accountId || (chain ? (wd ? wdToId : fopUah!.id) : accountId) || accountId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(n > 0)) return toastError("Вкажи суму більше нуля");
    if (!accountId) return toastError("Вибери рахунок");
    if (kind === "transfer" && (!toAccountId || toAccountId === accountId)) return toastError("Вибери інший рахунок, куди переказ");
    if (chain && conv && !(convR > 0)) return toastError("Вкажи курс конвертації у гривню");
    if (chain && wd && !wdToId) return toastError("Вибери, на яку карту вивести");
    setBusy(true);
    try {
      const body = {
        kind, amount: n, currency, accountId,
        date: new Date(`${date}T12:00`).toISOString(),
        toAccountId: kind === "transfer" ? toAccountId : null,
        projectId: PROJECT_KINDS.has(kind) && pre !== "ads" && pre !== "acquiring" ? target?.projectId ?? null : null,
        leadId: PROJECT_KINDS.has(kind) && pre !== "ads" && pre !== "acquiring" ? target?.lead?.id ?? null : null,
        stageId: kind === "income" && stageId ? stageId : null,
        counterparty: kind === "income" || kind === "transfer" ? (edit?.counterparty ?? null) : pre === "tax" ? "ДПС" : who,
        comment,
        category: kind === "expense" || kind === "income" || kind === "tax" ? category || null : null,
        adCampaignId: pre === "ads" ? adCampaignId || null : null,
        rate: foreign && num(rate) > 0 ? num(rate) : undefined, // empty → NBU rate of the operation date (server)
        period: period || null,
      };
      const res = await fetch(edit ? `/api/finance/transactions/${edit.id}` : "/api/finance/transactions", {
        method: edit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError(data.error ?? "Не вдалося зберегти");

      const parentId = data.id ?? edit?.id;
      const send = (url: string, method: string, b: object) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      // child operation: update it, create it, or remove it when switched off
      const sync = async (on: boolean, existing: TxRow | undefined, b: object) => {
        if (on) return existing ? send(`/api/finance/transactions/${existing.id}`, "PATCH", b) : send("/api/finance/transactions", "POST", { ...b, parentId });
        if (existing) return send(`/api/finance/transactions/${existing.id}`, "DELETE", {});
        return null;
      };
      if (chain) {
        const base = { date: body.date, period: txP };
        const r1 = await sync(conv, convChild, {
          ...base, kind: "transfer", category: CONV_CAT, amount: n, currency, rate: convR, accountId, toAccountId: fopUah!.id,
          comment: `Конвертація ${fmtMoney(n, currency)} по ${convR} = ${fmtMoney(converted, "UAH", 2)}`,
        });
        const r2 = await sync(wd, wdChild, {
          ...base, kind: "transfer", category: WD_CAT, amount: converted, currency: "UAH", accountId: fopUah!.id, toAccountId: wdToId,
          comment: `Вивід з ФОП · ${fmtMoney(converted, "UAH", 2)}`,
        });
        if ((r1 && !r1.ok) || (r2 && !r2.ok)) toastError("Оплату збережено, а конвертацію чи вивід — ні");
        if (wd) rememberWithdraw(wdToId);
      }

      // the linked 6% tax
      if (withTax && taxN > 0) {
        const taxBody = { amount: taxN, currency: "UAH", accountId: taxPayFrom, date: body.date, period: txP };
        const tr = child
          ? await fetch(`/api/finance/transactions/${child.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taxBody) })
          : await fetch("/api/finance/transactions", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...taxBody, kind: "tax", category: TAX6_CAT, parentId, counterparty: "ДПС", comment: `6% з ${fmtMoney(n, currency)}` }),
            });
        if (!tr.ok) toastError("Оплату збережено, а податок — ні. Додай його кнопкою «+ податок» у таблиці");
      }

      rememberAccount(pre, accountId);
      for (const key of [TX_KEY, SCHEDULE_KEY, FIN_KEY, PROJECTS_KEY, DEALS_KEY]) qc.invalidateQueries({ queryKey: key });
      toast({ kind: "success", title: edit ? "Збережено" : subOf(pre).label, text: `${fmtMoney(n, currency)} · ${account?.name ?? ""}${withTax && taxN > 0 ? ` · податок ${fmtMoney(taxN, "UAH", 2)}` : ""}`, duration: 4000 });
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const optionsOf = (list: typeof accounts): SelectOption[] =>
    [...new Set(list.map((a) => a.group))].flatMap((g) => list.filter((a) => a.group === g).map((a) => ({ value: a.id, label: a.name, group: g, sub: a.offBooks ? `${a.currency} · крипта` : a.currency })));
  // only accounts in the chosen currency (the current one stays visible when editing an old mismatch)
  // a foreign-currency expense may be paid from a hryvnia card (the bank converts) — offer UAH accounts too
  const accountOptions = optionsOf(accounts.filter((a) => a.currency === currency || a.anyCurrency || a.id === accountId || (kind === "expense" && currency !== "UAH" && a.currency === "UAH")));
  const allAccountOptions = optionsOf(accounts);
  const uahAccountOptions = optionsOf(accounts.filter((a) => a.currency === "UAH"));

  // switching the currency moves the account to one in that currency (last used for this type, else the first)
  function pickCurrency(c: string) {
    setCurrency(c);
    if (account?.currency === c) return;
    const last = accounts.find((a) => a.id === lastAccount(pre) && a.currency === c);
    if (account?.anyCurrency) return; // PayPal takes any currency
    const next = last ?? accounts.find((a) => a.currency === c && !a.offBooks) ?? accounts.find((a) => a.currency === c) ?? accounts.find((a) => a.anyCurrency);
    setAccountId(next?.id ?? "");
    if (toAccountId === next?.id) setToAccountId("");
  }

  const field = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors";
  const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";
  const gMeta = GROUPS.find((g) => g.key === group)!;
  const title = edit ? "Редагувати операцію" : copy ? "Повторити операцію" : fixedLead ? (kind === "income" ? "Внести оплату" : "Внести витрату по проєкту") : "Нова операція";

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="relative" style={picking ? { minHeight: 460 } : undefined}>
        <form onSubmit={submit} className="space-y-4">
          {/* type: Дохід / Витрата / Переказ + subtype */}
          <div className="flex flex-col sm:flex-row gap-2">
            {groups.length > 1 && (
              <div className="flex p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex-1">
                {groups.map((g) => {
                  const on = g.key === group;
                  const Icon = g.icon;
                  return (
                    <button type="button" key={g.key} onClick={() => pickGroup(g.key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded-lg text-[15px] sm:text-sm font-semibold cursor-pointer transition-all duration-150 ${on ? "shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                      style={on ? { background: `${g.color}22`, color: g.color, boxShadow: `inset 0 0 0 1px ${g.color}55` } : undefined}>
                      <Icon size={15} /> {g.label}
                    </button>
                  );
                })}
              </div>
            )}
            {subs.length > 1 && <SubtypeMenu subs={subs} value={pre} color={gMeta.color} onChange={pickPreset} />}
          </div>

          {/* date · amount · currency · account — one line */}
          <div>
            <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[132px_minmax(0,1fr)_auto] rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]/60 transition-colors overflow-hidden">
              <label className="col-span-2 sm:col-span-1 px-3 py-2 border-b sm:border-b-0 sm:border-r border-[var(--border)]">
                <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">Дата</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent text-sm text-[var(--text)] outline-none" style={{ colorScheme: "dark" }} />
              </label>
              <label className="px-3 py-2 min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">Сума</span>
                <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(groupNum(e.target.value))} placeholder="0"
                  className="w-full bg-transparent text-[28px] leading-tight sm:text-xl font-bold tabular-nums outline-none placeholder:text-[var(--text-dim)]" style={{ color: gMeta.color }} />
              </label>
              <div className="flex items-center gap-0.5 px-2">
                {CURRENCIES.map((c) => (
                  <button type="button" key={c} onClick={() => pickCurrency(c)}
                    className={`px-2.5 sm:px-2 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold cursor-pointer transition-colors ${currency === c ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05]"}`}>
                    <span className="sm:hidden">{c === "UAH" ? "₴" : c === "EUR" ? "€" : "$"}</span><span className="hidden sm:inline">{c === "UAH" ? "₴ UAH" : c === "EUR" ? "€ EUR" : "$ USD"}</span>
                  </button>
                ))}
              </div>
              {kind !== "transfer" && (
                <div className="col-span-2 sm:col-span-3 px-3 py-2 border-t border-[var(--border)]">
                  <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">{kind === "income" ? "На рахунок" : "З рахунку"}</span>
                  <Select variant="bare" value={accountId} options={accountOptions} placeholder="— вибери рахунок —"
                    onChange={(v) => { setAccountId(v); const a = accounts.find((x) => x.id === v); if (a && !edit && !a.anyCurrency) setCurrency(a.currency); }} />
                </div>
              )}
            </div>
            {foreign && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-[var(--text-dim)]">
                <span className="uppercase tracking-wider text-[9px]">Технічні поля</span>
                <label className="flex items-center gap-1.5">Курс
                  <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder={autoRate.toFixed(2)}
                    className="w-20 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] tabular-nums outline-none focus:border-[var(--accent)]" />
                </label>
                {/* what the bank really took in hryvnias — typing it sets the rate */}
                <label className="flex items-center gap-1.5" title="Скільки реально списали в гривні — курс перерахується сам">{account?.currency === "UAH" ? "Списано в гривні" : "Сума в гривні"}
                  <input value={uahEdit ?? (n > 0 ? String(Math.round(uah * 100) / 100) : "")} disabled={!(n > 0)}
                    onChange={(e) => { setUahEdit(groupNum(e.target.value)); const u = num(e.target.value); if (u > 0 && n > 0) setRate(String(Math.round((u / n) * 10000) / 10000)); }}
                    onBlur={() => setUahEdit(null)} inputMode="decimal" placeholder="—"
                    className="w-28 px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] font-semibold tabular-nums outline-none focus:border-[var(--accent)] disabled:opacity-50" /> ₴
                </label>
                {!rate && <span>курс НБУ на сьогодні</span>}
              </div>
            )}
          </div>

          {kind === "transfer" && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] sm:items-end gap-2">
              <div>
                <span className={label}>З рахунку</span>
                <Select value={accountId} onChange={setAccountId} options={accountOptions} placeholder="— вибери —" accent="#38bdf8" />
              </div>
              <ArrowRight size={16} className="hidden sm:block mb-3 text-[#38bdf8]" />
              <div>
                <span className={label}>На рахунок</span>
                <Select value={toAccountId} onChange={setToAccountId} options={allAccountOptions.filter((o) => o.value !== accountId)} placeholder="— вибери —" accent="#38bdf8" />
              </div>
            </div>
          )}

          {/* EUR / USD → hryvnia → company card (internal steps of one ФОП) */}
          {chain && (
            <div className="rounded-xl border border-[#38bdf8]/25 bg-[#38bdf8]/[0.04] px-3.5 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Repeat size={13} className="text-[#38bdf8]" />
                <span className="text-xs font-semibold text-[var(--text)]">Конвертація і вивід</span>
                <span className="ml-auto text-[10px] text-[var(--text-dim)]">{account!.group}: {account!.currency} → UAH → карта компанії</span>
              </div>
              <Step n={1} done text={<>Оплата <b className="text-[var(--text)]">{n > 0 ? fmtMoney(n, currency) : "—"}</b> на {account!.name}</>} />
              <Step n={2} done={conv} onToggle={() => setConvOn(!conv)} text={<>Конвертація на <b className="text-[var(--text)]">{fopUah!.name}</b></>}>
                {conv && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-dim)]">
                    по курсу
                    <input value={convRateStr} onChange={(e) => setConvRate(e.target.value)} inputMode="decimal" placeholder={autoRate.toFixed(2)}
                      className={`w-24 px-2 py-1.5 rounded-lg bg-[var(--surface-2)] border text-sm font-semibold tabular-nums text-[var(--text)] outline-none focus:border-[#38bdf8] ${convR > 0 ? "border-[var(--border)]" : "border-[#38bdf8]/60"}`} />
                    <span>=</span>
                    <b className="text-sm tabular-nums text-[#7dd3fc]">{convR > 0 && n > 0 ? fmtMoney(converted, "UAH", 2) : "—"}</b>
                    {!(convR > 0) && <span className="text-[#7dd3fc]/80">курс банку, за яким продав</span>}
                  </div>
                )}
              </Step>
              {conv && (
                <Step n={3} done={wd} onToggle={() => setWdOn(!wd)} text={<>Вивід {converted > 0 ? <b className="text-[var(--text)]">{fmtMoney(converted, "UAH", 2)}</b> : null} на карту компанії</>}>
                  {wd && <div className="max-w-[320px]"><Select variant="small" value={wdToId} onChange={setWdTo} accent="#38bdf8" options={optionsOf(companyCards)} /></div>}
                </Step>
              )}
            </div>
          )}

          {/* linked 6% tax */}
          {withTax && (
            <div className={`rounded-xl border px-3.5 py-3 transition-colors ${taxN > 0 ? "border-[#eab308]/30 bg-[#eab308]/[0.05]" : "border-amber-400/70 bg-amber-400/[0.07] shadow-[0_0_0_3px_rgba(251,191,36,0.12)]"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Link2 size={13} className="text-[#eab308]" />
                <span className="text-xs font-semibold text-[var(--text)]">{chain ? "4 · " : ""}Податок 6% — зв&apos;язаний платіж</span>
                <span className={`ml-auto text-[10px] ${taxN > 0 ? "text-[#facc15]/80" : "text-amber-300"}`}>{taxN > 0 ? "запишеться разом з оплатою" : "треба заповнити"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <input value={taxValue} inputMode="decimal" onChange={(e) => setTax(groupNum(e.target.value))} placeholder={foreign ? "порахуй вручну" : "0"}
                    className="w-full pl-3 pr-8 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold tabular-nums text-[#facc15] outline-none focus:border-[#eab308]" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-dim)]">₴</span>
                </div>
                <Select variant="small" value={taxPayFrom} onChange={setTaxAcc} options={uahAccountOptions} accent="#eab308" />
              </div>
              <div className="mt-1.5 text-[10px] text-[var(--text-dim)]">
                {foreign
                  ? <>Після подвійної конвертації — вкажи суму вручну{chain && wd ? ", сплачується з карти компанії" : ""}. 6% за курсом НБУ {r.toFixed(2)} ≈ <button type="button" onClick={() => setTax(String(tax6))} className="underline decoration-dotted cursor-pointer hover:text-[var(--text-muted)]">{fmtMoney(tax6, "UAH", 2)}</button></>
                  : <>6% від суми — можна змінити</>}
              </div>
            </div>
          )}

          {/* fields of the subtype */}
          {pre === "ads" && <AdFields open={open} platforms={fin.adPlatforms} platform={who} onPlatform={setWho} campaign={adCampaignId} onCampaign={setAdCampaignId} label={label} />}

          {pre === "contractor" && (
            <ContractorField open={open} names={fin.contractors} value={who} onChange={setWho} field={field} label={label} />
          )}

          {pre === "expense" && (
            <div>
              <span className={label}>Категорія</span>
              <Select value={category} onChange={setCategory} placeholder="— вибери категорію —" accent="#f97316"
                options={[...new Set([...fin.categories.filter((c) => c !== ADS_CAT && !/еквайринг/i.test(c)), ...(category ? [category] : [])])].map((c) => ({ value: c, label: c }))} />
            </div>
          )}

          {pre === "tax" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className={label}>Який податок</span>
              <Select value={category} onChange={setCategory} placeholder="— вибери —" accent="#eab308"
                options={[...new Set([...TAX_CATS, ...(category ? [category] : [])])].map((c) => ({ value: c, label: c }))} />
            </div>
              <div>
                <span className={label}>Коментар</span>
                <input value={comment} onChange={(e) => setComment(e.target.value)} className={field} placeholder="За який період, квитанція…" />
              </div>
            </div>
          )}

          {pre === "owner" && (
            <div>
              <span className={label}>Кому з власників</span>
              <div className="grid grid-cols-2 gap-2">
                {fin.owners.map((o) => {
                  const on = who === o;
                  return (
                    <button type="button" key={o} onClick={() => setWho(o)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${on ? "border-[#a855f7] bg-[#a855f7]/10 text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                      <Avatar name={o} size={24} /> <span className="truncate">{o}</span>
                      {on && <Check size={14} className="ml-auto text-[#c084fc]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {PROJECT_KINDS.has(kind) && pre !== "ads" && pre !== "acquiring" && (
            <div>
              <span className={label}>Проєкт{pre === "income" ? "" : " · якщо стосується"}</span>
              {fixedLead ? (
                <div className={`${field} bg-white/[0.02] flex items-center gap-2 min-w-0`}><span className="truncate">{projectTitle(fixedLead)}</span>{fixedLead.name.trim() && <span className="ml-auto shrink-0 text-xs text-[var(--text-dim)]">{fixedLead.name}</span>}</div>
              ) : value(target) ? (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                  <Avatar name={target!.name} size={24} />
                  <span className="text-sm text-[var(--text)] truncate flex-1">{target!.name}</span>
                  {target!.lead && <span className="text-[11px] text-[var(--text-dim)] tabular-nums">#{target!.lead.number}</span>}
                  <button type="button" onClick={() => setPicking(true)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">змінити</button>
                  <button type="button" onClick={() => setTarget(null)} className="p-0.5 text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Прибрати"><X size={13} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setPicking(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/60 cursor-pointer transition-colors">
                  <Search size={14} /> Вибрати проєкт «Операційки»
                  <span className="ml-auto text-[11px] text-[var(--text-dim)]">{kind === "income" ? "" : "без проєкту — витрати компанії"}</span>
                </button>
              )}
            </div>
          )}

          {kind === "income" && unpaid.length > 0 && (
            <div>
              <span className={label}>Який платіж закриває</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setStageId("")}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${!stageId ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)]"}`}>Без етапу</button>
                {unpaid.map((s) => (
                  <button type="button" key={s.id} onClick={() => { setStageId(s.id); if (!amount) setAmount(numText(s.amount)); }}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer tabular-nums ${stageId === s.id ? "border-[#22c55e] text-[#4ade80] bg-[#22c55e]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                    {s.title || `${s.idx + 1}-й платіж`} · {fmtMoney(s.amount, fixedLead?.currency ?? currency)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pre !== "tax" && (
            <div>
              <span className={label}>Коментар</span>
              <input value={comment} onChange={(e) => setComment(e.target.value)} className={field} placeholder="Етап, рахунок, скрін #…" />
            </div>
          )}

          {/* month */}
          <div className="text-[11px] text-[var(--text-dim)] flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Піде в місяць <b className="text-[var(--text-muted)]">{periodLabel(txP)}</b></span>
            {account?.offBooks && <span className="text-sky-300/80">Крипта — без податку, але йде в P&L</span>}
          </div>
          {/* only when the dividends were split on this very 10th — then it's arguable which month */}
          {onBoundary && kind !== "owner" && splitToday && (
            <div className="rounded-xl border border-[#C98C0A]/25 bg-[#C98C0A]/[0.05] px-3 py-2">
              <div className="text-[11px] text-[var(--text-muted)] mb-1.5">
                {fin.monthStartDay}-те — день поділу дивідендів. {auto.split ? "Поділ уже внесено — операція йде в новий місяць." : "Поділу ще не було — операція закриває старий місяць."}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([["До поділу", oldP], ["Після поділу", newP]] as const).map(([l, p]) => (
                  <button type="button" key={p} onClick={() => setPeriod(p === autoPeriod ? "" : p)}
                    className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${txP === p ? "border-[#C98C0A] text-[#C98C0A] bg-[#C98C0A]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                    {l} · {periodLabel(p)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* phone: the save button stays above the keyboard / at the bottom of the sheet */}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] bg-[var(--surface)] border-t border-[var(--border)] flex gap-2 sm:static sm:mx-0 sm:mb-0 sm:p-0 sm:pt-1 sm:bg-transparent sm:border-0">
            {edit && (onCopy || onRemove) && (
              <div className="flex gap-2 sm:hidden">
                {onRemove && <button type="button" onClick={onRemove} aria-label="Видалити" className="w-12 shrink-0 flex items-center justify-center rounded-xl border border-red-500/30 text-red-300 active:bg-red-500/10 cursor-pointer"><Trash2 size={17} /></button>}
                {onCopy && <button type="button" onClick={onCopy} aria-label="Повторити сьогодні" className="w-12 shrink-0 flex items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] active:bg-white/[0.05] cursor-pointer"><Copy size={17} /></button>}
              </div>
            )}
            <button type="button" onClick={onClose} className={`${edit && (onCopy || onRemove) ? "hidden sm:block" : ""} flex-1 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer`}>Скасувати</button>
            <button type="submit" disabled={busy}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-[15px] sm:text-sm font-semibold text-black cursor-pointer disabled:opacity-50 transition-[filter] hover:brightness-110"
              style={{ background: gMeta.color, boxShadow: `0 8px 24px -12px ${gMeta.color}` }}>
              {busy ? "Зберігаю…" : edit ? "Зберегти" : <>{subOf(pre).label}{n > 0 ? ` · ${fmtMoney(n, currency)}` : ""}{withTax && taxN > 0 ? ` + податок` : ""}</>}
            </button>
          </div>
        </form>

        {picking && <ProjectSheet open={open} journal={journal} onClose={() => setPicking(false)} onPick={(t) => { setTarget(t); setStageId(""); setPicking(false); }} />}
      </div>
    </Modal>
  );
}

const value = (t: TxTarget | null): t is TxTarget => !!t;

// subtype dropdown with icons («Підряд», «Реклама»…)
function SubtypeMenu({ subs, value: v, color, onChange }: { subs: (typeof SUBTYPES)[Group]; value: TxPreset; color: string; onChange: (p: TxPreset) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const cur = subs.find((s) => s.key === v) ?? subs[0];
  const Icon = cur.icon;
  return (
    <div ref={box} className="relative sm:w-[230px]">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full h-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:border-white/[0.16] cursor-pointer transition-colors">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}><Icon size={14} /></span>
        <span className="text-sm font-medium text-[var(--text)] truncate">{cur.label}</span>
        <ChevronDown size={14} className={`ml-auto text-[var(--text-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 right-0 left-0 sm:left-auto sm:w-[280px] mt-1.5 p-1 rounded-xl border border-[var(--border)] bg-[#111114] shadow-2xl">
          {subs.map((s) => {
            const I = s.icon;
            const on = s.key === v;
            return (
              <button type="button" key={s.key} onClick={() => { onChange(s.key); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors ${on ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${PRESET_META[s.key].color}1a`, color: PRESET_META[s.key].color }}><I size={15} /></span>
                <span className="min-w-0">
                  <span className="block text-sm text-[var(--text)]">{s.label}</span>
                  <span className="block text-[11px] text-[var(--text-dim)] truncate">{s.hint}</span>
                </span>
                {on && <Check size={14} className="ml-auto text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// «Кому»: contractors from the settings + employees, or any other name
function ContractorField({ open, names, value: v, onChange, field, label }: { open: boolean; names: string[]; value: string; onChange: (v: string) => void; field: string; label: string }) {
  const q = useRecurring(open);
  const people = [...new Set([...names, ...(q.data ?? []).filter((r) => r.type === "employee" && (r.active || r.payMode === "project")).map((r) => r.name)])];
  const [other, setOther] = useState(false);
  const custom = other || (!!v && !people.includes(v));
  return (
    <div>
      <span className={label}>Кому</span>
      <div className="flex items-center gap-2">
        {v && custom && <Avatar name={v} size={32} />}
        {custom ? (
          <input autoFocus value={v} onChange={(e) => onChange(e.target.value)} placeholder="Ім'я та прізвище" className={field} />
        ) : (
          <div className="flex-1 min-w-0">
            <Select value={v} placeholder="— вибери підрядника —" accent="#ef4444"
              onChange={(x) => { if (x === "__other") { setOther(true); onChange(""); } else onChange(x); }}
              options={[...people.map((p) => ({ value: p, label: p, avatar: true })), { value: "__other", label: "Інший…" }]} />
          </div>
        )}
        {custom && <button type="button" onClick={() => { setOther(false); onChange(""); }} className="shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">зі списку</button>}
      </div>
    </div>
  );
}

// «Яка реклама»: platform + campaign in one block
function AdFields({ open, platforms, platform, onPlatform, campaign, onCampaign, label }: {
  open: boolean; platforms: string[]; platform: string; onPlatform: (v: string) => void; campaign: string; onCampaign: (v: string) => void; label: string;
}) {
  const q = useAdCampaigns(open);
  const list = q.data ?? [];
  const types = [...new Set(list.map((c) => c.trafficType))];
  return (
    <div>
      <span className={label}>Яка реклама</span>
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
        <Select value={platform} onChange={onPlatform} placeholder="Майданчик" accent="#ec4899"
          options={[...new Set([...platforms, ...(platform ? [platform] : [])])].map((p) => ({ value: p, label: p }))} />
        <Select value={campaign} onChange={onCampaign} placeholder="— кампанія —" accent="#ec4899"
          options={types.flatMap((t) => list.filter((c) => c.trafficType === t).map((c) => ({ value: c.id, label: c.name, group: t, sub: c.active ? undefined : "пауза", color: c.active ? "#4ade80" : "#71717a" })))} />
      </div>
      <div className="mt-1 text-[10px] text-[var(--text-dim)]">Сума піде у витрати кампанії — з неї рахується ціна ліда й клієнта в «Рекламі»</div>
    </div>
  );
}

// Project picker over the form: search, recent projects first, all deals of «Операційка», sheet projects without a deal.
function ProjectSheet({ open, journal, onClose, onPick }: { open: boolean; journal: TxRow[]; onClose: () => void; onPick: (t: TxTarget) => void }) {
  const [q, setQ] = useState("");
  const dealsQ = useDeals(open);
  const projectsQ = useProjects(open);
  const deals = dealsQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const dealIds = new Set(deals.map((x) => x.id));
  const sheetName = (id: string) => projects.find((p) => p.leadId === id)?.name;
  const needle = q.trim().toLowerCase();

  type Item = { key: string; name: string; sub: string; t: TxTarget };
  const dealItems: Item[] = deals.map((x) => {
    const name = projectTitle(x, sheetName(x.id));
    const contact = x.name.trim() ? leadDisplayName(x) : "";
    return { key: x.id, name, sub: [contact, `#${x.number}`, x.amount ? fmtMoney(x.amount, x.currency ?? "UAH") : ""].filter(Boolean).join(" · "), t: { projectId: null, lead: x, name } };
  });
  // «Еквайринг» from the sheet is not a project — it's a kind of income
  const sheetItems: Item[] = projects.filter((p) => (!p.leadId || !dealIds.has(p.leadId)) && !/еквайринг/i.test(p.name))
    .map((p) => ({ key: p.id, name: p.name, sub: "з таблиці · ще без угоди", t: { projectId: p.id, lead: null, name: p.name } }));
  const all = [...dealItems, ...sheetItems];
  const hit = (i: Item) => !needle || `${i.name} ${i.sub}`.toLowerCase().includes(needle);
  // recent: projects of the latest operations
  const recentKeys: string[] = [];
  for (const t of journal) {
    const k = t.leadId ?? t.projectId;
    if (k && !recentKeys.includes(k)) recentKeys.push(k);
    if (recentKeys.length >= 5) break;
  }
  const recent = needle ? [] : recentKeys.map((k) => all.find((i) => i.key === k)).filter((i): i is Item => !!i);
  const sections = [
    { title: "Нещодавні", items: recent },
    { title: "Угоди «Операційки»", items: dealItems.filter(hit) },
    { title: "З таблиці — ще без угоди", items: sheetItems.filter(hit) },
  ].filter((s) => s.items.length);

  return (
    <div className="absolute -inset-4 sm:-inset-5 z-20 flex flex-col p-4 sm:p-5 bg-[#101013]">
      <div className="flex items-center gap-2 pb-3">
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Назад"><ChevronLeft size={16} /></button>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
            placeholder={`Пошук серед ${all.length} проєктів — назва, номер`}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-3">
        {dealsQ.isLoading && <div className="py-8 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
        {!dealsQ.isLoading && !sections.length && <div className="py-8 text-center text-sm text-[var(--text-muted)]">Нічого не знайдено</div>}
        {sections.map((s) => (
          <div key={s.title}>
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{s.title} <span className="opacity-60">{s.items.length}</span></div>
            {s.items.slice(0, needle ? 60 : 200).map((i) => (
              <button type="button" key={`${s.title}-${i.key}`} onClick={() => onPick(i.t)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-white/[0.05] cursor-pointer transition-colors">
                <Avatar name={i.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text)] truncate">{i.name}</span>
                  <span className="block text-[11px] text-[var(--text-dim)] truncate tabular-nums">{i.sub}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Step({ n: i, done, text, onToggle, children }: { n: number; done: boolean; text: React.ReactNode; onToggle?: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <button type="button" disabled={!onToggle} onClick={onToggle} title={onToggle ? (done ? "Не робити зараз" : "Зробити") : undefined}
        className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${done ? "bg-[#38bdf8] text-black" : "border border-[var(--border)] text-[var(--text-dim)]"} ${onToggle ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}>
        {done ? <Check size={11} strokeWidth={3} /> : i}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className={`text-xs ${done ? "text-[var(--text-muted)]" : "text-[var(--text-dim)] line-through decoration-white/20"}`}>{text}</div>
        {children}
      </div>
    </div>
  );
}

const WD_KEY = "tx-last-withdraw";
function lastWithdraw(): string | undefined { try { return localStorage.getItem(WD_KEY) ?? undefined; } catch { return undefined; } }
function rememberWithdraw(id: string) { try { localStorage.setItem(WD_KEY, id); } catch { /* ignore */ } }

// last account used per quick type (per browser) — the form opens on it next time
const LAST_KEY = "tx-last-account";
function lastAccount(kind: string): string | undefined {
  try { return (JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, string>)[kind]; } catch { return undefined; }
}
function rememberAccount(kind: string, id: string) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}"), [kind]: id })); } catch { /* ignore */ }
}

// ── «Додати податок?» — 6% for an income already in the ledger (button «+ податок 6%» in the table) ──

export interface TaxIncome { id: string; amount: number; currency: string; rate: number; accountId: string; date: string; period: string }

export function TaxModal({ income, onClose }: { income: TaxIncome; onClose: () => void }) {
  const qc = useQueryClient();
  const { fin } = useFinance();
  const foreign = income.currency !== "UAH";
  const from = fin.accounts.find((a) => a.id === income.accountId);
  // tax is paid in hryvnia — from the same ФОП's UAH account
  const payFrom = foreign ? fin.accounts.find((a) => a.group === from?.group && a.currency === "UAH" && !a.archived) ?? from : from;
  const [received, setReceived] = useState(numText(income.amount));
  const recN = Number(received.replace(/\s/g, "").replace(",", ".")) || 0;
  const suggest = Math.round(recN * income.rate * 6) / 100;
  const [tax, setTax] = useState(numText(Math.round(income.amount * income.rate * 6) / 100));
  const [touched, setTouched] = useState(false);
  const [accountId, setAccountId] = useState(payFrom?.id ?? income.accountId);
  const [busy, setBusy] = useState(false);
  const taxN = Number(tax.replace(/\s/g, "").replace(",", ".")) || 0;

  async function add() {
    if (!(taxN > 0)) return toastError("Вкажи суму податку");
    setBusy(true);
    try {
      if (foreign && recN > 0 && recN !== income.amount) {
        await fetch(`/api/finance/transactions/${income.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: recN, rate: income.rate }) });
      }
      const res = await fetch("/api/finance/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tax", category: TAX6_CAT, amount: taxN, currency: "UAH", accountId, parentId: income.id,
          date: income.date, period: income.period, counterparty: "ДПС",
          comment: `6% з ${fmtMoney(foreign ? recN : income.amount, income.currency)}`,
        }),
      });
      if (!res.ok) return toastError((await res.json().catch(() => ({}))).error ?? "Не вдалося додати податок");
      qc.invalidateQueries({ queryKey: TX_KEY });
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      toast({ kind: "success", title: "Податок додано", text: fmtMoney(taxN, "UAH", 2), duration: 3000 });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm tabular-nums outline-none focus:border-[#eab308]";
  return (
    <Modal open onClose={onClose} title="Додати податок 6%?" size="sm">
      <div className="space-y-3.5">
        <div className="text-xs text-[var(--text-muted)]">
          Оплата {fmtMoney(income.amount, income.currency)} прийшла на <b className="text-[var(--text)]">{from?.name}</b> — ФОП 3 групи.
        </div>
        {foreign && (
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Скільки зайшло на рахунок, {income.currency}</label>
            <input value={received} inputMode="decimal" onChange={(e) => { setReceived(groupNum(e.target.value)); if (!touched) { const v = Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0; setTax(String(Math.round(v * income.rate * 6) / 100)); } }} className={input} />
          </div>
        )}
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Податок, ₴</label>
          <input autoFocus value={tax} inputMode="decimal" onChange={(e) => { setTax(groupNum(e.target.value)); setTouched(true); }} className={`${input} text-lg font-semibold text-[#facc15]`} />
          <div className="mt-1 text-[10px] text-[var(--text-dim)]">
            {foreign
              ? <>Подвійна конвертація — перевір суму вручну. 6% за курсом {income.rate.toFixed(2)} ≈ {fmtMoney(suggest, "UAH", 2)}</>
              : <>6% від {fmtMoney(income.amount, "UAH")}</>}
          </div>
        </div>
        {foreign && (
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">Сплатити з рахунку</label>
            <Select value={accountId} onChange={setAccountId} accent="#eab308"
              options={fin.accounts.filter((a) => !a.archived && a.currency === "UAH").map((a) => ({ value: a.id, label: a.name, group: a.group, sub: a.currency }))} />
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Відміна</button>
          <button type="button" onClick={add} disabled={busy} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer disabled:opacity-50 hover:brightness-110" style={{ background: "#eab308" }}>
            {busy ? "Додаю…" : `Додати ${fmtMoney(taxN, "UAH", 2)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
