"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";
import { AlertTriangle, ArrowRight, Check, FileText, Minus, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toastError } from "@/components/ui/toast";
import { STAGE_STATUS, TX_META, fmtMoney, paymentSummary, projectMoney, stageStatus, type StageLike, type TxKind } from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";
import { useFx } from "@/lib/useFx";
import TxModal, { type TxLead } from "@/components/finance/TxModal";
import { StageInvoiceModal, type InvoicePrefill } from "@/components/finance/Requisites";
import { PROJECTS_KEY, SCHEDULE_KEY, TX_KEY, useFinance, useTransactions } from "@/components/finance/useFinance";
import { groupNum, numText } from "@/lib/numInput";

interface Draft { id?: string; title: string; amount: string; dueDate: string; paidAt: string | null }

// «Оплати» in a deal card (only in funnels with payments switched on, e.g. «Операційка»):
// deal amount → split into N payments with dates → «Внести» records the money in the journal.
// mode «summary» — read-only fields on the «Загальне» tab; «full» — the «Оплати» tab of the card.
export default function DealPayments({
  lead,
  canEdit,
  onChanged,
  mode = "full",
  onOpen,
}: {
  lead: TxLead & { amount: number | null; currency: string | null; projectName?: string | null; payer?: string | null };
  canEdit: boolean;
  onChanged?: () => void;
  mode?: "summary" | "full";
  onOpen?: () => void;
}) {
  const qc = useQueryClient();
  const { fx } = useFx();
  const { fin } = useFinance();
  const cur = lead.currency ?? "EUR";
  const key = ["deal-payments", lead.id];
  const stagesQ = useQuery({
    queryKey: key,
    queryFn: async (): Promise<StageLike[]> => (await fetch(`/api/leads/${lead.id}/payments`)).json(),
  });
  const txQ = useTransactions(lead.id);
  const stages = stagesQ.data ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [pay, setPay] = useState<{ kind?: TxKind; stageId?: string; amount?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<InvoicePrefill | null>(null);

  const s = paymentSummary(stages, lead.amount);
  // money actually received for this deal (any income operation), in the deal currency
  const toCur = (uah: number) => (cur === "UAH" ? uah : uah / (cur === "EUR" ? fx.eurUah : fx.usdUah));
  const incomes = (txQ.data ?? []).filter((t) => t.kind === "income");
  const received = incomes.reduce((sum, t) => sum + (t.currency === cur ? t.amount : toCur(t.amountUah)), 0);
  const total = lead.amount ?? s.planned;
  const left = Math.max(0, total - received);
  const pct = total > 0 ? Math.min(100, (received / total) * 100) : 0;
  // project economics (UAH): contract value − contractors − expenses on the project − 6% tax
  const ops = txQ.data ?? [];
  const pm = projectMoney(ops, fin);
  const valueUah = lead.amount ? (cur === "UAH" ? lead.amount : lead.amount * (cur === "EUR" ? fx.eurUah : fx.usdUah)) : 0;
  const contractProfit = valueUah - pm.costs - pm.tax;
  const margin = valueUah > 0 ? contractProfit / valueUah : null;

  function startEdit(n?: number) {
    const base: Draft[] = stages.map((x) => ({ id: x.id, title: x.title ?? "", amount: numText(x.amount), dueDate: x.dueDate ? localDate(new Date(x.dueDate)) : "", paidAt: x.paidAt }));
    setDraft(n ? split(n, base) : base.length ? base : split(2, []));
    setEditing(true);
  }

  // equal parts of the unpaid rest, monthly dates from today
  function split(n: number, cur: Draft[]): Draft[] {
    const paid = cur.filter((d) => d.paidAt);
    const restSum = Math.max(0, (lead.amount ?? 0) - paid.reduce((a, d) => a + (Number(String(d.amount).replace(/\s/g, "").replace(",", ".")) || 0), 0));
    const count = Math.max(1, n - paid.length);
    const part = Math.floor((restSum / count) * 100) / 100;
    const open = Array.from({ length: count }, (_, i) => {
      const old = cur.filter((d) => !d.paidAt)[i];
      return {
        id: old?.id,
        title: old?.title ?? "",
        amount: restSum ? String(i === count - 1 ? Math.round((restSum - part * (count - 1)) * 100) / 100 : part) : old?.amount ?? "",
        dueDate: old?.dueDate || localDate(addMonths(new Date(), i)),
        paidAt: null,
      };
    });
    return [...paid, ...open];
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/payments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: draft.map((d) => ({ id: d.id, title: d.title, amount: Number(String(d.amount).replace(/\s/g, "").replace(",", ".")), dueDate: d.dueDate ? new Date(`${d.dueDate}T12:00`).toISOString() : null })) }),
      });
      if (!res.ok) return toastError(res.status === 403 ? "Немає права редагувати цю угоду" : "Не вдалося зберегти графік");
      qc.setQueryData(key, await res.json());
      qc.invalidateQueries({ queryKey: SCHEDULE_KEY });
      setEditing(false);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  const draftSum = draft.reduce((a, d) => a + (Number(String(d.amount).replace(/\s/g, "").replace(",", ".")) || 0), 0);
  const unpaidCount = draft.filter((d) => !d.paidAt).length;

  // keep the stage list fresh after a payment is recorded
  useEffect(() => {
    if (!pay) qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay]);

  if (mode === "summary") {
    return (
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 pt-3 pb-3">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.05]">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"><Wallet size={12} /> Оплати</h3>
          {onOpen && (
            <button onClick={onOpen} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--accent)] hover:bg-white/[0.05] cursor-pointer">
              Відкрити оплати <ArrowRight size={11} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Сума угоди" value={lead.amount ? fmtMoney(lead.amount, cur) : "—"} />
          <Tile label="Оплачено" value={fmtMoney(received, cur)} color="#4ade80" />
          <Tile label="Залишилось" value={fmtMoney(left, cur)} color={left > 0 ? "#fbbf24" : "#4ade80"} />
          <Tile label="Наступний платіж" value={s.next ? fmtMoney(s.next.amount, cur) : stages.length ? "Все оплачено" : "—"}
            sub={s.next?.dueDate ? format(new Date(s.next.dueDate), "dd.MM.yyyy") : undefined}
            color={s.next && stageStatus(s.next) === "overdue" ? "#f87171" : undefined} />
        </div>
        <div className="mt-2.5 flex justify-between text-[10px] text-[var(--text-dim)]">
          <span>Платежів: <b className="text-[var(--text-muted)]">{s.paidCount} з {s.count || "—"}</b></span>
          {margin !== null && <span>Маржа <b className="text-[var(--text-muted)]">{Math.round(margin * 100)}%</b> · прибуток по касі <b className="text-[var(--text-muted)]">{fmtMoney(pm.cash)}</b></span>}
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 sm:px-5 pt-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-white/[0.05]">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <Wallet size={12} /> Оплати
        </h3>
        {canEdit && !editing && (
          <div className="flex items-center gap-1 max-sm:w-full max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center max-sm:[&>button]:h-9">
            {stages.length > 0 && (
              <button onClick={() => startEdit()} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer">
                <Pencil size={11} /> Графік
              </button>
            )}
            <button onClick={() => setPay({ kind: "contractor" })} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer"
              style={{ color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.28)" }}>
              <Minus size={11} /> Витрата
            </button>
            <button onClick={() => setPay({})} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer"
              style={{ color: "#4ade80", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <Plus size={11} /> Внести оплату
            </button>
          </div>
        )}
      </div>

      {/* technical fields */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label="Сума угоди" value={lead.amount ? fmtMoney(lead.amount, cur) : "—"} />
        <Tile label="Оплачено" value={fmtMoney(received, cur)} color="#4ade80" />
        <Tile label="Залишилось" value={fmtMoney(left, cur)} color={left > 0 ? "#fbbf24" : "#4ade80"} />
        <Tile
          label="Наступний платіж"
          value={s.next ? fmtMoney(s.next.amount, cur) : stages.length ? "Все оплачено" : "—"}
          sub={s.next?.dueDate ? format(new Date(s.next.dueDate), "dd.MM.yyyy") : undefined}
          color={s.next && stageStatus(s.next) === "overdue" ? "#f87171" : undefined}
        />
      </div>
      <div className="mt-2.5">
        <div className="flex justify-between text-[10px] text-[var(--text-dim)] mb-1">
          <span>Кількість платежів: <b className="text-[var(--text-muted)]">{s.paidCount} з {s.count || "—"}</b></span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#16a34a,#4ade80)" }} />
        </div>
      </div>
      {s.matchesTotal === false && stages.length > 0 && !editing && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle size={11} /> Графік {fmtMoney(s.planned, cur)} ≠ сума угоди {fmtMoney(lead.amount ?? 0, cur)}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1">Етапи оплат</div>
      {/* schedule */}
          {!editing ? (
            stages.length ? (
              <div className="mt-3 space-y-1">
                {stages.map((x) => {
                  const st = stageStatus(x);
                  const m = STAGE_STATUS[st];
                  return (
                    <div key={x.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[var(--surface-2)] border border-white/[0.04]">
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0" style={{ color: m.color, background: `${m.color}1f` }}>
                        {st === "paid" ? <Check size={11} strokeWidth={3} /> : x.idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium tabular-nums ${st === "paid" ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
                          {fmtMoney(x.amount, cur)} {x.title && <span className="text-xs font-normal text-[var(--text-dim)]">· {x.title}</span>}
                        </div>
                        <div className="text-[11px] text-[var(--text-dim)]">
                          {st === "paid" && x.paidAt ? `Отримано ${format(new Date(x.paidAt), "dd.MM.yyyy")}` : x.dueDate ? `до ${format(new Date(x.dueDate), "dd.MM.yyyy")}` : "Без дати"}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: m.color, background: `${m.color}1a` }}>{m.label}</span>
                      {st !== "paid" && (
                        <div className="flex gap-1.5 max-sm:w-full max-sm:pl-[30px] max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center max-sm:[&>button]:h-9">
                        <button onClick={() => setInvoice({ amount: x.amount, currency: cur, item: x.title ?? undefined, payer: lead.payer || lead.projectName || lead.name || undefined })}
                          title="Запросити етап — створити інвойс" className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "#eab308" }}>
                          <FileText size={11} /> Invoice
                        </button>
                        {canEdit && (
                          <button onClick={() => setPay({ stageId: x.id, amount: x.amount })}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "#22c55e" }}>
                            Внести
                          </button>
                        )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : canEdit ? (
              <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-center">
                <div className="text-xs text-[var(--text-muted)] mb-2">Розбити оплату на етапи</div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => startEdit(n)}
                      className="px-3 py-2.5 sm:py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer">
                      {n === 1 ? "1 платіж" : `${n} платежі`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-[var(--text-dim)]">Графік оплат не задано</div>
            )
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Кількість платежів</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDraft(split(Math.max(draft.filter((d) => d.paidAt).length + 1, draft.length - 1), draft))}
                    className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer" aria-label="Менше"><Minus size={12} /></button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums text-[var(--text)]">{draft.length}</span>
                  <button onClick={() => setDraft(split(Math.min(12, draft.length + 1), draft))}
                    className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer" aria-label="Більше"><Plus size={12} /></button>
                </div>
              </div>
              {draft.map((d, i) => (
                <div key={d.id ?? `n${i}`} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                  <span className="w-5 text-[11px] text-[var(--text-dim)] tabular-nums">{i + 1}</span>
                  <input value={d.amount} disabled={!!d.paidAt} inputMode="decimal" onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, amount: groupNum(e.target.value) } : x))}
                    className="flex-1 min-w-0 sm:flex-none sm:w-28 px-2 py-2 sm:py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-base sm:text-sm tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)] disabled:opacity-50" />
                  <input type="date" value={d.dueDate} disabled={!!d.paidAt} onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))}
                    className="flex-1 min-w-0 px-2 py-2 sm:py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] disabled:opacity-50" style={{ colorScheme: "dark" }} />
                  <input value={d.title} placeholder="Етап" onChange={(e) => setDraft(draft.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    className="max-sm:order-2 max-sm:basis-full max-sm:ml-[26px] max-sm:mr-[34px] sm:w-20 px-2 py-2 sm:py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                  {d.paidAt
                    ? <span className="max-sm:order-1 w-7 flex justify-center text-[#4ade80]" title="Оплачено"><Check size={13} /></span>
                    : <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="max-sm:order-1 w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-md text-[var(--text-dim)] hover:text-red-400 cursor-pointer" aria-label="Прибрати"><Trash2 size={12} /></button>}
                </div>
              ))}
              <div className={`text-[11px] tabular-nums ${lead.amount && Math.round(draftSum) !== Math.round(lead.amount) ? "text-amber-400" : "text-[var(--text-dim)]"}`}>
                Разом {fmtMoney(draftSum, cur)}{lead.amount ? ` із ${fmtMoney(lead.amount, cur)}` : " — сума угоди не вказана"}
                {unpaidCount > 0 && lead.amount ? (
                  <button onClick={() => setDraft(split(draft.length, draft))} className="ml-2 underline decoration-dotted cursor-pointer hover:text-[var(--text-muted)]">розбити порівну</button>
                ) : null}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg text-sm sm:text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
                <button onClick={saveDraft} disabled={saving} className="flex-[2] px-3 py-2.5 sm:py-2 rounded-lg text-sm sm:text-xs font-semibold text-black cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {saving ? "Зберігаю…" : "Зберегти графік"}
                </button>
              </div>
            </div>
          )}
    
            </div>
        <div>
      {/* project economics */}
          {(ops.length > 0 || valueUah > 0) && !editing && (
            <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                <span>Фінанси проєкту, ₴</span>
                {margin !== null && (
                  <span className="normal-case tracking-normal text-[11px] font-semibold tabular-nums" style={{ color: margin >= 0.5 ? "#4ade80" : margin >= 0.2 ? "#fbbf24" : "#f87171" }}>
                    маржа {Math.round(margin * 100)}%
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="Отримали" value={pm.income} color="#4ade80" />
                <Row label="Підрядники" value={-pm.contractor} />
                <Row label="Податок 6%" value={-pm.tax} />
                <Row label="Інші витрати" value={-pm.expense} />
                <Row label="Прибуток по касі" value={pm.cash} bold color={pm.cash >= 0 ? "#C98C0A" : "#f87171"} />
                {valueUah > 0 && <Row label="За контрактом" value={contractProfit} bold color={contractProfit >= 0 ? "#C98C0A" : "#f87171"} />}
              </div>
            </div>
          )}
    
          {ops.length > 0 && !editing && (
            <div className="mt-3 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1">Операції по проєкту · {ops.length}</div>
              {ops.slice(0, 60).map((t) => {
                const m = TX_META[t.kind as TxKind] ?? TX_META.expense;
                return (
                  <div key={t.id} className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]" title={m.label}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />
                    <span className="tabular-nums text-[var(--text-dim)]">{format(new Date(t.date), "dd.MM.yy")}</span>
                    <span className="flex-1 truncate">{t.comment ?? t.counterparty ?? m.label}</span>
                    <span className="tabular-nums" style={{ color: m.sign > 0 ? "#4ade80" : "#f87171" }}>{m.sign > 0 ? "+" : "−"}{fmtMoney(t.amount, t.currency)}</span>
                  </div>
                );
              })}
              {ops.length > 60 && <div className="text-[10px] text-[var(--text-dim)] pt-0.5">і ще {ops.length - 60} — усі в «P&L → Кешфлоу»</div>}
            </div>
          )}
    
            </div>
      </div>

      <TxModal
        open={!!pay}
        onClose={() => setPay(null)}
        lead={lead}
        stages={stages}
        preset={{ kind: pay?.kind ?? "income", amount: pay?.amount, currency: pay?.kind && pay.kind !== "income" ? "UAH" : cur, stageId: pay?.stageId }}
        onSaved={() => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: TX_KEY }); qc.invalidateQueries({ queryKey: PROJECTS_KEY }); onChanged?.(); }}
      />
      {invoice && <StageInvoiceModal prefill={invoice} onClose={() => setInvoice(null)} />}
    </section>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] border border-white/[0.04] px-2.5 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] truncate">{label}</div>
      <div className="text-sm font-semibold tabular-nums truncate" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-dim)] tabular-nums">{sub}</div>}
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: number; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className={`truncate ${bold ? "text-[var(--text)]" : "text-[var(--text-dim)]"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`} style={{ color: color ?? (value < 0 ? "var(--text-muted)" : "var(--text)") }}>{fmtMoney(value)}</span>
    </div>
  );
}
