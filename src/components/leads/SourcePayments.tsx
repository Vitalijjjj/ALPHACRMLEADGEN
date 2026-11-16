"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Clock, ExternalLink, Wallet } from "lucide-react";
import { fmtMoney } from "@/lib/finance";

interface StageRow { id: string; idx: number; title: string | null; amount: number; dueDate: string | null; paidAt: string | null }
const d = (iso: string) => new Date(iso).toLocaleDateString("uk-UA");

// «Підписка» / «Апсейл»: the payment stages of the project the deal came from — which are paid, which are not.
export default function SourcePayments({ project, onOpen }: { project: { id: string; number: number; amount?: number | null; currency?: string | null }; onOpen: () => void }) {
  const q = useQuery({
    queryKey: ["deal-payments", project.id],
    queryFn: async (): Promise<StageRow[]> => { const r = await fetch(`/api/leads/${project.id}/payments`); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
  });
  const cur = project.currency ?? "EUR";
  const rows = q.data ?? [];
  const paid = rows.filter((x) => x.paidAt).reduce((a, x) => a + x.amount, 0);
  const total = project.amount || rows.reduce((a, x) => a + x.amount, 0);
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 pt-3 pb-3">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.05]">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"><Wallet size={12} /> Оплати проєкту #{project.number}</h3>
        <button onClick={onOpen} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--accent)] hover:bg-white/[0.05] cursor-pointer">Проєкт <ExternalLink size={11} /></button>
      </div>
      {q.isLoading ? <div className="py-2 text-xs text-[var(--text-dim)]">Завантаження…</div>
        : !rows.length ? <div className="py-2 text-xs text-[var(--text-dim)]">{q.isError ? "Немає доступу до оплат проєкту" : "Етапів оплат у проєкті немає"}</div>
        : (
          <div className="space-y-1" data-private="amount">
            {rows.map((x, i) => (
              <div key={x.id} className="flex items-center gap-2 text-xs py-1">
                {x.paidAt ? <CircleCheck size={13} className="text-[#4ade80] shrink-0" /> : <Clock size={13} className="text-[#fbbf24] shrink-0" />}
                <span className="flex-1 min-w-0 truncate text-[var(--text)]">{x.title || `Етап ${i + 1}`}</span>
                <span className="text-[var(--text-dim)] shrink-0">{x.paidAt ? `оплачено ${d(x.paidAt)}` : x.dueDate ? `до ${d(x.dueDate)}` : "не оплачено"}</span>
                <span className="w-24 text-right tabular-nums font-medium shrink-0" style={{ color: x.paidAt ? "#4ade80" : "#fbbf24" }}>{fmtMoney(x.amount, cur)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1.5 mt-1 border-t border-white/[0.05] text-[11px] text-[var(--text-dim)]">
              <span>Оплачено {rows.filter((x) => x.paidAt).length} з {rows.length}</span>
              <span className="tabular-nums">{fmtMoney(paid, cur)} / {fmtMoney(total, cur)}</span>
            </div>
          </div>
        )}
    </section>
  );
}
