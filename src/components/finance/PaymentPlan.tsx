"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format } from "date-fns";
import { ArrowRight, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { toastError } from "@/components/ui/toast";
import { fmtMoney, type StageLike } from "@/lib/finance";
import { localDate } from "@/components/tasks/taskUtils";
import { groupNum, numText, parseNum } from "@/lib/numInput";

interface Draft { id?: string; title: string; amount: string; dueDate: string }

// «Етапи оплат» in a sales deal (funnels without payments): only the plan — how many payments, how much, when.
// A business process into «Операційка» carries these stages over to the new deal.
export default function PaymentPlan({ lead, canEdit, target }: {
  lead: { id: string; amount: number | null; currency: string | null };
  canEdit: boolean;
  target: string; // name of the funnel the stages go to
}) {
  const qc = useQueryClient();
  const key = ["deal-payments", lead.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<StageLike[]> => (await fetch(`/api/leads/${lead.id}/payments`)).json(),
  });
  const stages = q.data ?? [];
  const cur = lead.currency ?? "EUR";
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [saving, setSaving] = useState(false);

  // n equal parts of the deal amount, monthly from today (keeps titles / dates already typed)
  function split(n: number, base: Draft[] = draft ?? []): Draft[] {
    const total = lead.amount ?? 0;
    const part = Math.floor((total / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) => ({
      id: base[i]?.id,
      title: base[i]?.title ?? "",
      amount: total ? numText(i === n - 1 ? Math.round((total - part * (n - 1)) * 100) / 100 : part) : base[i]?.amount ?? "",
      dueDate: base[i]?.dueDate || localDate(addMonths(new Date(), i)),
    }));
  }
  const start = (n?: number) => {
    const base = stages.map((x) => ({ id: x.id, title: x.title ?? "", amount: numText(x.amount), dueDate: x.dueDate ? localDate(new Date(x.dueDate)) : "" }));
    setDraft(n ? split(n, base) : base.length ? base : split(2, []));
  };
  const set = (i: number, patch: Partial<Draft>) => setDraft((d) => d && d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/payments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: draft.map((d) => ({ id: d.id, title: d.title, amount: parseNum(d.amount) || 0, dueDate: d.dueDate ? new Date(`${d.dueDate}T12:00`).toISOString() : null })) }),
      });
      if (!res.ok) return toastError(res.status === 403 ? "Немає права редагувати цю угоду" : "Не вдалося зберегти етапи");
      qc.setQueryData(key, await res.json());
      setDraft(null);
    } finally {
      setSaving(false);
    }
  }

  const sum = (draft ?? []).reduce((a, d) => a + (parseNum(d.amount) || 0), 0);
  const planned = stages.reduce((a, x) => a + x.amount, 0);
  const counts = [1, 2, 3, 4];

  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 pt-3 pb-3">
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-white/[0.05]">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mr-auto"><CalendarClock size={12} /> Етапи оплат</h3>
        {canEdit && !draft && stages.length > 0 && (
          <button onClick={() => start()} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer"><Pencil size={11} /> Змінити</button>
        )}
      </div>

      {!draft ? (
        stages.length ? (
          <div className="space-y-1">
            {stages.map((x, i) => (
              <div key={x.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[var(--surface-2)] border border-white/[0.04]">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 text-[#38bdf8] bg-[#38bdf8]/15">{i + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmtMoney(x.amount, cur)}{x.title && <span className="text-xs font-normal text-[var(--text-dim)]"> · {x.title}</span>}</span>
                <span className="text-[11px] text-[var(--text-dim)] tabular-nums">{x.dueDate ? `до ${format(new Date(x.dueDate), "dd.MM.yyyy")}` : "без дати"}</span>
              </div>
            ))}
            {lead.amount && Math.abs(planned - lead.amount) > 0.01 ? (
              <div className="pt-1 text-[11px] text-amber-400">Етапи {fmtMoney(planned, cur)} ≠ сума угоди {fmtMoney(lead.amount, cur)}</div>
            ) : null}
          </div>
        ) : canEdit ? (
          <div>
            <div className="text-xs text-[var(--text-dim)] mb-2">На скільки платежів ділимо{lead.amount ? ` ${fmtMoney(lead.amount, cur)}` : ""}?</div>
            <div className="flex gap-1.5">
              {counts.map((n) => (
                <button key={n} onClick={() => start(n)} className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[#38bdf8]/50 hover:bg-[#38bdf8]/[0.06] cursor-pointer transition-colors">{n}</button>
              ))}
            </div>
          </div>
        ) : <div className="text-xs text-[var(--text-dim)]">Етапи не задано</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-dim)] mr-1">Платежів:</span>
            {counts.map((n) => (
              <button key={n} onClick={() => setDraft(split(n))}
                className={`w-10 py-2 sm:w-8 sm:py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${draft.length === n ? "bg-[#38bdf8]/15 text-[#38bdf8]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05]"}`}>{n}</button>
            ))}
          </div>
          {draft.map((d, i) => (
            <div key={d.id ?? `n${i}`} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
              <span className="w-5 text-[11px] text-[var(--text-dim)] tabular-nums">{i + 1}</span>
              <input value={d.amount} inputMode="decimal" onChange={(e) => set(i, { amount: groupNum(e.target.value) })} placeholder="0"
                className="flex-1 min-w-0 sm:flex-none sm:w-28 px-2 py-2 sm:py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-base sm:text-sm tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]" />
              <input type="date" value={d.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })}
                className="flex-1 min-w-0 px-2 py-2 sm:py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]" style={{ colorScheme: "dark" }} />
              <input value={d.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Етап"
                className="max-sm:order-2 max-sm:basis-full max-sm:ml-[26px] max-sm:mr-[42px] sm:w-24 px-2 py-2 sm:py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]" />
              <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="max-sm:order-1 w-9 h-9 sm:w-auto sm:h-auto flex items-center justify-center sm:p-1 text-[var(--text-dim)] hover:text-red-400 cursor-pointer" aria-label="Прибрати"><Trash2 size={12} /></button>
            </div>
          ))}
          <button onClick={() => setDraft([...draft, { title: "", amount: "", dueDate: localDate(addMonths(new Date(), draft.length)) }])}
            className="flex items-center gap-1 py-2 sm:py-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><Plus size={11} /> Ще етап</button>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className={`max-sm:basis-full text-[11px] tabular-nums ${lead.amount && Math.abs(sum - lead.amount) > 0.01 ? "text-amber-400" : "text-[var(--text-dim)]"}`}>
              Разом {fmtMoney(sum, cur)}{lead.amount ? ` з ${fmtMoney(lead.amount, cur)}` : ""}
            </span>
            <button onClick={() => setDraft(null)} className="ml-auto max-sm:ml-0 max-sm:flex-1 px-3 py-2.5 sm:py-1.5 rounded-lg text-sm sm:text-xs text-[var(--text-muted)] max-sm:border max-sm:border-[var(--border)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
            <button onClick={save} disabled={saving} className="max-sm:flex-[2] px-3 py-2.5 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold text-black cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)" }}>Зберегти</button>
          </div>
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
        <ArrowRight size={10} /> при передачі в «{target}» етапи перейдуть у його графік оплат
      </div>
    </section>
  );
}
