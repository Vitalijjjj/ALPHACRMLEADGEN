"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import StageMoveDialog from "@/components/tasks/StageMoveDialog";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { getFunnel } from "@/lib/crmSettings";
import { BELL_KEY } from "@/components/tasks/useTaskActions";
import { fmtDue, type TaskItem } from "@/components/tasks/taskUtils";

interface GuardLead { id: string; status: string; funnelId: string | null }

interface Guard {
  lead: GuardLead;
  to: string;
  tasks: TaskItem[];
  proceed: (status: string) => void;
}

// Moving FORWARD while tasks of the current stage are not done → «стоп, у тебе N незроблених задач».
// Moving back or closing as lost never asks.
// Tick them right there; when all are ticked the usual «Змінити стадію на …» dialog shows up.
export function useStageGuard(onChanged?: () => void) {
  const qc = useQueryClient();
  const { settings } = useCrmSettings();
  const [g, setG] = useState<Guard | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function guard(lead: GuardLead, to: string, proceed: (status: string) => void) {
    if (to === lead.status) return;
    const funnel = getFunnel(settings, lead.funnelId);
    // closing as lost does not need the stage tasks
    if (funnel.stages.find((s) => s.id === to)?.kind === "loss") return proceed(to);
    // moving BACK (e.g. «Передоплата» → «Не відповідає») — the tasks of this stage are not needed, they are just removed
    const pos = (id: string) => funnel.stages.findIndex((s) => s.id === id);
    if (pos(lead.status) !== -1 && pos(to) !== -1 && pos(to) < pos(lead.status)) return proceed(to);
    let open: TaskItem[] = [];
    try {
      const res = await fetch(`/api/tasks?leadId=${lead.id}&open=1`);
      if (res.ok) open = ((await res.json()) as TaskItem[]).filter((t) => t.autoStage === lead.status);
    } catch {
      /* no connection → do not block the move */
    }
    if (!open.length) return proceed(to);
    setDone(new Set());
    setG({ lead, to, tasks: open, proceed });
  }

  async function tick(t: TaskItem) {
    const on = !done.has(t.id);
    setDone((d) => { const n = new Set(d); if (on) n.add(t.id); else n.delete(t.id); return n; });
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: on ? "DONE" : "TODO" }),
    });
    qc.invalidateQueries({ queryKey: BELL_KEY });
    onChanged?.();
  }

  function go(status: string) {
    const cur = g;
    setG(null);
    cur?.proceed(status);
  }

  let modal: ReactNode = null;
  if (g) {
    const funnel = getFunnel(settings, g.lead.funnelId);
    const from = funnel.stages.find((s) => s.id === g.lead.status);
    const to = funnel.stages.find((s) => s.id === g.to);
    const left = g.tasks.filter((t) => !done.has(t.id)).length;

    modal = left === 0 ? (
      <StageMoveDialog
        funnel={funnel}
        currentId={g.lead.status}
        targetId={g.to}
        doneTitle="Усі задачі стадії виконано"
        allDone
        busy={false}
        onMove={go}
        onClose={() => setG(null)}
      />
    ) : (
      <Modal open onClose={() => setG(null)} title="Стоп, є незроблені задачі" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 px-3 py-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08]">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text)] leading-snug">
              На стадії <b style={{ color: from?.color }}>«{from?.label ?? g.lead.status}»</b> ще{" "}
              <b>{left} {left === 1 ? "незроблена задача" : left < 5 ? "незроблені задачі" : "незроблених задач"}</b>.
              {left === 1 ? "Ти її зробив? Відміть" : "Ти їх зробив? Відміть"} — і можна переходити{to ? <> на <b style={{ color: to.color }}>«{to.label}»</b></> : null}.
            </p>
          </div>

          <div className="space-y-1.5">
            {g.tasks.map((t) => {
              const on = done.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => tick(t)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${on ? "border-green-500/30 bg-green-500/[0.07]" : "border-[var(--border)] bg-[var(--surface-2)] hover:border-white/20"}`}
                >
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${on ? "bg-[#22c55e] border-[#22c55e]" : "border-[var(--border)]"}`}>
                    {on && <Check size={12} strokeWidth={3} className="text-black" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm truncate ${on ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>{t.title}</span>
                    {t.deadline && !on && <span className="block text-[11px] text-[var(--text-dim)]">{fmtDue(t.deadline)}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* progress */}
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-[#22c55e] transition-[width] duration-300"
              style={{ width: `${((g.tasks.length - left) / g.tasks.length) * 100}%` }} />
          </div>

          <button disabled className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-[var(--border)] text-[var(--text-dim)] cursor-not-allowed">
            Відміть задачі ({g.tasks.length - left} з {g.tasks.length}) <ArrowRight size={15} />
          </button>
          <button
            onClick={() => go(g.to)}
            className="w-full text-[11px] text-[var(--text-dim)] hover:text-[var(--text-muted)] cursor-pointer"
            title="Незроблені задачі цієї стадії буде прибрано"
          >
            Перейти без них (задачі стадії буде прибрано)
          </button>
        </div>
      </Modal>
    );
  }

  return { guard, modal, open: !!g };
}
