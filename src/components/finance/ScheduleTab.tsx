"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Briefcase, CalendarClock, CalendarPlus, FileText, Globe, Trash2 } from "lucide-react";
import { CURRENCIES, STAGE_STATUS, fmtMoney, projectTitle, stageStatus, type StageStatus } from "@/lib/finance";
import { Modal } from "@/components/ui/modal";
import { ask } from "@/components/ui/dialogs";
import { toast, toastError } from "@/components/ui/toast";
import { localDate } from "@/components/tasks/taskUtils";
import Select from "@/components/finance/Select";
import { CUR_SYM } from "@/components/finance/AccountIcon";
import { StageInvoiceModal, type InvoicePrefill } from "@/components/finance/Requisites";
import { leadDisplayName } from "@/lib/leadOptions";
import { useFx } from "@/lib/useFx";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { getFunnel, resolveStage } from "@/lib/crmSettings";
import TxModal from "@/components/finance/TxModal";
import { SCHEDULE_KEY, rowCurrency, useDeals, type ScheduleRow } from "@/components/finance/useFinance";
import ListPager, { usePager } from "@/components/ui/ListPager";
import { groupNum } from "@/lib/numInput";

// «Графік оплат»: every planned payment of every deal — who owes, what is overdue, what comes in soon.
export default function ScheduleTab({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { fx } = useFx();
  const { settings } = useCrmSettings();
  const q = useQuery({
    queryKey: SCHEDULE_KEY,
    queryFn: async (): Promise<ScheduleRow[]> => {
      const res = await fetch("/api/finance/schedule");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });
  const [filter, setFilter] = useState<StageStatus | "unpaid" | "all">("unpaid");
  const [pay, setPay] = useState<ScheduleRow | null>(null);
  const [plan, setPlan] = useState(false);
  const [invoice, setInvoice] = useState<InvoicePrefill | null>(null);
  const qc = useQueryClient();
  const [now] = useState(() => Date.now());

  const rows = q.data ?? [];
  const uah = (r: ScheduleRow) => {
    const c = rowCurrency(r);
    return c === "UAH" ? r.amount : r.amount * (c === "EUR" ? fx.eurUah : fx.usdUah);
  };
  const by = (st: StageStatus) => rows.filter((r) => stageStatus(r) === st);
  const owed = rows.filter((r) => !r.paidAt);

  const shown = rows.filter((r) => {
    const st = stageStatus(r);
    return filter === "all" || (filter === "unpaid" ? st !== "paid" : st === filter);
  });
  // overdue first
  const order: Record<StageStatus, number> = { overdue: 0, soon: 1, future: 2, paid: 3 };
  shown.sort((a, b) => order[stageStatus(a)] - order[stageStatus(b)]);
  const pager = usePager(shown, "schedule");

  async function removePlanned(r: ScheduleRow) {
    if (!(await ask(`Видалити заплановану оплату ${fmtMoney(r.amount, rowCurrency(r))}${r.payer ? ` від «${r.payer}»` : ""}?`, { danger: true, confirmLabel: "Видалити" }))) return;
    const res = await fetch(`/api/finance/schedule?id=${r.id}`, { method: "DELETE" });
    if (!res.ok) return toastError("Не вдалося видалити");
    qc.invalidateQueries({ queryKey: SCHEDULE_KEY });
  }

  const chips: { key: typeof filter; label: string; n: number; color: string }[] = [
    { key: "unpaid", label: "Неоплачені", n: owed.length, color: "#C98C0A" },
    { key: "overdue", label: STAGE_STATUS.overdue.label, n: by("overdue").length, color: STAGE_STATUS.overdue.color },
    { key: "soon", label: "Очікуємо (14 днів)", n: by("soon").length, color: STAGE_STATUS.soon.color },
    { key: "future", label: STAGE_STATUS.future.label, n: by("future").length, color: STAGE_STATUS.future.color },
    { key: "paid", label: STAGE_STATUS.paid.label, n: by("paid").length, color: STAGE_STATUS.paid.color },
    { key: "all", label: "Усі", n: rows.length, color: "#94a3b8" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><CalendarClock size={17} /></div>
        <h1 className="text-lg font-semibold text-[var(--text)] mr-auto">Графік оплат</h1>
        <button onClick={() => setPlan(true)}
          className="flex items-center gap-1.5 px-3 md:px-3.5 py-2 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 transition-[filter]" style={{ background: "var(--accent)" }}>
          <CalendarPlus size={15} /> <span className="md:hidden">Запланувати</span><span className="hidden md:inline">Запланувати оплату</span>
        </button>
      </div>

      <div className="flex md:flex-wrap gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar -mx-3 px-3 md:mx-0 md:px-0">
        {chips.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-2 md:py-1.5 rounded-lg border text-xs cursor-pointer transition-colors"
            style={filter === c.key ? { borderColor: c.color, color: c.color, background: `${c.color}17` } : { borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />{c.label}<span className="opacity-60 tabular-nums">{c.n}</span>
          </button>
        ))}
        <span className="hidden md:inline ml-auto self-center text-[11px] text-[var(--text-dim)]">Суми в гривні за курсом НБУ {fx.date}</span>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {/* phone: a card per payment — project, stage, amount, date, status + «Внести» / «Invoice» */}
        <div className="md:hidden divide-y divide-white/[0.05]">
          {q.isLoading && <div className="py-12 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
          {!q.isLoading && !shown.length && (
            <div className="py-12 px-4 text-center text-sm text-[var(--text-muted)]">
              {rows.length ? "Нічого в цьому фільтрі" : "Запланованих оплат ще немає — натисни «Запланувати»"}
            </div>
          )}
          {pager.visible.map((r) => {
            const st = stageStatus(r);
            const m = STAGE_STATUS[st];
            const cur = rowCurrency(r);
            const stage = r.lead ? resolveStage(settings, r.lead).stage : null;
            const days = r.dueDate ? Math.round((new Date(r.dueDate).getTime() - now) / 86_400_000) : null;
            const whenD = st === "paid" && r.paidAt ? new Date(r.paidAt) : r.dueDate ? new Date(r.dueDate) : null;
            const when = whenD ? format(whenD, whenD.getFullYear() === new Date(now).getFullYear() ? "dd.MM" : "dd.MM.yy") : "без дати";
            return (
              <div key={r.id} className="px-3.5 py-3 border-l-2" style={{ borderLeftColor: m.color }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {r.lead && stage ? (
                      <button onClick={() => onOpenLead(r.lead!.id)} className="flex items-center gap-1.5 max-w-full text-sm font-medium text-[var(--text)] active:text-[var(--accent)] cursor-pointer text-left">
                        <Briefcase size={12} className="shrink-0 text-[var(--text-dim)]" /><span className="truncate">{projectTitle(r.lead)}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]"><Globe size={12} className="shrink-0 text-[var(--text-dim)]" /><span className="truncate">{r.payer || "Без проєкту"}</span></div>
                    )}
                    <div className="text-[11px] truncate text-[var(--text-muted)]">
                      {r.title || `${r.idx + 1}-й платіж`}
                      {r.lead && stage ? <span style={{ color: stage.color }}> · {leadDisplayName(r.lead)} · {stage.label}</span> : r.note ? ` · ${r.note}` : ""}
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="text-[15px] font-semibold text-[var(--text)]">{fmtMoney(r.amount, cur)}</div>
                    {cur !== "UAH" && <div className="text-[10px] text-[var(--text-dim)]">≈ {fmtMoney(uah(r))}</div>}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0" style={{ color: m.color, background: `${m.color}17` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />{m.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)] truncate">
                    {when}
                    {st === "overdue" && days !== null && <span className="text-red-400"> · на {Math.abs(days)} дн.</span>}
                    {st === "soon" && days !== null && <span className="text-yellow-400"> · {days === 0 ? "сьогодні" : `через ${days} дн.`}</span>}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {!r.lead && (
                      <button onClick={() => removePlanned(r)} aria-label="Видалити" className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-dim)] active:text-red-400 active:bg-white/[0.05] cursor-pointer"><Trash2 size={14} /></button>
                    )}
                    {st !== "paid" && (
                      <>
                        <button onClick={() => setInvoice({ amount: r.amount, currency: cur, payer: r.lead ? r.lead.payer || projectTitle(r.lead) : r.payer ?? undefined, item: r.title ?? undefined })}
                          aria-label="Запросити етап — створити інвойс" className="h-9 px-2.5 flex items-center gap-1 rounded-lg text-xs font-semibold text-black cursor-pointer" style={{ background: "#eab308" }}>
                          <FileText size={13} /> Invoice
                        </button>
                        <button onClick={() => setPay(r)} className="h-9 px-3.5 rounded-lg text-xs font-semibold text-black cursor-pointer" style={{ background: "#22c55e" }}>Внести</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)] bg-white/[0.015]">
                <th className="text-left font-medium py-2.5 pl-4 pr-3">Угода</th>
                <th className="text-left font-medium py-2.5 pr-3 w-[120px]">Етап</th>
                <th className="text-right font-medium py-2.5 pr-4 w-[140px]">Сума</th>
                <th className="text-left font-medium py-2.5 pr-3 w-[130px]">Дата оплати</th>
                <th className="text-left font-medium py-2.5 pr-3 w-[130px]">Статус</th>
                <th className="w-[190px]" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">Завантаження…</td></tr>}
              {!q.isLoading && !shown.length && (
                <tr><td colSpan={6} className="py-14 text-center text-sm text-[var(--text-muted)]">
                  {rows.length ? "Нічого в цьому фільтрі" : "Запланованих оплат ще немає — натисни «Запланувати оплату»"}
                </td></tr>
              )}
              {pager.visible.map((r) => {
                const st = stageStatus(r);
                const m = STAGE_STATUS[st];
                const cur = rowCurrency(r);
                const stage = r.lead ? resolveStage(settings, r.lead).stage : null;
                const days = r.dueDate ? Math.round((new Date(r.dueDate).getTime() - now) / 86_400_000) : null;
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors">
                    <td className="py-2 pl-4 pr-3 max-w-[280px]">
                      {r.lead && stage ? (
                        <>
                          <button onClick={() => onOpenLead(r.lead!.id)} className="flex items-center gap-1.5 max-w-full text-[var(--text)] hover:text-[var(--accent)] cursor-pointer text-left">
                            <Briefcase size={12} className="shrink-0 text-[var(--text-dim)]" /><span className="truncate">{projectTitle(r.lead)}</span>
                          </button>
                          <div className="text-[11px] truncate" style={{ color: stage.color }}>{leadDisplayName(r.lead)} · {getFunnel(settings, r.lead.funnelId).name} · {stage.label}</div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 text-[var(--text)]"><Globe size={12} className="shrink-0 text-[var(--text-dim)]" /><span className="truncate">{r.payer || "Без проєкту"}</span></div>
                          <div className="text-[11px] truncate text-[var(--text-dim)]">без проєкту{r.note ? ` · ${r.note}` : ""}</div>
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">{r.title || `${r.idx + 1}-й платіж`}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <div className="font-semibold text-[var(--text)]">{fmtMoney(r.amount, cur)}</div>
                      {cur !== "UAH" && <div className="text-[10px] text-[var(--text-dim)]">≈ {fmtMoney(uah(r))}</div>}
                    </td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-[var(--text-muted)]">
                      {st === "paid" && r.paidAt ? format(new Date(r.paidAt), "dd.MM.yyyy") : r.dueDate ? format(new Date(r.dueDate), "dd.MM.yyyy") : "—"}
                      {st === "overdue" && days !== null && <div className="text-[10px] text-red-400">на {Math.abs(days)} дн.</div>}
                      {st === "soon" && days !== null && <div className="text-[10px] text-yellow-400">{days === 0 ? "сьогодні" : `через ${days} дн.`}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ color: m.color, background: `${m.color}17` }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />{m.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {st !== "paid" && (
                          <>
                            <button onClick={() => setInvoice({ amount: r.amount, currency: cur, payer: r.lead ? r.lead.payer || projectTitle(r.lead) : r.payer ?? undefined, item: r.title ?? undefined })}
                              title="Запросити етап — створити інвойс" className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "#eab308" }}>
                              <FileText size={11} /> Invoice
                            </button>
                            <button onClick={() => setPay(r)} className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "#22c55e" }}>
                              Внести
                            </button>
                          </>
                        )}
                        {!r.lead && (
                          <button onClick={() => removePlanned(r)} title="Видалити заплановану оплату" aria-label="Видалити"
                            className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-red-400 hover:bg-white/[0.05] cursor-pointer"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ListPager pager={pager} noun="платежів" />
      </div>

      <TxModal
        open={!!pay}
        onClose={() => setPay(null)}
        lead={pay?.lead ? { id: pay.lead.id, number: pay.lead.number, name: pay.lead.name, phone: pay.lead.phone, currency: pay.lead.currency } : null}
        stages={pay ? (pay.lead ? rows.filter((r) => r.leadId === pay.leadId) : [pay]) : []}
        preset={pay ? { kind: "income", amount: pay.amount, currency: rowCurrency(pay), stageId: pay.id, comment: pay.lead ? undefined : [pay.payer, pay.title].filter(Boolean).join(" · ") || undefined } : undefined}
      />
      {plan && <PlanPaymentModal onClose={() => setPlan(false)} />}
      {invoice && <StageInvoiceModal prefill={invoice} onClose={() => setInvoice(null)} />}
    </div>
  );
}

// «Запланувати оплату»: a future payment of a project (its next stage) or a general one without a project.
function PlanPaymentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const dealsQ = useDeals();
  const deals = dealsQ.data ?? [];
  const [withProject, setWithProject] = useState(true);
  const [leadId, setLeadId] = useState("");
  const deal = deals.find((d) => d.id === leadId);
  const [amount, setAmount] = useState("");
  const [cur, setCur] = useState("EUR");
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return localDate(d); });
  const [title, setTitle] = useState("");
  const [payer, setPayer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const currency = withProject && deal ? deal.currency ?? "EUR" : cur;
  const field = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";
  const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";

  async function submit() {
    const n = Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;
    if (withProject && !leadId) return toastError("Вибери проєкт");
    if (!(n > 0)) return toastError("Вкажи суму");
    setBusy(true);
    try {
      const res = await fetch("/api/finance/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: withProject ? leadId : null, amount: n, currency, title, note,
          payer: withProject ? null : payer, dueDate: date ? new Date(`${date}T12:00`).toISOString() : null,
        }),
      });
      if (!res.ok) return toastError((await res.json().catch(() => null))?.error ?? "Не вдалося зберегти");
      qc.invalidateQueries({ queryKey: SCHEDULE_KEY });
      if (withProject) qc.invalidateQueries({ queryKey: ["deal-payments", leadId] });
      toast({ kind: "success", title: "Оплату заплановано", text: `${fmtMoney(n, currency)}${date ? ` · ${format(new Date(`${date}T12:00`), "dd.MM.yyyy")}` : ""}`, duration: 3000 });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Запланувати оплату" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          {([[true, "До проєкту", Briefcase], [false, "Без проєкту", Globe]] as const).map(([v, l, I]) => (
            <button key={l} onClick={() => setWithProject(v)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${withProject === v ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
              <I size={14} /> {l}
            </button>
          ))}
        </div>

        {withProject ? (
          <div>
            <span className={label}>Проєкт</span>
            <Select value={leadId} onChange={setLeadId} searchable placeholder={dealsQ.isLoading ? "Завантаження…" : "— вибери проєкт —"}
              options={deals.map((d) => ({ value: d.id, label: projectTitle(d), sub: d.name }))} />
          </div>
        ) : (
          <div>
            <span className={label}>Від кого</span>
            <input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Клієнт / компанія" className={field} />
          </div>
        )}

        <div>
          <span className={label}>Дата · сума · валюта</span>
          <div className="flex items-stretch rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)] overflow-hidden">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[132px] sm:w-[150px] px-2.5 sm:px-3 py-2.5 bg-transparent text-sm text-[var(--text)] outline-none border-r border-[var(--border)]" style={{ colorScheme: "dark" }} />
            <input autoFocus value={amount} onChange={(e) => setAmount(groupNum(e.target.value))} inputMode="decimal" placeholder="0"
              className="flex-1 min-w-0 px-3 py-2.5 bg-transparent text-lg font-semibold tabular-nums text-[var(--text)] outline-none" />
            {withProject && deal ? (
              <span className="px-3 flex items-center text-sm text-[var(--text-muted)] border-l border-[var(--border)]">{CUR_SYM[currency] ?? currency} {currency}</span>
            ) : (
              <div className="flex items-center gap-0.5 px-1.5 border-l border-[var(--border)]">
                {CURRENCIES.map((c) => (
                  <button key={c} onClick={() => setCur(c)} className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer ${cur === c ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{CUR_SYM[c]}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className={label}>Назва етапу</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Передоплата, 2-й етап…" className={field} />
          </div>
          <div>
            <span className={label}>Коментар</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необов'язково" className={field} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button onClick={submit} disabled={busy} className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            <CalendarPlus size={15} /> Запланувати
          </button>
        </div>
      </div>
    </Modal>
  );
}
