"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Repeat, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { toastError } from "@/components/ui/toast";
import { fmtMoney, type Account } from "@/lib/finance";
import { RECURRING_KEY, TX_KEY, useFinance, useRecurring, useTransactions, type RecurringRow } from "@/components/finance/useFinance";
import AccountIcon from "@/components/finance/AccountIcon";
import { FopTaxBar } from "@/components/finance/AccountsTab";


// ── «Податки й автоплатежі»: ФОП taxes on the 9th + salaries / subscriptions written off automatically ──
export function TaxesModal({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { fin, save } = useFinance();
  const rq = useRecurring();
  const items = rq.data ?? [];
  const toggle = useMutation({
    mutationFn: async (r: RecurringRow) => {
      const res = await fetch(`/api/finance/recurring/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }) });
      if (!res.ok) throw new Error();
    },
    onMutate: (r) => qc.setQueryData<RecurringRow[]>(RECURRING_KEY, (old) => old?.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x))),
    onError: () => toastError("Не вдалося перемкнути"),
    onSettled: () => { qc.invalidateQueries({ queryKey: RECURRING_KEY }); qc.invalidateQueries({ queryKey: TX_KEY }); },
  });
  const acc = (id: string) => fin.accounts.find((a) => a.id === id);
  return (
    <Modal open onClose={onClose} title="Податки й автоплатежі" size="xl">
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Податки ФОП · списуються самі 9-го</div>
          <div className="space-y-2.5">
            {fin.fops.map((f) => (
              <FopTaxBar key={f.group} fop={f} accounts={fin.accounts.filter((a) => !a.archived)} canEdit={canEdit}
                onSave={(next) => save({ ...fin, fops: fin.fops.map((x) => (x.group === f.group ? next : x)) }).catch(() => toastError("Не вдалося зберегти"))} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Автоплатежі · зарплати й підписки</span>
            <Link href="/pnl/team" className="ml-auto flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"><Users size={11} /> Співробітники</Link>
            <Link href="/pnl/subscriptions" className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"><Repeat size={11} /> Підписки</Link>
          </div>
          <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
            {!items.length && <div className="py-8 text-center text-sm text-[var(--text-muted)]">Автоплатежів ще немає — додай у «Співробітниках» або «Підписках»</div>}
            {items.map((r) => {
              const a = acc(r.accountId);
              return (
                <div key={r.id} className={`grid grid-cols-[44px_minmax(0,1.3fr)_130px_minmax(0,1fr)_90px] items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0 ${r.active ? "" : "opacity-55"}`}>
                  <button role="switch" aria-checked={r.active} disabled={!canEdit} onClick={() => toggle.mutate(r)} aria-label={r.active ? "Вимкнути" : "Увімкнути"}
                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${r.active ? "bg-[var(--accent)]" : "bg-white/[0.12]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ${r.active ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--text)] truncate">{r.name}</div>
                    <div className="text-[11px] text-[var(--text-dim)] truncate">{r.type === "employee" ? "Співробітник" : "Підписка"}{r.role ? ` · ${r.role}` : ""}</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-[var(--text)]">{fmtMoney(r.amount, r.currency)}</div>
                  <div className="min-w-0 flex items-center gap-2 text-xs text-[var(--text-muted)]">{a && <AccountIcon a={a} size={24} />}<span className="truncate">{a?.name ?? "—"}</span></div>
                  <div className="text-right text-[11px] text-[var(--text-dim)]">{r.day}-го</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── «Статистика» of one account: months of the calendar year + where money came from / went to ──
const MONTHS = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
export function AccountStatsModal({ account: a, balance, onClose, onHistory }: { account: Account; balance: number; onClose: () => void; onHistory: () => void }) {
  const { fin } = useFinance();
  const txs = useTransactions().data ?? [];
  const [year, setYear] = useState(new Date().getFullYear());
  const accName = (id: string | null) => fin.accounts.find((x) => x.id === id)?.name ?? "—";
  const months = MONTHS.map(() => ({ inc: 0, out: 0 }));
  const src = new Map<string, number>(), dst = new Map<string, number>();
  let n = 0;
  for (const t of txs) {
    if (t.accountId !== a.id && t.toAccountId !== a.id) continue;
    const d = new Date(t.date);
    if (d.getFullYear() !== year) continue;
    n++;
    const incoming = t.kind === "income" || (t.kind === "transfer" && t.toAccountId === a.id);
    const v = t.currency === a.currency ? t.amount : a.currency === "UAH" ? t.amountUah : t.amountUah / (t.rate || 1);
    const key = t.kind === "transfer"
      ? `${incoming ? "з" : "на"} ${accName(incoming ? t.accountId : t.toAccountId)}`
      : t.lead?.projectName || t.lead?.name || t.project?.name || t.category || t.counterparty || (incoming ? "Надходження" : "Витрата");
    if (incoming) { months[d.getMonth()].inc += v; src.set(key, (src.get(key) ?? 0) + v); }
    else { months[d.getMonth()].out += v; dst.set(key, (dst.get(key) ?? 0) + v); }
  }
  const inc = months.reduce((s, m) => s + m.inc, 0), out = months.reduce((s, m) => s + m.out, 0);
  const max = Math.max(1, ...months.flatMap((m) => [m.inc, m.out]));
  const cur = a.currency, dig = cur === "UAH" ? 0 : 2;
  const top = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  return (
    <Modal open onClose={onClose} title={`Статистика · ${a.name}`} size="xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <AccountIcon a={a} size={36} />
          <div className="mr-auto">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Залишок</div>
            <div className="text-lg font-bold tabular-nums text-[var(--text)]">{fmtMoney(balance, cur, dig)}</div>
          </div>
          <div className="flex p-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
            {[year - 1, year, year + 1].filter((y) => y <= new Date().getFullYear()).map((y) => (
              <button key={y} onClick={() => setYear(y)} className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${y === year ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)]"}`}>{y}</button>
            ))}
          </div>
          <button onClick={onHistory} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Історія операцій <ArrowRight size={12} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["Надійшло", inc, "#4ade80"], ["Пішло", out, "#fb923c"], ["Різниця", inc - out, inc - out < 0 ? "#f87171" : "var(--text)"]].map(([l, v, c]) => (
            <div key={l as string} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{l} · {year}</div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: c as string }}>{fmtMoney(v as number, cur, dig)}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2">
            По місяцях · {n} операцій
            <span className="ml-auto flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[#4ade80]" />надійшло</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[#fb923c]" />пішло</span>
          </div>
          <div className="grid grid-cols-12 gap-1.5 h-36 items-end">
            {months.map((m, i) => (
              <div key={i} className="flex flex-col items-center gap-1 h-full justify-end" title={`${MONTHS[i]}: +${fmtMoney(m.inc, cur, dig)} / −${fmtMoney(m.out, cur, dig)}`}>
                <div className="flex items-end gap-0.5 w-full h-full justify-center">
                  <div className="w-2.5 rounded-t" style={{ height: `${(m.inc / max) * 100}%`, minHeight: m.inc ? 2 : 0, background: "#4ade80" }} />
                  <div className="w-2.5 rounded-t" style={{ height: `${(m.out / max) * 100}%`, minHeight: m.out ? 2 : 0, background: "#fb923c" }} />
                </div>
                <span className="text-[9px] text-[var(--text-dim)]">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Top title="Звідки прийшло" rows={top(src)} total={inc} color="#4ade80" cur={cur} dig={dig} />
          <Top title="Куди пішло" rows={top(dst)} total={out} color="#fb923c" cur={cur} dig={dig} />
        </div>
      </div>
    </Modal>
  );
}

function Top({ title, rows, total, color, cur, dig }: { title: string; rows: [string, number][]; total: number; color: string; cur: string; dig: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-2">{title}</div>
      {!rows.length && <div className="text-xs text-[var(--text-dim)]">—</div>}
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="flex items-center gap-2 text-xs"><span className="truncate flex-1 text-[var(--text)]">{k}</span><span className="tabular-nums text-[var(--text-muted)]">{fmtMoney(v, cur, dig)}</span></div>
            <div className="mt-0.5 h-1 rounded-full bg-white/[0.05] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${total ? (v / total) * 100 : 0}%`, background: color }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
