"use client";

import { useEffect, useState } from "react";
import { Archive, BarChart3, Copy, FileText, Gauge, Landmark, Pencil, Plus, Save, Settings2, X } from "lucide-react";
import { toast, toastError } from "@/components/ui/toast";
import {
  ACCOUNT_KINDS, CURRENCIES, KIND_META, accountBalances, accountShort, fmtMoney, kindOf, newId,
  type Account, type AccountKind, type FinanceSettings, type FopTax,
} from "@/lib/finance";
import { useFx } from "@/lib/useFx";
import { useFinance, useTransactions, type TxRow } from "@/components/finance/useFinance";
import AccountIcon, { CUR_SYM } from "@/components/finance/AccountIcon";
import Select from "@/components/finance/Select";
import AccountHistory from "@/components/finance/AccountHistory";
import { AccountStatsModal, TaxesModal } from "@/components/finance/AccountTools";
import RequisitesModal, { copyRequisites, hasRequisites } from "@/components/finance/Requisites";
import { Modal } from "@/components/ui/modal";
import { groupNum } from "@/lib/numInput";

// money of a ФОП for the calendar year: income (turnover) and taxes paid
export function fopYear(fop: FopTax, fin: FinanceSettings, txs: TxRow[], year = new Date().getFullYear()) {
  const ids = new Set(fin.accounts.filter((a) => a.group === fop.group).map((a) => a.id));
  const byId = new Map(txs.map((t) => [t.id, t]));
  const inYear = (t: TxRow) => new Date(t.date).getFullYear() === year;
  let turnover = 0, taxes = 0;
  for (const t of txs) {
    if (!inYear(t)) continue;
    if (t.kind === "income" && ids.has(t.accountId)) turnover += t.amountUah;
    if (t.kind === "tax") {
      const parent = t.parentId ? byId.get(t.parentId) : undefined;
      const mine = t.recurringId?.startsWith(`fop:${fop.group}:`) || (parent ? ids.has(parent.accountId) : ids.has(t.accountId));
      if (mine) taxes += t.amountUah;
    }
  }
  return { turnover, taxes, left: Math.max(0, fop.limit - turnover), share: fop.limit > 0 ? turnover / fop.limit : 0 };
}

// distinct colours for the donut slices
const SLICE = ["#C98C0A", "#22c55e", "#60a5fa", "#a78bfa", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#f43f5e", "#84cc16", "#06b6d4", "#8b5cf6", "#fb7185"];

// «Рахунки»: how much money is where right now, ФОП limits for the year, every account on one screen.
export default function AccountsTab({ canEdit }: { canEdit: boolean }) {
  const { fin, save } = useFinance();
  const { fx } = useFx();
  const txQ = useTransactions();
  const txs = txQ.data ?? [];
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Account | null>(null);
  const [stats, setStats] = useState<Account | null>(null);
  const [invoice, setInvoice] = useState<{ a: Account; mode: "req" | "invoice" } | null>(null);
  const [taxes, setTaxes] = useState(false);

  const rates = { EUR: fx.eurUah, USD: fx.usdUah };
  const bal = accountBalances(fin.accounts, txs, rates);
  const toUah = (a: Account, v: number) => (a.currency === "UAH" ? v : v * (a.currency === "EUR" ? fx.eurUah : fx.usdUah));
  const live = fin.accounts.filter((a) => !a.archived);
  const total = live.reduce((s, a) => s + toUah(a, bal[a.id] ?? 0), 0);
  const byKind = ACCOUNT_KINDS.map((k) => {
    const list = live.filter((a) => kindOf(a) === k.key);
    return { ...k, list, sum: list.reduce((s, a) => s + toUah(a, bal[a.id] ?? 0), 0) };
  }).filter((k) => k.list.length);
  // every account with money — one slice each, biggest first
  const slices = live.map((a) => ({ a, uah: toUah(a, bal[a.id] ?? 0) })).filter((x) => x.uah > 0.5).sort((x, y) => y.uah - x.uah)
    .map((x, i) => ({ ...x, color: SLICE[i % SLICE.length] }));
  const positive = slices.reduce((s, x) => s + x.uah, 0);
  const last = (id: string) => txs.find((t) => t.accountId === id || t.toAccountId === id)?.date;
  const year = new Date().getFullYear();

  if (editing) return <AccountsEditor fin={fin} save={save} onClose={() => setEditing(false)} />;

  const btn = "flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-white/[0.16] cursor-pointer transition-colors";
  const textBtn = "h-9 md:h-7 px-2 flex items-center gap-1 rounded-lg text-[11px] text-[var(--text-dim)] hover:bg-white/[0.06] cursor-pointer transition-colors";
  const iconBtn = "w-8 h-9 md:w-7 md:h-7 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:bg-white/[0.06] cursor-pointer transition-colors";
  return (
    <div className="space-y-3">
      {/* header: title + account-wide actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><Landmark size={17} /></div>
        <h1 className="text-lg font-semibold text-[var(--text)] mr-auto">Рахунки</h1>
        <button onClick={() => setTaxes(true)} className={btn}><Settings2 size={13} className="text-[#eab308]" /> <span className="md:hidden">Податки</span><span className="hidden md:inline">Податки й автоплатежі</span></button>
        {canEdit && <button onClick={() => setEditing(true)} aria-label="Редагувати рахунки" className={btn}><Pencil size={12} /> <span className="hidden md:inline">Редагувати рахунки</span></button>}
        {canEdit && (
          <button onClick={() => setAdding(true)} title="Додати рахунок"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "var(--accent)" }}>
            <Plus size={14} /> Рахунок
          </button>
        )}
      </div>

      {/* money now: total + donut of shares */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: "#C98C0A" }} />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
          <Donut slices={slices} total={positive} label={fmtMoney(total)} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Гроші на всіх рахунках</div>
            <div className="text-3xl font-bold tabular-nums text-[var(--accent)] mt-0.5">{fmtMoney(total)}</div>
            <div className="text-[11px] text-[var(--text-dim)] mt-0.5">курс НБУ {fx.date}: € {fx.eurUah.toFixed(2)} · $ {fx.usdUah.toFixed(2)}</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1">
              {slices.map(({ a, uah, color }) => (
                <button key={a.id} onClick={() => setOpen(a)} className="flex items-center gap-2 py-1.5 md:py-1 text-left text-xs rounded-md hover:bg-white/[0.03] cursor-pointer">
                  <i className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: color }} />
                  <span className="truncate text-[var(--text)]">{accountShort(a)}</span>
                  <span className="ml-auto tabular-nums text-[var(--text-muted)] whitespace-nowrap">{fmtMoney(bal[a.id] ?? 0, a.currency, a.currency === "UAH" ? 0 : 2)}</span>
                  <span className="w-10 text-right tabular-nums font-semibold text-[var(--text)]">{Math.round((uah / (positive || 1)) * 100)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ФОП limits for the calendar year */}
      {fin.fops.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {fin.fops.map((f) => {
            const y = fopYear(f, fin, txs, year);
            const color = y.share >= 0.9 ? "#ef4444" : y.share >= 0.7 ? "#f59e0b" : "#22c55e";
            return (
              <section key={f.group} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#C98C0A]/15 text-[#C98C0A]"><Landmark size={15} /></span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text)] truncate">{f.group}</div>
                    <div className="text-[11px] text-[var(--text-dim)]">{f.fopGroup} група · {year} рік</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Податків сплачено</div>
                    <div className="text-sm font-semibold tabular-nums text-[#facc15]">{fmtMoney(y.taxes)}</div>
                  </div>
                </div>
                <div className="mt-3.5 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Оборот за рік</div>
                    <div className="text-xl font-bold tabular-nums text-[var(--text)]">{fmtMoney(y.turnover)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Можна прийняти ще</div>
                    <div className="text-sm font-semibold tabular-nums" style={{ color }}>{fmtMoney(y.left)}</div>
                  </div>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(1.5, y.share * 100))}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-dim)] tabular-nums">
                  <Gauge size={11} /> {Math.round(y.share * 1000) / 10}% ліміту · ліміт {fmtMoney(f.limit)} до переходу на загальну систему
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* all accounts, compact: groups flow in columns — no empty gaps between them */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 lg:columns-2 gap-x-3">
        {byKind.map((k) => (
          <div key={k.key} className="break-inside-avoid pb-1.5">
            <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: k.color }}>{k.label}</span>
              <span className="text-[10px] tabular-nums text-[var(--text-dim)]">{fmtMoney(k.sum)}</span>
            </div>
            {k.list.map((a) => {
              const v = bal[a.id] ?? 0;
              const zero = Math.abs(v) < 0.005;
              const d = last(a.id);
              return (
                <div key={a.id} role="button" tabIndex={0} onClick={() => setOpen(a)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(a); }}
                  className="group flex items-center gap-2.5 md:gap-3 px-2 md:px-2.5 py-1.5 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors">
                  <span className={zero ? "opacity-55" : ""}><AccountIcon a={a} size={30} /></span>
                  <span className={`min-w-0 flex-1 ${zero ? "opacity-55" : ""}`}>
                    <span className="block text-sm text-[var(--text)] leading-snug line-clamp-2 break-words md:leading-normal md:line-clamp-none md:truncate">{a.name}</span>
                    <span className="block text-[10px] text-[var(--text-dim)] truncate">
                      {a.anyCurrency ? "будь-яка валюта → ₴" : a.tax6 ? "3 група · 6%" : kindOf(a) === "fop" ? "2 група" : d ? `остання ${new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}` : "без операцій"}
                    </span>
                  </span>
                  <span className={`text-right tabular-nums leading-tight ${zero ? "opacity-55" : ""}`}>
                    <span className={`block text-sm font-semibold ${v < 0 ? "text-red-400" : zero ? "text-[var(--text-dim)]" : "text-[var(--text)]"}`}>
                      {fmtMoney(v, a.currency, a.currency === "UAH" ? 0 : 2)}
                    </span>
                    {a.currency !== "UAH" && !zero && <span className="block text-[10px] text-[var(--text-dim)]">≈ {fmtMoney(toUah(a, v))}</span>}
                  </span>
                  <span className="flex items-center gap-0.5 pl-1 border-l border-white/[0.06]">
                    <button onClick={(e) => { e.stopPropagation(); setStats(a); }} title="Статистика рахунку" aria-label={`Статистика ${a.name}`} className={`${iconBtn} hover:text-[#4ade80]`}><BarChart3 size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); if (hasRequisites(a)) copyRequisites(a); else setInvoice({ a, mode: "req" }); }}
                      title={hasRequisites(a) ? "Скопіювати реквізити" : "Додати реквізити"} className={`${textBtn} hover:text-[var(--accent)]`}><Copy size={13} /><span className="hidden sm:inline">Реквізити</span></button>
                    <button onClick={(e) => { e.stopPropagation(); setInvoice({ a, mode: "invoice" }); }}
                      title="Створити інвойс" className={`${textBtn} hover:text-[#60a5fa]`}><FileText size={13} /><span className="hidden sm:inline">Інвойс</span></button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      {open && <AccountHistory account={open} balance={bal[open.id] ?? 0} onClose={() => setOpen(null)} />}
      {stats && <AccountStatsModal account={stats} balance={bal[stats.id] ?? 0} onClose={() => setStats(null)} onHistory={() => { setOpen(stats); setStats(null); }} />}
      {invoice && <RequisitesModal account={invoice.a} mode={invoice.mode} onClose={() => setInvoice(null)} />}
      {taxes && <TaxesModal canEdit={canEdit} onClose={() => setTaxes(false)} />}
      {adding && <AddAccountModal fin={fin} save={save} onClose={() => setAdding(false)} />}
    </div>
  );
}

// donut: one slice per account with money
function Donut({ slices, total, label }: { slices: { a: Account; uah: number; color: string }[]; total: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r, gap = slices.length > 1 ? 2 : 0;
  const lens = slices.map((s) => (s.uah / (total || 1)) * c);
  const offs = lens.map((_, i) => lens.slice(0, i).reduce((x, y) => x + y, 0));
  return (
    <div className="relative w-[124px] h-[124px] md:w-[150px] md:h-[150px] shrink-0 self-center">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
        {slices.map((s, i) => {
          const len = lens[i];
          return (
            <circle key={s.a.id} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`} strokeDashoffset={-offs[i]}>
              <title>{`${s.a.name}: ${Math.round((s.uah / (total || 1)) * 100)}%`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)]">усього</span>
        <span className="text-[13px] font-bold tabular-nums text-[var(--text)] leading-tight px-3">{label}</span>
      </div>
    </div>
  );
}

// «+ Рахунок»: one new account without opening the whole editor
function AddAccountModal({ fin, save, onClose }: { fin: FinanceSettings; save: (f: FinanceSettings) => Promise<FinanceSettings>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("card");
  const [currency, setCurrency] = useState<Account["currency"]>("UAH");
  const [group, setGroup] = useState("");
  const [start, setStart] = useState("");
  const groups = [...new Set(fin.accounts.map((a) => a.group))];
  const field = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";
  const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";
  async function submit() {
    if (!name.trim()) return toastError("Вкажи назву рахунку");
    const acc: Account = {
      id: newId("a"), name: name.trim(), currency, kind, start: Number(start.replace(/\s/g, "").replace(",", ".")) || 0,
      group: group.trim() || KIND_META[kind].label, tax6: false, offBooks: kind === "crypto",
    };
    try {
      await save({ ...fin, accounts: [...fin.accounts, acc] });
      toast({ kind: "success", title: "Рахунок додано", text: acc.name, duration: 3000 });
      onClose();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Не вдалося зберегти");
    }
  }
  return (
    <Modal open onClose={onClose} title="Новий рахунок" size="md">
      <div className="space-y-3">
        <div>
          <span className={label}>Назва</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} className={field} placeholder="Монобанк Артур" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Тип</span>
            <Select value={kind} onChange={(v) => setKind(v as AccountKind)} options={ACCOUNT_KINDS.map((k) => ({ value: k.key, label: k.label, color: k.color }))} />
          </div>
          <div>
            <span className={label}>Валюта</span>
            <Select value={currency} onChange={(v) => setCurrency(v as Account["currency"])} options={CURRENCIES.map((c) => ({ value: c, label: `${CUR_SYM[c]} ${c}` }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Група</span>
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="add-acc-groups" className={field} placeholder={KIND_META[kind].label} />
            <datalist id="add-acc-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div>
            <span className={label}>Стартовий залишок</span>
            <input value={start} onChange={(e) => setStart(groupNum(e.target.value))} inputMode="decimal" placeholder="0" className={`${field} tabular-nums`} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button onClick={submit} className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "var(--accent)" }}>
            <Plus size={15} /> Додати рахунок
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── editing accounts ──

function AccountsEditor({ fin, save, onClose }: { fin: FinanceSettings; save: (f: FinanceSettings) => Promise<FinanceSettings>; onClose: () => void }) {
  const [draft, setDraft] = useState<FinanceSettings>(fin);
  async function submit() {
    try {
      await save(draft);
      onClose();
      toast({ kind: "success", title: "Збережено", text: "Рахунки оновлено", duration: 3000 });
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Не вдалося зберегти");
    }
  }
  const setAcc = (id: string, p: Partial<Account>) => setDraft((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  const input = "px-2.5 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]";
  const check = (on: boolean, set: (v: boolean) => void, title: string) => (
    <button type="button" onClick={() => set(!on)} title={title}
      className={`w-5 h-5 rounded-[6px] border flex items-center justify-center cursor-pointer transition-colors ${on ? "bg-[var(--accent)] border-[var(--accent)] text-black" : "border-white/25"}`}>
      {on && <span className="text-[11px] font-bold">✓</span>}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">Рахунки</h2>
        <button onClick={onClose} className="ml-auto flex items-center gap-1 px-3 py-2 rounded-xl text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><X size={13} />Скасувати</button>
        <button onClick={submit} className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold text-black cursor-pointer" style={{ background: "var(--accent)" }}><Save size={13} />Зберегти</button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[36px_minmax(200px,1.4fr)_150px_110px_minmax(150px,1fr)_120px_54px_54px_54px_40px] items-center gap-2 px-2 py-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
            <span /><span>Назва</span><span>Тип</span><span>Валюта</span><span>Група</span><span>Старт. залишок</span>
            <span title="ФОП 3 групи: 6% з надходжень">6%</span><span title="Приймає будь-яку валюту, рахується в гривні">Будь-яка</span><span title="Крипта: показується окремо">Крипта</span><span />
          </div>
          {draft.accounts.map((a) => (
            <div key={a.id} className={`grid grid-cols-[36px_minmax(200px,1.4fr)_150px_110px_minmax(150px,1fr)_120px_54px_54px_54px_40px] items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/[0.02] ${a.archived ? "opacity-40" : ""}`}>
              <AccountIcon a={a} size={28} />
              <input value={a.name} onChange={(e) => setAcc(a.id, { name: e.target.value })} className={input} />
              <Select variant="small" value={kindOf(a)} onChange={(v) => setAcc(a.id, { kind: v as AccountKind })}
                options={ACCOUNT_KINDS.map((k) => ({ value: k.key, label: k.label, color: k.color }))} />
              <Select variant="small" value={a.currency} onChange={(v) => setAcc(a.id, { currency: v as Account["currency"] })}
                options={CURRENCIES.map((c) => ({ value: c, label: `${CUR_SYM[c]} ${c}` }))} />
              <input value={a.group} onChange={(e) => setAcc(a.id, { group: e.target.value })} list="acc-groups" className={input} />
              <input value={a.start} inputMode="decimal" onChange={(e) => setAcc(a.id, { start: Number(e.target.value.replace(",", ".")) || 0 })} className={`${input} tabular-nums`} />
              {check(a.tax6, (v) => setAcc(a.id, { tax6: v }), "6% з надходжень (ФОП 3 групи)")}
              {check(!!a.anyCurrency, (v) => setAcc(a.id, { anyCurrency: v }), "Будь-яка валюта → гривня")}
              {check(a.offBooks, (v) => setAcc(a.id, { offBooks: v }), "Крипта / поза банком")}
              <button onClick={() => setAcc(a.id, { archived: !a.archived })} title={a.archived ? "Повернути" : "В архів (операції залишаться)"}
                className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer"><Archive size={13} /></button>
            </div>
          ))}
          <datalist id="acc-groups">{[...new Set(draft.accounts.map((a) => a.group))].map((g) => <option key={g} value={g} />)}</datalist>
          <button onClick={() => setDraft((d) => ({ ...d, accounts: [...d.accounts, { id: newId("a"), name: "Новий рахунок", currency: "UAH", group: "Карти", start: 0, tax6: false, offBooks: false, kind: "card" }] }))}
            className="m-2 flex items-center gap-1 px-3 py-2 rounded-xl text-xs border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer">
            <Plus size={13} /> Рахунок
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <ListEdit label="Власники (отримують дивіденди)" items={draft.owners} onChange={(owners) => setDraft((d) => ({ ...d, owners }))} placeholder="Ім'я власника" />
        <ListEdit label="Категорії витрат бізнесу" items={draft.categories} onChange={(categories) => setDraft((d) => ({ ...d, categories }))} placeholder="Нова категорія" />
        <ListEdit label="Підрядники (список «Кому»)" items={draft.contractors} onChange={(contractors) => setDraft((d) => ({ ...d, contractors }))} placeholder="Ім'я підрядника" />
        <ListEdit label="Рекламні майданчики" items={draft.adPlatforms} onChange={(adPlatforms) => setDraft((d) => ({ ...d, adPlatforms }))} placeholder="Meta, Google…" />
        <label className="flex items-center gap-2 text-[var(--text-muted)]">
          Місяць починається з числа
          <input value={draft.monthStartDay} inputMode="numeric" onChange={(e) => setDraft((d) => ({ ...d, monthStartDay: Number(e.target.value) || 10 }))} className={`${input} w-16 tabular-nums`} />
        </label>
      </div>
    </div>
  );
}

function ListEdit({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState("");
  const add = () => { const x = v.trim(); if (x && !items.includes(x)) onChange([...items, x]); setV(""); };
  return (
    <div>
      <div className="text-[var(--text-muted)] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border border-[var(--border)] text-[var(--text)]">
            {it}
            <button type="button" onClick={() => onChange(items.filter((x) => x !== it))} className="p-0.5 rounded text-[var(--text-dim)] hover:text-red-400 cursor-pointer" aria-label={`Прибрати ${it}`}><X size={11} /></button>
          </span>
        ))}
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder}
          className="w-36 px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-dashed border-[var(--border)] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
      </div>
    </div>
  );
}

// Monthly taxes + yearly limit of one ФОП (used in «Податки й автоплатежі»).
export function FopTaxBar({ fop, accounts, canEdit, onSave }: { fop: FopTax; accounts: Account[]; canEdit: boolean; onSave: (f: FopTax) => void }) {
  const [d, setD] = useState(fop);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh copy after save
  useEffect(() => setD(fop), [fop]);
  const total = d.esv + d.single + d.military;
  const commit = (next: FopTax) => { setD(next); if (JSON.stringify(next) !== JSON.stringify(fop)) onSave(next); };
  const field = (key: "esv" | "single" | "military" | "limit", label: string, w = "w-[96px]") => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{label}</span>
      <input disabled={!canEdit} value={d[key] || ""} placeholder="0" inputMode="decimal"
        onChange={(e) => setD({ ...d, [key]: Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0 })}
        onBlur={() => commit(d)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`${w} px-2.5 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-right tabular-nums text-[var(--text)] outline-none focus:border-[#eab308] disabled:opacity-60`} />
    </label>
  );
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-white/[0.015] p-3.5 space-y-3 ${d.active ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#C98C0A]/15 text-[#C98C0A]"><Landmark size={15} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text)] truncate">{d.group}</div>
          <div className="text-[11px] text-[var(--text-dim)]">автосписання 9-го · {fmtMoney(total, "UAH", 2)} / міс</div>
        </div>
        <div className="ml-auto flex p-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
          {([3, 2] as const).map((g) => (
            <button key={g} disabled={!canEdit} onClick={() => commit({ ...d, fopGroup: g })}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${d.fopGroup === g ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)]"}`}>{g} гр</button>
          ))}
        </div>
        <button role="switch" aria-checked={d.active} disabled={!canEdit} onClick={() => commit({ ...d, active: !d.active, since: !d.active ? new Date().toISOString().slice(0, 10) : d.since })}
          aria-label={d.active ? "Вимкнути автоподатки" : "Увімкнути автоподатки"}
          className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:cursor-default ${d.active ? "bg-[#eab308]" : "bg-white/[0.12]"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ${d.active ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2.5">
        {field("esv", "ЄСВ")}
        {field("single", "Єдиний")}
        {field("military", "Військовий")}
        <div className="flex flex-col gap-1 min-w-[190px] flex-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">З рахунку</span>
          <Select variant="small" value={d.accountId} onChange={(v) => commit({ ...d, accountId: v })} accent="#eab308"
            options={accounts.filter((a) => a.currency === "UAH").map((a) => ({ value: a.id, label: a.name, group: KIND_META[kindOf(a)].label }))} />
        </div>
        {field("limit", "Річний ліміт", "w-[130px]")}
      </div>
    </div>
  );
}
