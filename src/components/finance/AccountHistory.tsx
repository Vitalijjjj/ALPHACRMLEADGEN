"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import ListPager, { usePager } from "@/components/ui/ListPager";
import { PRESET_META, accountShort, fmtMoney, presetOf, projectTitle, type Account } from "@/lib/finance";
import { useFinance, useTransactions, type TxRow } from "@/components/finance/useFinance";
import AccountIcon, { CUR_SYM } from "@/components/finance/AccountIcon";
import TxModal from "@/components/finance/TxModal";

// what came in / went out of one account: every operation, signed for this account
export default function AccountHistory({ account: a, balance, onClose }: { account: Account; balance: number; onClose: () => void }) {
  const { fin } = useFinance();
  const txQ = useTransactions();
  const [edit, setEdit] = useState<TxRow | null>(null);
  const year = new Date().getFullYear();
  const list = (txQ.data ?? []).filter((t) => t.accountId === a.id || t.toAccountId === a.id);
  const pager = usePager(list, `account:${a.id}`);
  const acc = (id: string | null) => fin.accounts.find((x) => x.id === id);

  // amount in this account's currency and its direction
  const move = (t: TxRow) => {
    const incoming = t.kind === "income" || (t.kind === "transfer" && t.toAccountId === a.id);
    const v = t.currency === a.currency ? t.amount : a.currency === "UAH" ? t.amountUah : t.amountUah / (t.rate || 1);
    return { incoming, v, cur: t.currency === a.currency || a.currency !== "UAH" ? t.currency : "UAH" };
  };
  let inY = 0, outY = 0;
  for (const t of list) {
    if (new Date(t.date).getFullYear() !== year) continue;
    const m = move(t);
    if (m.incoming) inY += t.amountUah; else outY += t.amountUah;
  }

  const what = (t: TxRow) => {
    const p = presetOf(t);
    if (t.kind === "transfer") {
      const other = acc(t.toAccountId === a.id ? t.accountId : t.toAccountId);
      return `${t.toAccountId === a.id ? "з" : "на"} ${other ? accountShort(other) : "—"}${t.category ? ` · ${t.category}` : ""}`;
    }
    const proj = t.lead ? projectTitle(t.lead, t.project?.name) : t.project?.name;
    return [PRESET_META[p].short, proj ?? t.category, t.counterparty].filter(Boolean).join(" · ");
  };

  return (
    <Modal open onClose={onClose} title={a.name} size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <AccountIcon a={a} size={44} />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Залишок зараз</div>
              <div className={`text-2xl font-bold tabular-nums ${balance < 0 ? "text-red-400" : "text-[var(--text)]"}`}>{fmtMoney(balance, a.currency, a.currency === "UAH" ? 0 : 2)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 w-full gap-2 md:flex md:w-auto md:gap-2.5 md:ml-auto">
            <Stat label={`Надійшло за ${year}`} value={inY} color="#4ade80" icon={<ArrowDownLeft size={13} />} />
            <Stat label={`Пішло за ${year}`} value={outY} color="#fb923c" icon={<ArrowUpRight size={13} />} />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="hidden md:grid grid-cols-[96px_110px_140px_minmax(0,1.4fr)_minmax(0,1fr)] gap-x-4 px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)]">
            <span>Дата</span><span>Рух</span><span>Сума</span><span>Що / звідки / куди</span><span>Коментар</span>
          </div>
          {txQ.isLoading && <div className="py-10 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
          {!txQ.isLoading && !list.length && <div className="py-10 text-center text-sm text-[var(--text-muted)]">По цьому рахунку ще немає операцій</div>}
          {pager.visible.map((t) => {
            const m = move(t);
            const color = m.incoming ? "#4ade80" : "#fb923c";
            const sum = (
              <>
                <span className="text-[15px] font-semibold" style={{ color: m.incoming ? "#4ade80" : "var(--text)" }}>
                  {m.incoming ? "+" : "−"}{m.v.toLocaleString("uk-UA", { maximumFractionDigits: 2 }).replace(/ /g, " ")}
                </span>
                <span className="ml-1 md:ml-1.5 text-[13px] text-[var(--text-muted)]">{CUR_SYM[m.cur] ?? m.cur}</span>
              </>
            );
            return (
              <div key={t.id}>
              {/* phone: what + comment on the left, signed amount + date on the right */}
              <button onClick={() => setEdit(t)}
                className="md:hidden w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-white/[0.04] active:bg-white/[0.03] cursor-pointer">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color, background: `${color}1a` }}>
                  {m.incoming ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-[var(--text)]">{what(t)}</span>
                  <span className="block truncate text-[11px] text-[var(--text-dim)]">{t.comment || (m.incoming ? "Надходження" : "Списання")}</span>
                </span>
                <span className="text-right tabular-nums whitespace-nowrap shrink-0">
                  <span className="block">{sum}</span>
                  <span className="block text-[10px] text-[var(--text-dim)]">{format(new Date(t.date), "dd.MM.yyyy")}</span>
                </span>
              </button>
              <button onClick={() => setEdit(t)}
                className="hidden md:grid w-full grid-cols-[96px_110px_140px_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-x-4 px-4 py-2.5 text-left border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors">
                <span className="text-sm tabular-nums text-[var(--text)]">{format(new Date(t.date), "dd-MM-yyyy")}</span>
                <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ color, background: `${color}1a` }}>
                  {m.incoming ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}{m.incoming ? "Надходження" : "Списання"}
                </span>
                <span className="tabular-nums whitespace-nowrap">
                  <span className="text-[15px] font-semibold" style={{ color: m.incoming ? "#4ade80" : "var(--text)" }}>
                    {m.incoming ? "+" : "−"}{m.v.toLocaleString("uk-UA", { maximumFractionDigits: 2 }).replace(/ /g, " ")}
                  </span>
                  <span className="ml-1.5 text-[13px] text-[var(--text-muted)]">{CUR_SYM[m.cur] ?? m.cur}</span>
                </span>
                <span className="min-w-0 truncate text-sm text-[var(--text)]">{what(t)}</span>
                <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">{t.comment || "—"}</span>
              </button>
              </div>
            );
          })}
          <ListPager pager={pager} noun="операцій" />
        </div>
      </div>
      <TxModal open={!!edit} edit={edit} onClose={() => setEdit(null)} />
    </Modal>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]"><span style={{ color }}>{icon}</span>{label}</div>
      <div className="text-sm font-semibold tabular-nums text-[var(--text)]">{fmtMoney(value)}</div>
    </div>
  );
}
