"use client";

import { useState } from "react";
import { Plus, User } from "lucide-react";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/taskAutomation";
import { localDate, localTime } from "@/components/tasks/taskUtils";

const TEMPLATES = ["Перезвонити", "Запушити клієнта", "Надіслати КП", "Надіслати звіт", "Назначити зустріч"];

export interface NewTask {
  title: string;
  deadline: string | null; // ISO
  priority: TaskPriority;
  assignee: string | null;
  status: "TODO";
}

// Quick «Справа» form — everything in one place: what, when (date + time), priority, who.
export default function TaskComposer({ onCreate, autoFocus }: { onCreate: (t: NewTask) => Promise<void>; autoFocus?: boolean }) {
  const { settings } = useCrmSettings();
  const people = settings.tasks.assignees;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const who = assignee ?? settings.tasks.defaultAssignee ?? "";

  function setAt(d: Date) {
    setDate(localDate(d));
    setTime(localTime(d));
  }
  const quick: { label: string; at: () => Date }[] = [
    { label: "+1 год", at: () => roundTo5(new Date(Date.now() + 3_600_000)) },
    { label: "+3 год", at: () => roundTo5(new Date(Date.now() + 3 * 3_600_000)) },
    { label: "Сьогодні 18:00", at: () => atHour(0, 18) },
    { label: "Завтра 10:00", at: () => atHour(1, 10) },
    { label: "Завтра 13:00", at: () => atHour(1, 13) },
  ];

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const deadline = date ? new Date(`${date}T${time || "13:00"}`).toISOString() : null;
      await onCreate({ title: title.trim(), deadline, priority, assignee: who || null, status: "TODO" });
      setTitle("");
      setDate("");
      setTime("");
      setPriority("MEDIUM");
    } finally {
      setBusy(false);
    }
  }

  const field = "px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]";
  const chip = "px-2 py-1 rounded-md text-[11px] border transition-colors cursor-pointer";

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        autoFocus={autoFocus}
        placeholder="Що потрібно зробити? (Enter — додати)"
        className={`${field} w-full placeholder:text-[var(--text-dim)]`}
      />
      <div className="flex flex-wrap gap-1">
        {TEMPLATES.map((t) => (
          <button key={t} type="button" onClick={() => setTitle(t)}
            className={chip}
            style={title === t
              ? { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-subtle)" }
              : { color: "var(--text-muted)", borderColor: "var(--border)", background: "transparent" }}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (!time && e.target.value) setTime("13:00"); }} className={field} aria-label="Дата" />
        <input type="time" value={time} onChange={(e) => { setTime(e.target.value); if (!date && e.target.value) setDate(localDate(new Date())); }} className={field} aria-label="Час" />
        {quick.map((q) => (
          <button key={q.label} type="button" onClick={() => setAt(q.at())}
            className={`${chip} text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-white/20`}>
            {q.label}
          </button>
        ))}
        {date && (
          <button type="button" onClick={() => { setDate(""); setTime(""); }} className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer px-1">
            без терміну
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          {TASK_PRIORITIES.map((p) => {
            const on = priority === p.key;
            return (
              <button key={p.key} type="button" onClick={() => setPriority(p.key)}
                className="px-2.5 py-1.5 text-[11px] font-medium cursor-pointer transition-colors border-r border-[var(--border)] last:border-r-0"
                style={on ? { color: p.color, background: `${p.color}22` } : { color: "var(--text-dim)" }}>
                {p.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1 pl-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]">
          <User size={12} />
          <select value={who} onChange={(e) => setAssignee(e.target.value)}
            className="bg-transparent py-1.5 pr-2 text-sm text-[var(--text)] focus:outline-none cursor-pointer" aria-label="Відповідальний">
            <option value="">Без відповідального</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <button onClick={submit} disabled={!title.trim() || busy}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold text-black disabled:opacity-40 cursor-pointer"
          style={{ background: "var(--accent)" }}>
          <Plus size={14} /> Додати
        </button>
      </div>
    </div>
  );
}

function roundTo5(d: Date): Date {
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return d;
}
function atHour(addDays: number, h: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(h, 0, 0, 0);
  return d;
}
