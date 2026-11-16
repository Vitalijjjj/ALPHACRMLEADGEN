"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bot, Briefcase, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, FileText, Globe, Mail, MessageCircle, Palette, PenTool,
  Plus, Repeat, Server, Sparkles, Trash2, Users, Video, Wallet, Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ask } from "@/components/ui/dialogs";
import { toast, toastError } from "@/components/ui/toast";
import { CURRENCIES, EVERY, KIND_META, accountShort, dueInMonth, fmtMoney, kindOf, type Every } from "@/lib/finance";
import ListPager, { usePager } from "@/components/ui/ListPager";
import { useFx } from "@/lib/useFx";
import AccountIcon, { CUR_SYM } from "@/components/finance/AccountIcon";
import Select from "@/components/finance/Select";
import { Avatar } from "@/components/finance/Person";
import { RECURRING_KEY, TX_KEY, useFinance, type RecurringRow } from "@/components/finance/useFinance";
import { groupNum, numText } from "@/lib/numInput";

type RType = RecurringRow["type"];
const KEY = RECURRING_KEY;

const TEXT: Record<RType, { one: string; add: string; role: string; rolePh: string; empty: string; defCat: string }> = {
  employee: { one: "Співробітник", add: "Співробітник", role: "Посада", rolePh: "PM, дизайнер, менеджер…", empty: "Додай співробітника — зарплата списуватиметься сама щомісяця", defCat: "Команда / зарплата" },
  subscription: { one: "Підписка", add: "Підписка", role: "Що це", rolePh: "Loom, ChatGPT, хостинг…", empty: "Додай підписку — оплата списуватиметься сама щомісяця", defCat: "Підписки / ПЗ" },
};

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const anchorOf = (r: RecurringRow) => r.month ?? new Date(r.activeFrom).getMonth() + 1;
const chargeDate = (r: RecurringRow, y: number, m: number) => new Date(y, m, Math.min(r.day, new Date(y, m + 1, 0).getDate()), 12);
// is this item written off in month (y, m)?
const dueIn = (r: RecurringRow, m: number) => r.active && r.payMode !== "project" && dueInMonth(r.every ?? "month", anchorOf(r), m);

// next write-off date of an active item (this month if its day hasn't passed / wasn't charged yet)
function nextCharge(r: RecurringRow): Date | null {
  if (!r.active || r.payMode === "project") return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = r.lastCharge ? new Date(r.lastCharge) : null;
  for (let i = 0; i < 25; i++) {
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12), m = (now.getMonth() + i) % 12;
    if (!dueIn(r, m)) continue;
    const at = chargeDate(r, y, m);
    if (i === 0 && (at < today || (last && last.getFullYear() === y && last.getMonth() === m))) continue;
    return at;
  }
  return null;
}

// a recognizable icon for popular services (by name)
const SERVICES: { re: RegExp; icon: typeof Users; color: string }[] = [
  { re: /chat\s*gpt|openai/i, icon: Bot, color: "#10a37f" },
  { re: /claude|anthropic/i, icon: Sparkles, color: "#d97757" },
  { re: /loom/i, icon: Video, color: "#625df5" },
  { re: /сервер|server|vps|hosting|хостинг|hetzner|vercel|neon|aws|digital\s*ocean/i, icon: Server, color: "#38bdf8" },
  { re: /figma/i, icon: PenTool, color: "#a259ff" },
  { re: /notion|docs/i, icon: FileText, color: "#e5e5e5" },
  { re: /google|gmail|workspace|mail|пошт/i, icon: Mail, color: "#ea4335" },
  { re: /domain|домен/i, icon: Globe, color: "#22c55e" },
  { re: /adobe|canva|midjourney|design/i, icon: Palette, color: "#ff61f6" },
  { re: /telegram|slack|zoom|meet/i, icon: MessageCircle, color: "#2aabee" },
];
export function ServiceIcon({ name, size = 34 }: { name: string; size?: number }) {
  const s = SERVICES.find((x) => x.re.test(name)) ?? { icon: Repeat, color: "#f97316" };
  return (
    <span className="rounded-xl flex items-center justify-center shrink-0" style={{ width: size, height: size, color: s.color, background: `${s.color}1f`, border: `1px solid ${s.color}40` }}>
      <s.icon size={Math.round(size * 0.48)} />
    </span>
  );
}

function EveryPill({ r }: { r: RecurringRow }) {
  const e = EVERY.find((x) => x.key === (r.every ?? "month"))!;
  const c = e.key === "month" ? "#60a5fa" : e.key === "quarter" ? "#fbbf24" : "#f472b6";
  return (
    <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ color: c, background: `${c}1a` }}>
      <CalendarClock size={11} /> {e.label}{e.key !== "month" ? ` · ${MONTHS[anchorOf(r) - 1].slice(0, 3).toLowerCase()}` : ""}
    </span>
  );
}

const switchCls = (on: boolean) => `relative w-10 h-[22px] rounded-full transition-colors duration-200 cursor-pointer shrink-0 ${on ? "bg-[#22c55e]" : "bg-white/[0.12]"}`;
const knobCls = (on: boolean) => `absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ${on ? "left-[21px]" : "left-[3px]"}`;

function PayPill({ mode }: { mode: RecurringRow["payMode"] }) {
  const m = mode === "project" ? { c: "#a78bfa", t: "Попроєктно", I: Briefcase } : { c: "#60a5fa", t: "Щомісяця", I: Repeat };
  return (
    <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ color: m.c, background: `${m.c}1a` }}>
      <m.I size={11} /> {m.t}
    </span>
  );
}

function Stat({ icon: I, color, label, children, sub, className = "" }: { icon: typeof Users; color: string; label: string; children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <section className={`relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 md:p-4 min-w-0 ${className}`}>
      <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full blur-3xl opacity-[0.12] pointer-events-none" style={{ background: color }} />
      <div className="relative flex items-center gap-2 md:gap-2.5 min-w-0">
        <span className="w-6 h-6 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1f` }}><I size={13} className="md:w-[15px] md:h-[15px]" /></span>
        <span className="text-[10px] md:text-[11px] uppercase tracking-wider text-[var(--text-muted)] leading-tight">{label}</span>
      </div>
      <div className="relative mt-2 md:mt-3 text-lg md:text-2xl font-bold tabular-nums text-[var(--text)] truncate md:overflow-visible md:whitespace-normal">{children}</div>
      {sub && <div className="relative mt-0.5 text-[11px] text-[var(--text-dim)] truncate">{sub}</div>}
    </section>
  );
}

// «Співробітники» / «Підписки»: the team (monthly salary with auto write-off or paid per project) and subscriptions.
export default function RecurringTab({ type }: { type: RType }) {
  const qc = useQueryClient();
  const { fin } = useFinance();
  const { fx } = useFx();
  const t = TEXT[type];
  const team = type === "employee";
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<RecurringRow[]> => {
      const res = await fetch("/api/finance/recurring");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });
  const [edit, setEdit] = useState<RecurringRow | "new" | null>(null);
  const rows = (q.data ?? []).filter((r) => r.type === type)
    .sort((a, b) => Number(b.payMode === "monthly" && b.active) - Number(a.payMode === "monthly" && a.active));
  const pager = usePager(rows, team ? "team" : "subscriptions");
  const uah = (v: number, c: string) => (c === "UAH" ? v : v * (c === "EUR" ? fx.eurUah : fx.usdUah));
  const monthlyRows = rows.filter((r) => r.payMode !== "project");
  const monthly = monthlyRows.filter((r) => r.active).reduce((s, r) => s + uah(r.amount, r.currency), 0);
  const charged = rows.reduce((s, r) => s + r.chargedUah, 0);
  const soon = monthlyRows.map((r) => ({ r, at: nextCharge(r) })).filter((x): x is { r: RecurringRow; at: Date } => !!x.at).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const year = new Date().getFullYear();
  // subscriptions: what is written off in the chosen month and the month after it
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const shift = (d: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + d) / 12), m: (((m + d) % 12) + 12) % 12 }));
  const nowD = new Date();
  const nextM = { y: nowD.getFullYear() + Math.floor((nowD.getMonth() + 1) / 12), m: (nowD.getMonth() + 1) % 12 };
  const inMonth = (m: number) => monthlyRows.filter((r) => dueIn(r, m));
  const monthSum = inMonth(ym.m).reduce((s, r) => s + uah(r.amount, r.currency), 0);
  const nextSum = inMonth(nextM.m).reduce((s, r) => s + uah(r.amount, r.currency), 0);

  const toggle = useMutation({
    mutationFn: async (r: RecurringRow) => {
      const res = await fetch(`/api/finance/recurring/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }) });
      if (!res.ok) throw new Error();
    },
    onMutate: (r) => qc.setQueryData<RecurringRow[]>(KEY, (old) => old?.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x))),
    onError: () => toastError("Не вдалося перемкнути"),
    onSettled: () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: TX_KEY }); },
  });
  const acc = (id: string) => fin.accounts.find((a) => a.id === id);
  const cols = team
    ? "grid-cols-[minmax(180px,1.5fr)_120px_130px_minmax(140px,1fr)_104px_120px_52px] 2xl:grid-cols-[minmax(220px,1.5fr)_130px_150px_minmax(170px,1fr)_130px_150px_56px]"
    : "grid-cols-[minmax(170px,1.4fr)_126px_116px_minmax(140px,1fr)_100px_96px_110px_52px] 2xl:grid-cols-[minmax(200px,1.4fr)_150px_140px_minmax(160px,1fr)_120px_130px_130px_56px]";
  const Icon = team ? Users : Repeat;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><Icon size={17} /></div>
        <h1 className="text-lg font-semibold text-[var(--text)] mr-auto">{team ? "Співробітники" : "Підписки"}</h1>
        <button onClick={() => setEdit("new")} className="flex items-center gap-1.5 px-3 md:px-3.5 py-2 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "var(--accent)" }}>
          <Plus size={15} /> {t.add}
        </button>
      </div>

      {/* tiles across the full width */}
      {team ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-2.5">
          <Stat icon={Wallet} color="#60a5fa" label="Зарплати на цей місяць"
            sub={`${monthlyRows.filter((r) => r.active).length} щомісячних · ${rows.length - monthlyRows.length} попроєктно`}>
            {fmtMoney(monthly)}
          </Stat>
          <Stat icon={CalendarClock} color="#C98C0A" label="Найближче списання"
            sub={soon ? <span className="inline-flex items-center gap-1.5"><Avatar name={soon.r.name} size={16} />{soon.r.name}</span> : "автосписань немає"}>
            {soon ? <>{format(soon.at, "dd.MM")} <span className="text-[var(--text-dim)] font-normal">·</span> {fmtMoney(soon.r.amount, soon.r.currency)}</> : <span className="text-[var(--text-dim)]">—</span>}
          </Stat>
          <Stat icon={Check} color="#94a3b8" label="Списано всього" sub={`${rows.reduce((s, r) => s + r.charges, 0)} автосписань`} className="col-span-2 md:col-span-1">
            {fmtMoney(charged)}
          </Stat>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer" aria-label="Попередній місяць"><ChevronLeft size={15} /></button>
            <div className="flex-1 sm:flex-none min-w-[150px] h-8 px-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--text)] tabular-nums">
              <CalendarDays size={13} className="text-[var(--accent)]" /> {MONTHS[ym.m]} {ym.y}
            </div>
            <button onClick={() => shift(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer" aria-label="Наступний місяць"><ChevronRight size={15} /></button>
            {(ym.y !== nowD.getFullYear() || ym.m !== nowD.getMonth()) && (
              <button onClick={() => setYm({ y: nowD.getFullYear(), m: nowD.getMonth() })} className="ml-1 px-2.5 h-8 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">цей місяць</button>
            )}
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 md:gap-2.5">
            <Stat icon={Wallet} color="#f97316" label={`Підписки · ${MONTHS[ym.m].toLowerCase()}`} sub={`${inMonth(ym.m).length} списань`}>
              {fmtMoney(monthSum)}
            </Stat>
            <Stat icon={CalendarClock} color="#C98C0A" label="Найближче списання"
              sub={soon ? <span className="inline-flex items-center gap-1.5"><ServiceIcon name={soon.r.name} size={16} />{soon.r.name}</span> : "автосписань немає"}>
              {soon ? <>{format(soon.at, "dd.MM")} <span className="text-[var(--text-dim)] font-normal">·</span> {fmtMoney(soon.r.amount, soon.r.currency)}</> : <span className="text-[var(--text-dim)]">—</span>}
            </Stat>
            <Stat icon={CalendarDays} color="#a78bfa" label={`Наступного місяця · ${MONTHS[nextM.m].toLowerCase()}`} sub={`${inMonth(nextM.m).length} списань`}>
              {fmtMoney(nextSum)}
            </Stat>
            <Stat icon={Check} color="#94a3b8" label="Списано всього" sub={`${rows.reduce((s, r) => s + r.charges, 0)} автосписань`}>
              {fmtMoney(charged)}
            </Stat>
          </div>
        </div>
      )}

      {/* list — like the cashflow table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {/* phone: one card per item — everything that matters + a big on/off switch */}
        <div className="md:hidden divide-y divide-white/[0.05]">
          {q.isLoading && <div className="py-12 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
          {!q.isLoading && !rows.length && (
            <div className="py-12 px-4 flex flex-col items-center gap-2 text-center text-sm text-[var(--text-muted)]">
              <Icon size={22} className="text-[var(--text-dim)]" />{t.empty}
            </div>
          )}
          {pager.visible.map((r) => {
            const project = r.payMode === "project";
            const next = project ? null : nextCharge(r);
            const a = acc(r.accountId);
            const off = !project && !r.active;
            return (
              <div key={r.id} onClick={() => setEdit(r)} className="flex items-center gap-3 pl-3 pr-1 py-2.5 active:bg-white/[0.04] cursor-pointer">
                <div className={`flex-1 min-w-0 flex items-start gap-3 ${off ? "opacity-55" : ""}`}>
                  {team ? <Avatar name={r.name} size={36} /> : <ServiceIcon name={r.name} size={36} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 text-sm font-medium text-[var(--text)] truncate">{r.name}</span>
                      {project ? <span className="text-xs text-[var(--text-dim)] shrink-0">за проєкт</span> : (
                        <span className="shrink-0 tabular-nums text-sm font-semibold text-[var(--text)]">{r.amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 }).replace(/\s/g, " ")}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{CUR_SYM[r.currency] ?? r.currency}</span></span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--text-dim)] truncate">{r.role || (team ? "посада не вказана" : "—")}{!project && a ? ` · ${accountShort(a)}` : ""}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] tabular-nums min-w-0">
                      {team ? <PayPill mode={r.payMode} /> : <EveryPill r={r} />}
                      <span className="truncate text-[var(--text-muted)]">
                        {next ? <>наст. <span className="text-[var(--text)]">{format(next, "dd.MM")}</span></> : project ? "по факту" : "вимкнено"}
                      </span>
                    </div>
                  </div>
                </div>
                {project ? <span className="w-12 shrink-0" /> : (
                  <button role="switch" aria-checked={r.active} aria-label={r.active ? "Вимкнути автосписання" : "Увімкнути автосписання"}
                    onClick={(e) => { e.stopPropagation(); toggle.mutate(r); }} className="w-12 h-11 shrink-0 flex items-center justify-center cursor-pointer">
                    <span className={switchCls(r.active)}><span className={knobCls(r.active)} /></span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <div className={team ? "min-w-[900px] 2xl:min-w-[1000px]" : "min-w-[960px] 2xl:min-w-[1100px]"}>
            <div className={`grid ${cols} items-center gap-x-3 2xl:gap-x-4 px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)]`}>
              <span>{team ? "Співробітник" : "Підписка"}</span>
              <span>{team ? "Оплата" : "Періодичність"}</span>
              <span>Сума</span><span>Рахунок</span><span>{team ? "Наступне" : "Дата списання"}</span>
              {!team && <span>{MONTHS[nextM.m]}</span>}
              <span>{team ? `Виплачено за ${year}` : "Списано"}</span>
              <span className="text-right">Авто</span>
            </div>
            {q.isLoading && <div className="py-12 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
            {!q.isLoading && !rows.length && (
              <div className="py-14 flex flex-col items-center gap-2 text-sm text-[var(--text-muted)]">
                <Icon size={22} className="text-[var(--text-dim)]" />{t.empty}
              </div>
            )}
            {pager.visible.map((r) => {
              const project = r.payMode === "project";
              const next = project ? null : nextCharge(r);
              const a = acc(r.accountId);
              const off = !project && !r.active;
              return (
                <div key={r.id} onClick={() => setEdit(r)}
                  className={`grid ${cols} items-center gap-x-3 2xl:gap-x-4 px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] cursor-pointer transition-colors`}>
                  <div className={`flex items-center gap-3 min-w-0 ${off ? "opacity-55" : ""}`}>
                    {team ? <Avatar name={r.name} size={34} /> : <ServiceIcon name={r.name} />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">{r.name}</div>
                      <div className="text-[11px] text-[var(--text-dim)] truncate">{r.role || (team ? "посада не вказана" : "—")}{r.note ? ` · ${r.note}` : ""}</div>
                    </div>
                  </div>
                  {team ? <PayPill mode={r.payMode} /> : <EveryPill r={r} />}
                  <div className={`tabular-nums ${off ? "opacity-55" : ""}`}>
                    {project ? <span className="text-xs text-[var(--text-dim)]">за проєкт</span> : (
                      <>
                        <span className="text-[15px] font-semibold text-[var(--text)]">{r.amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 }).replace(/\s/g, " ")}</span>
                        <span className="ml-1.5 text-[13px] text-[var(--text-muted)]">{CUR_SYM[r.currency] ?? r.currency}</span>
                        <div className="text-[10px] text-[var(--text-dim)]">{(r.every ?? "month") === "month" ? `щомісяця ${r.day}-го` : `${r.day} ${MONTHS_GEN[anchorOf(r) - 1]}${r.every === "quarter" ? " і кожні 3 міс" : ""}`}</div>
                      </>
                    )}
                  </div>
                  <div className={`min-w-0 ${off ? "opacity-55" : ""}`}>
                    {project || !a ? <span className="text-xs text-[var(--text-dim)]">—</span> : (
                      <span title={a.name} className="inline-flex items-center gap-2 max-w-full text-[13px] text-[var(--text-muted)]"><AccountIcon a={a} size={24} /><span className="truncate">{accountShort(a)}</span></span>
                    )}
                  </div>
                  <div className="text-xs tabular-nums">
                    {next ? <span className="text-[var(--text)]">{format(next, "dd-MM-yyyy")}</span> : <span className="text-[var(--text-dim)]">{project ? "по факту" : "вимкнено"}</span>}
                  </div>
                  {!team && (
                    <div className="text-xs tabular-nums">
                      {dueIn(r, nextM.m) ? <span className="text-[var(--text)] font-medium">{fmtMoney(r.amount, r.currency)}</span> : <span className="text-[var(--text-dim)]">—</span>}
                    </div>
                  )}
                  <div className="text-xs tabular-nums">
                    {team
                      ? (r.paidYearUah ? <><span className="text-[var(--text)] font-medium">{fmtMoney(r.paidYearUah)}</span><span className="block text-[10px] text-[var(--text-dim)]">{r.paidCount} оплат</span></> : <span className="text-[var(--text-dim)]">—</span>)
                      : (r.charges ? <><span className="text-[var(--text)] font-medium">{fmtMoney(r.chargedUah)}</span><span className="block text-[10px] text-[var(--text-dim)]">{r.charges}×</span></> : <span className="text-[var(--text-dim)]">—</span>)}
                  </div>
                  <div className="flex justify-end">
                    {project ? <span className="text-xs text-[var(--text-dim)]">—</span> : (
                      <button role="switch" aria-checked={r.active} aria-label={r.active ? "Вимкнути автосписання" : "Увімкнути автосписання"} title={r.active ? "Автосписання увімкнено" : "Автосписання вимкнено"}
                        onClick={(e) => { e.stopPropagation(); toggle.mutate(r); }} className={switchCls(r.active)}>
                        <span className={knobCls(r.active)} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ListPager pager={pager} noun={team ? "співробітників" : "підписок"} />
      </div>

      {edit && <RecurringModal type={type} item={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

// add / edit — the same look as «Нова операція»
function RecurringModal({ type, item, onClose }: { type: RType; item: RecurringRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { fin } = useFinance();
  const t = TEXT[type];
  const team = type === "employee";
  const accounts = fin.accounts.filter((a) => !a.archived);
  const [mode, setMode] = useState<RecurringRow["payMode"]>(item?.payMode ?? "monthly");
  const [name, setName] = useState(item?.name ?? "");
  const [role, setRole] = useState(item?.role ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [amount, setAmount] = useState(item && item.amount ? numText(item.amount) : "");
  const [currency, setCurrency] = useState(item?.currency ?? "UAH");
  const [day, setDay] = useState(String(item?.day ?? 10));
  const [accountId, setAccountId] = useState(item?.accountId ?? accounts.find((a) => a.currency === "UAH" && !a.offBooks)?.id ?? accounts[0]?.id ?? "");
  const [active, setActive] = useState(item ? item.active || item.payMode === "project" : true);
  const [every, setEvery] = useState<Every>(item?.every ?? "month");
  const [uahAmount, setUahAmount] = useState(item?.uahAmount ? String(item.uahAmount) : "");
  const [month, setMonth] = useState(String(item?.month ?? new Date().getMonth() + 1));
  const [busy, setBusy] = useState(false);
  const project = team && mode === "project";
  // $ / € subscriptions are usually paid from a hryvnia card — the bank converts at about the NBU rate
  const fitting = accounts.filter((a) => a.currency === currency || a.anyCurrency || (currency !== "UAH" && a.currency === "UAH"));
  const { fx } = useFx();
  const payAcc = accounts.find((a) => a.id === accountId);
  const fxRate = currency === "EUR" ? fx.eurUah : currency === "USD" ? fx.usdUah : 1;
  const amountN = Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;
  const accountOptions = fitting.map((a) => ({ value: a.id, label: a.name, group: KIND_META[kindOf(a)].label, color: KIND_META[kindOf(a)].color }));

  function pickCurrency(c: string) {
    setCurrency(c);
    const cur = accounts.find((a) => a.id === accountId);
    // a hryvnia card stays — it can pay in any currency
    if (!cur || (cur.currency !== c && !cur.anyCurrency && cur.currency !== "UAH")) setAccountId(accounts.find((a) => a.currency === c)?.id ?? accountId);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = project
        ? { type, payMode: "project", name, role, note }
        : { type, payMode: "monthly", name, role, note, amount: Number(amount.replace(/\s/g, "").replace(",", ".")), currency, day: Number(day), accountId, active,
          every: team ? "month" : every, month: !team && every !== "month" ? Number(month) : null,
          uahAmount: currency !== "UAH" ? Number(uahAmount.replace(/\s/g, "").replace(",", ".")) || null : null };
      const res = await fetch(item ? `/api/finance/recurring/${item.id}` : "/api/finance/recurring", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError(data.error ?? "Не вдалося зберегти");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: TX_KEY });
      toast({ kind: "success", title: item ? "Збережено" : `${t.one} додано`, text: project ? `${name} · попроєктно` : `${name} · ${fmtMoney(Number(amount.replace(/\s/g, "").replace(",", ".")) || 0, currency)} · ${EVERY.find((x) => x.key === (team ? "month" : every))!.label.toLowerCase()}`, duration: 3500 });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!(await ask(`Видалити «${item.name}»? ${item.payMode === "project" ? "Оплати в кешфлоу залишаться." : "Автосписання зупиняться, вже списані суми залишаться в кешфлоу."}`))) return;
    const res = await fetch(`/api/finance/recurring/${item.id}`, { method: "DELETE" });
    if (!res.ok) return toastError("Не вдалося видалити");
    qc.invalidateQueries({ queryKey: KEY });
    onClose();
  }

  const field = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors";
  const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";
  const modes = [
    { key: "monthly" as const, label: "Щомісяця", hint: "зарплата з автосписанням", icon: Repeat, color: "#60a5fa" },
    { key: "project" as const, label: "Попроєктно", hint: "платимо за кожен проєкт", icon: Briefcase, color: "#a78bfa" },
  ];
  return (
    <Modal open onClose={onClose} title={item ? (team ? "Співробітник" : "Підписка") : team ? "Новий співробітник" : "Нова підписка"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {team && (
          <div className="flex p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
            {modes.map((m) => {
              const on = m.key === mode;
              return (
                <button type="button" key={m.key} onClick={() => setMode(m.key)}
                  className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg cursor-pointer transition-all duration-150 ${on ? "shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  style={on ? { background: `${m.color}22`, color: m.color, boxShadow: `inset 0 0 0 1px ${m.color}55` } : undefined}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold"><m.icon size={15} /> {m.label}</span>
                  <span className="text-[10px] opacity-70">{m.hint}</span>
                </button>
              );
            })}
          </div>
        )}

        {!team && (
          <div className="flex p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
            {EVERY.map((e) => {
              const on = e.key === every;
              const c = e.key === "month" ? "#60a5fa" : e.key === "quarter" ? "#fbbf24" : "#f472b6";
              return (
                <button type="button" key={e.key} onClick={() => setEvery(e.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 ${on ? "shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  style={on ? { background: `${c}22`, color: c, boxShadow: `inset 0 0 0 1px ${c}55` } : undefined}>
                  {e.key === "month" ? <Repeat size={14} /> : e.key === "quarter" ? <CalendarClock size={14} /> : <CalendarDays size={14} />} {e.label}
                </button>
              );
            })}
          </div>
        )}

        {/* who — avatar / service icon + name + role in one row */}
        <div className="flex items-end gap-3">
          {team ? <Avatar name={name || "?"} size={42} /> : <ServiceIcon name={name} size={42} />}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className={label}>{team ? "Ім'я та прізвище" : "Назва"}</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder={team ? "Андрій Коваль" : "ChatGPT Team"} />
            </div>
            <div>
              <span className={label}>{t.role}</span>
              <input value={role} onChange={(e) => setRole(e.target.value)} className={field} placeholder={t.rolePh} />
            </div>
          </div>
        </div>

        {!project && (
          <>
            {/* amount · currency · day — one line, account under it (like an operation) */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_110px] rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]/60 transition-colors overflow-hidden">
              <label className="px-3 py-2 min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">{team ? "Зарплата на місяць" : every === "year" ? "Сума за рік" : every === "quarter" ? "Сума за квартал" : "Сума на місяць"}</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(groupNum(e.target.value))} placeholder="0"
                  className="w-full bg-transparent text-xl font-bold tabular-nums outline-none placeholder:text-[var(--text-dim)] text-[#f87171]" />
              </label>
              <div className="flex items-center gap-0.5 px-2">
                {CURRENCIES.map((c) => (
                  <button type="button" key={c} onClick={() => pickCurrency(c)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${currency === c ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05]"}`}>
                    {CUR_SYM[c]} {c}
                  </button>
                ))}
              </div>
              <label className="col-span-2 sm:col-span-1 px-3 py-2 border-t sm:border-t-0 sm:border-l border-[var(--border)]">
                <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">{!team && every !== "month" ? "Число" : "Число місяця"}</span>
                <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} className="w-full bg-transparent text-sm font-semibold tabular-nums text-[var(--text)] outline-none" />
              </label>
              {!team && every !== "month" && (
                <div className="col-span-2 sm:col-span-3 px-3 py-2 border-t border-[var(--border)]">
                  <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">{every === "year" ? "Місяць списання" : "Перше списання в місяці (далі кожні 3 місяці)"}</span>
                  <Select variant="bare" value={month} onChange={setMonth} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
                </div>
              )}
              <div className="col-span-2 sm:col-span-3 px-3 py-2 border-t border-[var(--border)]">
                <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)]">З рахунку</span>
                <Select variant="bare" value={accountId} options={accountOptions} placeholder="— вибери рахунок —" onChange={setAccountId} />
              </div>
            </div>
            {currency !== "UAH" && payAcc?.currency === "UAH" && (() => {
              const fixed = Number(uahAmount.replace(/\s/g, "").replace(",", ".")) || 0;
              const nbu = amountN * fxRate;
              return (
                <div className="-mt-1 rounded-xl border border-[var(--border)] bg-white/[0.015] px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex-1 min-w-[180px]">
                      <span className="block text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-1">Списується в гривні</span>
                      <div className="flex items-center gap-2">
                        <input value={uahAmount} onChange={(e) => setUahAmount(groupNum(e.target.value))} inputMode="decimal"
                          placeholder={amountN > 0 ? String(Math.round(nbu * 100) / 100) : "0"}
                          className="w-36 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-base font-semibold tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-dim)]" />
                        <span className="text-sm text-[var(--text-muted)]">₴</span>
                        {fixed > 0 && amountN > 0 && <span className="text-[11px] text-[var(--text-dim)] tabular-nums">курс {(fixed / amountN).toFixed(2)}</span>}
                      </div>
                    </label>
                    <div className="flex p-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs">
                      <button type="button" onClick={() => setUahAmount("")}
                        className={`px-2.5 py-1.5 rounded-md cursor-pointer ${!fixed ? "bg-[var(--accent)] text-black font-semibold" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>По НБУ</button>
                      <button type="button" onClick={() => { if (!fixed) setUahAmount(String(Math.round(nbu * 100) / 100)); }}
                        className={`px-2.5 py-1.5 rounded-md cursor-pointer ${fixed ? "bg-[var(--accent)] text-black font-semibold" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Своя сума</button>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-[var(--text-dim)]">
                    {fixed ? <>Щоразу списуватиметься <b className="text-[var(--text-muted)] tabular-nums">{fmtMoney(fixed, "UAH", 2)}</b> з цього рахунку.</>
                      : <>Порожньо — за курсом НБУ на день списання (зараз ≈ <b className="text-[var(--text-muted)] tabular-nums">{fmtMoney(nbu, "UAH", 2)}</b>, курс {fxRate.toFixed(2)}).</>}
                    {" "}Окремий платіж можна поправити в кешфлоу.
                  </div>
                </div>
              );
            })()}

            {/* auto write-off — green when on (subscriptions are always written off; pause them in the list) */}
            {team && <button type="button" onClick={() => setActive(!active)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left cursor-pointer transition-colors ${active ? "border-[#22c55e]/40 bg-[#22c55e]/[0.07]" : "border-[var(--border)] bg-white/[0.015]"}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-[#22c55e]/20 text-[#4ade80]" : "bg-white/[0.06] text-[var(--text-dim)]"}`}><Zap size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${active ? "text-[#4ade80]" : "text-[var(--text)]"}`}>Автоматичне списання {active ? "увімкнено" : "вимкнено"}</span>
                <span className="block text-[11px] text-[var(--text-dim)]">{active ? `щомісяця ${day || "?"}-го в кешфлоу сама з'являється витрата` : "витрату вноситимеш вручну"}</span>
              </span>
              <span className={switchCls(active)}><span className={knobCls(active)} /></span>
            </button>}
          </>
        )}

        {project && (
          <div className="rounded-xl border border-[#a78bfa]/25 bg-[#a78bfa]/[0.05] px-3.5 py-3 text-[11px] text-[var(--text-muted)]">
            Автосписання немає — оплату вносиш у кешфлоу як «Підрядник», і ця людина є у списку «Кому». Скільки їй виплачено за рік, видно в таблиці.
          </div>
        )}

        <div>
          <span className={label}>Коментар</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} placeholder={team ? "Контакти, умови, ставка за проєкт…" : "Необов'язково"} />
        </div>

        <div className="flex gap-2 pt-1">
          {item && (
            <button type="button" onClick={remove} className="px-3 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-dim)] hover:text-red-400 hover:border-red-500/40 cursor-pointer" aria-label="Видалити"><Trash2 size={15} /></button>
          )}
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button type="submit" disabled={busy} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer disabled:opacity-50 hover:brightness-110" style={{ background: "var(--accent)" }}>
            {busy ? "Зберігаю…" : item ? "Зберегти" : "Додати"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
