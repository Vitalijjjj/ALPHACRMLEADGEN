"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bell, CalendarClock, FileText, PenLine, Phone, Presentation, Send, type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { toastError } from "@/components/ui/toast";
import { FieldLabel, FormFooter, PeoplePicker, Segmented, TemplateCards, fieldCls } from "@/components/ui/formKit";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { useAccess } from "@/lib/useAccess";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/taskAutomation";
import { localDate } from "@/components/tasks/taskUtils";

export interface NewTask {
  title: string;
  description?: string;
  deadline: string | null; // ISO
  remindAt?: string | null; // ISO
  priority: TaskPriority;
  assignee: string | null;
  status: "TODO";
}

const TEMPLATES: { key: string; label: string; icon: LucideIcon; color: string; priority: TaskPriority }[] = [
  { key: "Перезвонити", label: "Перезвонити", icon: Phone, color: "#22c55e", priority: "HIGH" },
  { key: "Запушити клієнта", label: "Запушити", icon: Send, color: "#38bdf8", priority: "HIGH" },
  { key: "Надіслати КП", label: "Надіслати КП", icon: FileText, color: "#a78bfa", priority: "HIGH" },
  { key: "Провести КП", label: "Провести КП", icon: Presentation, color: "#c084fc", priority: "URGENT" },
  { key: "Надіслати звіт", label: "Надіслати звіт", icon: BarChart3, color: "#eab308", priority: "MEDIUM" },
  { key: "Назначити зустріч", label: "Зустріч", icon: CalendarClock, color: "#818cf8", priority: "HIGH" },
  { key: "", label: "Своя справа", icon: PenLine, color: "#C98C0A", priority: "MEDIUM" },
];
const HOURS = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"];
const WD = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const REMIND: { key: string; label: string; min: number | null }[] = [
  { key: "none", label: "Без нагадування", min: null },
  { key: "0", label: "В момент", min: 0 },
  { key: "15", label: "За 15 хв", min: 15 },
  { key: "60", label: "За 1 год", min: 60 },
];

// who a new task goes to by default: the signed-in person if they are an assignee, the owner → «Артур»
export function useMyAssignee(): string {
  const { settings } = useCrmSettings();
  const { access } = useAccess();
  const people = settings.tasks.assignees;
  if (access && !access.owner && people.includes(access.name)) return access.name;
  if (access?.owner && people.includes("Артур")) return "Артур";
  return settings.tasks.defaultAssignee;
}

// «Нова справа»: template → what → when (day tiles + hours) → priority → who (+ Telegram reminder)
export default function TaskModal({ open, onClose, onCreate, title: heading = "Нова справа", initialDeadline, subtitle }: {
  open: boolean;
  onClose: () => void;
  onCreate: (t: NewTask) => Promise<void | boolean>;
  title?: string;
  initialDeadline?: string; // yyyy-MM-ddTHH:mm
  subtitle?: string;        // «Угода #123 · Іван» — for whom
}) {
  const { settings } = useCrmSettings();
  const me = useMyAssignee();
  const people = settings.tasks.assignees;
  const [tpl, setTpl] = useState(TEMPLATES[0].key);
  const [title, setTitle] = useState(TEMPLATES[0].key);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("13:00");
  const [priority, setPriority] = useState<TaskPriority>("HIGH");
  const [assignee, setAssignee] = useState("");
  const [remind, setRemind] = useState("none");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form on open */
    const [d, t] = (initialDeadline ?? "").split("T");
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    setTpl(TEMPLATES[0].key);
    setTitle(TEMPLATES[0].key);
    setPriority(TEMPLATES[0].priority);
    setDescription("");
    setDate(d || localDate(tomorrow));
    setTime(t?.slice(0, 5) || "13:00");
    setAssignee(me);
    setRemind("none");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opened
  }, [open]);
  // the access info may arrive after the form opened
  // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the default until changed
  useEffect(() => { if (open && !assignee && me) setAssignee(me); }, [open, me, assignee]);

  const days = useMemo(() => {
    const out: { date: string; label: string; sub: string; weekend: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      out.push({ date: localDate(d), label: i === 0 ? "Сьогодні" : i === 1 ? "Завтра" : WD[d.getDay()], sub: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`, weekend: d.getDay() === 0 || d.getDay() === 6 });
    }
    return out;
  }, []);

  function pickTpl(k: string) {
    const t = TEMPLATES.find((x) => x.key === k)!;
    setTpl(k);
    setTitle(k);
    setPriority(t.priority);
  }

  const tplMeta = TEMPLATES.find((x) => x.key === tpl) ?? TEMPLATES[TEMPLATES.length - 1];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toastError("Напиши, що потрібно зробити");
    setBusy(true);
    try {
      const at = date ? new Date(`${date}T${time || "13:00"}`) : null;
      const min = REMIND.find((r) => r.key === remind)?.min;
      const remindAt = at && min != null ? new Date(at.getTime() - min * 60_000).toISOString() : null;
      const ok = await onCreate({ title: title.trim(), description: description.trim() || undefined, deadline: at ? at.toISOString() : null, remindAt, priority, assignee: assignee || null, status: "TODO" });
      if (ok !== false) onClose();
    } finally {
      setBusy(false);
    }
  }

  const tile = (on: boolean, color: string) => on ? { background: `${color}22`, borderColor: `${color}88`, color } : undefined;

  return (
    <Modal open={open} onClose={onClose} title={heading} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {subtitle && <div className="-mt-1 text-xs text-[var(--text-dim)] truncate">{subtitle}</div>}

        <TemplateCards options={TEMPLATES.map((t) => ({ key: t.key, label: t.label, icon: t.icon, color: t.color }))} value={tpl} onChange={pickTpl} />

        <div>
          <FieldLabel>Що зробити</FieldLabel>
          <input autoFocus={tpl === ""} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Напр. Уточнити бриф по сайту"
            className={`${fieldCls} text-[15px] font-semibold`} style={{ color: tplMeta.color }} />
        </div>

        {/* when */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 space-y-2">
          <div className="flex items-center">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mr-auto">Коли</span>
            <button type="button" onClick={() => { setDate(date ? "" : days[1].date); setRemind("none"); }} className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
              {date ? "без терміну" : "+ вказати термін"}
            </button>
          </div>
          {date ? (
            <>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                {days.map((d) => (
                  <button type="button" key={d.date} onClick={() => setDate(d.date)}
                    className={`flex flex-col items-center py-1.5 rounded-lg border cursor-pointer transition-colors ${date === d.date ? "" : "border-[var(--border)] hover:border-white/20"}`}
                    style={tile(date === d.date, tplMeta.color)}>
                    <span className={`text-[11px] font-semibold leading-tight ${date === d.date ? "" : d.weekend ? "text-[var(--text-dim)]" : "text-[var(--text)]"}`}>{d.label}</span>
                    <span className="text-[10px] tabular-nums leading-tight opacity-70">{d.sub}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                {HOURS.map((h) => {
                  const on = time === `${h}:00`;
                  return (
                    <button type="button" key={h} onClick={() => setTime(`${h}:00`)}
                      className={`py-1.5 rounded-lg border text-xs font-semibold tabular-nums cursor-pointer transition-colors ${on ? "" : "border-[var(--border)] text-[var(--text)] hover:border-white/20"}`}
                      style={tile(on, tplMeta.color)}>{h}</button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldCls} !py-2 bg-[var(--surface)]`} style={{ colorScheme: "dark" }} aria-label="Інша дата" />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${fieldCls} !py-2 bg-[var(--surface)]`} style={{ colorScheme: "dark" }} aria-label="Інший час" />
              </div>
            </>
          ) : (
            <div className="py-2 text-center text-xs text-[var(--text-dim)]">Справа без терміну — буде в списку, поки не виконаєш</div>
          )}
        </div>

        <div>
          <FieldLabel>Пріоритет</FieldLabel>
          <Segmented size="sm" options={TASK_PRIORITIES} value={priority} onChange={setPriority} />
        </div>

        {people.length > 0 && (
          <div>
            <FieldLabel right={assignee === me && me ? <span className="text-[10px] text-[var(--text-dim)]">за замовчуванням</span> : undefined}>На кого справа</FieldLabel>
            <PeoplePicker people={people} value={assignee} onChange={setAssignee} />
          </div>
        )}

        {date && (
          <div>
            <FieldLabel><span className="inline-flex items-center gap-1"><Bell size={10} /> Нагадування в Telegram</span></FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {REMIND.map((r) => (
                <button type="button" key={r.key} onClick={() => setRemind(r.key)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${remind === r.key ? "border-[#26A5E4] text-[#5cc0f0] bg-[#26A5E4]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <FieldLabel>Опис · необовʼязково</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Деталі…" className={`${fieldCls} resize-none`} />
        </div>

        <FormFooter onCancel={onClose} busy={busy} color={tplMeta.color}>
          {busy ? "Створюю…" : <>Створити справу{assignee ? ` · ${assignee}` : ""}</>}
        </FormFooter>
      </form>
    </Modal>
  );
}
