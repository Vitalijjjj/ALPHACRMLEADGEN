"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Workflow, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import CalendarModal from "@/components/leads/CalendarModal";
import StageMoveDialog from "@/components/tasks/StageMoveDialog";
import { toast } from "@/components/ui/toast";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { getFunnel, LOSS_ID } from "@/lib/crmSettings";
import type { TaskPrompt } from "@/lib/taskAutomation";
import { fmtDue, type TaskItem, type TaskLead } from "@/components/tasks/taskUtils";
import { ask } from "@/components/ui/dialogs";

export const BELL_KEY = ["tasks-bell"];

type LeadRef = Pick<TaskLead, "id" | "status" | "funnelId"> & Partial<TaskLead>;

type Flow =
  | { step: "ask"; task: TaskItem; lead: LeadRef; prompt: TaskPrompt }
  | { step: "move"; task: TaskItem; lead: LeadRef; yesStageId: string | null; allDone?: boolean };


// Ticking tasks done / back, deleting, and the follow-up dialog of automatic tasks
// («Клієнт оплатив?» → «Так»: move the lead on; «Ні»: the next push is planned).
export function useTaskActions(onChanged: () => void) {
  const qc = useQueryClient();
  const { settings } = useCrmSettings();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [calendar, setCalendar] = useState<{ task: TaskItem; lead: TaskLead } | null>(null);
  const [busy, setBusy] = useState(false);

  function changed() {
    qc.invalidateQueries({ queryKey: BELL_KEY });
    onChanged();
  }

  async function setDone(task: TaskItem, lead: LeadRef | null | undefined, done: boolean) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: done ? "DONE" : "TODO" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) toast({ kind: "info", title: "Немає прав", text: data.error ?? "Твоя роль не дозволяє змінювати цю угоду" });
    changed();
    // the task ran a business process — the deal is already in the other funnel
    const tr = data?.transferred as { number: number; target: string; existed?: boolean } | null;
    if (done && tr) toast({ kind: "success", title: tr.existed ? `Уже передано в «${tr.target}»` : `Передано в «${tr.target}»`, text: `Угода #${tr.number}`, duration: 4000 });
    const prompt = data?.prompt as TaskPrompt | null;
    if (!done || !lead) return;
    follow(task, lead, prompt);
  }

  function follow(task: TaskItem, lead: LeadRef, prompt: TaskPrompt | null) {
    if (!prompt) return setFlow(null);
    // every task of the stage is done → straight to «перекинути далі?»
    if (prompt.kind === "next") setFlow({ step: "move", task, lead, yesStageId: prompt.nextStageId, allDone: true });
    else setFlow({ step: "ask", task, lead, prompt });
  }

  // «Так» on a process question → the deal is handed over, then the usual follow-up
  async function runProcess(task: TaskItem, lead: LeadRef, after: TaskPrompt | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/process`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast({ kind: "error", title: "Не вдалося передати", text: data.error ?? String(res.status) });
      else toast({ kind: "success", title: data.existed ? `Уже передано в «${data.target}»` : `Передано в «${data.target}»`, text: `Угода #${data.number}`, duration: 4000 });
      changed();
      follow(task, lead, after);
    } finally {
      setBusy(false);
    }
  }

  async function remove(task: TaskItem) {
    if (!(await ask(`Видалити справу «${task.title}»?`))) return;
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    changed();
  }

  async function moveLead(lead: LeadRef, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // e.g. a project can't be finished without its case link / payments
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast({ kind: "error", title: "Не вдалося перемістити", text: j.error ?? String(res.status), duration: 8000 }); }
      setFlow(null);
      changed();
    } finally {
      setBusy(false);
    }
  }

  async function answerNo(task: TaskItem) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/answer`, { method: "POST" });
      const data = (await res.json()) as { next: TaskItem | null; created: TaskItem | null };
      changed();
      setFlow(null);
      // a system notification on the right instead of a dialog
      if (data.created) toast({ kind: "task", title: "Створено справу", text: data.created.title, meta: data.created.deadline ? fmtDue(data.created.deadline) : undefined });
      else if (data.next) toast({ kind: "info", title: "Угода лишається на стадії", text: `Наступна справа: ${data.next.title}`, meta: data.next.deadline ? fmtDue(data.next.deadline) : undefined });
    } finally {
      setBusy(false);
    }
  }

  function openCalendar(task: TaskItem, lead: TaskLead) {
    setCalendar({ task, lead });
  }

  // Event saved from the «Додати зустріч у календар» task → the task is done; the time becomes «Дата і час КП» if empty.
  async function calendarSaved(at: string) {
    const c = calendar;
    if (!c || !at) return changed();
    if (!c.lead.kpAt) {
      await fetch(`/api/leads/${c.lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpAt: at }),
      });
    }
    await setDone(c.task, c.lead, true);
  }

  let modal: ReactNode = null;
  if (flow) {
    const btn = "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50";
    if (flow.step === "ask" && flow.prompt.kind === "question") {
      const { task, lead, prompt } = flow;
      modal = (
        <Modal open onClose={() => setFlow(null)} title="Справу виконано" size="sm">
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Check size={12} className="text-[var(--success)]" /> {task.title}</p>
            <p className="text-base font-semibold text-[var(--text)]">{prompt.text}</p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => setFlow({ step: "move", task, lead, yesStageId: prompt.yesStageId })}
                className={`${btn} text-black`} style={{ background: "#22c55e" }}>
                <Check size={15} /> {prompt.yesLabel || "Так"}
              </button>
              <button disabled={busy} onClick={() => answerNo(task)}
                className={`${btn} text-[var(--text)] border border-[var(--border)] bg-[var(--surface-2)]`}>
                <X size={15} /> {prompt.noLabel || "Ні"}
              </button>
            </div>
          </div>
        </Modal>
      );
    } else if (flow.step === "ask" && flow.prompt.kind === "process") {
      const { task, lead, prompt } = flow;
      modal = (
        <Modal open onClose={() => follow(task, lead, prompt.after)} title="Справу виконано" size="sm">
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Check size={12} className="text-[var(--success)]" /> {task.title}</p>
            <p className="text-base font-semibold text-[var(--text)]">{prompt.text}</p>
            <p className="text-xs text-[var(--text-dim)] flex items-center gap-1.5"><Workflow size={12} className="text-[#a855f7]" /> «Так» — угода піде у воронку «{prompt.target}»</p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => runProcess(task, lead, prompt.after)} className={`${btn} text-black`} style={{ background: "#22c55e" }}>
                <Check size={15} /> Так, передати
              </button>
              <button disabled={busy} onClick={() => follow(task, lead, prompt.after)}
                className={`${btn} text-[var(--text)] border border-[var(--border)] bg-[var(--surface-2)]`}>
                <X size={15} /> Ні
              </button>
            </div>
          </div>
        </Modal>
      );
    } else if (flow.step === "ask" && flow.prompt.kind === "loss") {
      const { lead, prompt } = flow;
      modal = (
        <Modal open onClose={() => setFlow(null)} title="Перекинути в програш?" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              Усі спроби вичерпано. Перевести лід у «Програш» з причиною
              {prompt.reasonLabel ? <> <b className="text-[var(--text)]">«{prompt.reasonLabel}»</b></> : " (вибери причину в картці)"}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => moveLead(lead, { status: LOSS_ID, closeReason: prompt.reasonId || null })}
                className={`${btn} text-white`} style={{ background: "#dc2626" }}>
                У програш
              </button>
              <button disabled={busy} onClick={() => setFlow(null)} className={`${btn} text-[var(--text)] border border-[var(--border)] bg-[var(--surface-2)]`}>
                Лишити
              </button>
            </div>
          </div>
        </Modal>
      );
    } else if (flow.step === "move") {
      const { task, lead, yesStageId, allDone } = flow;
      modal = (
        <StageMoveDialog
          funnel={getFunnel(settings, lead.funnelId)}
          currentId={lead.status}
          targetId={yesStageId}
          doneTitle={task.title}
          allDone={allDone}
          busy={busy}
          onMove={(status) => moveLead(lead, { status })}
          onClose={() => setFlow(null)}
        />
      );
    }
  }

  const calendarModal = calendar ? (
    <CalendarModal
      lead={calendar.lead}
      initialStatus="КП"
      onClose={() => setCalendar(null)}
      onSaved={calendarSaved}
    />
  ) : null;

  return {
    setDone,
    remove,
    openCalendar,
    // a dialog is open (the lead card must not close on Escape)
    open: !!flow || !!calendar,
    modal: <>{modal}{calendarModal}</>,
  };
}
