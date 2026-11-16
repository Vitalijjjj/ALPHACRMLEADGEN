"use client";

import { useState, useEffect, useCallback } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { CalendarDays, Columns3, List, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { TaskForm } from "@/components/tasks/TaskForm";
import LeadDrawer from "@/components/leads/LeadDrawer";
import TasksTable from "@/components/tasks/TasksTable";
import TasksBoard from "@/components/tasks/TasksBoard";
import TasksCalendar from "@/components/tasks/TasksCalendar";
import { useTaskActions, BELL_KEY } from "@/components/tasks/useTaskActions";
import { bucketOf, sortDone, sortOpen, localDate, type TaskItem } from "@/components/tasks/taskUtils";
import { inMonth } from "@/components/tasks/taskViews";
import { leadDisplayName } from "@/lib/leadOptions";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { useAccess } from "@/lib/useAccess";
import { canPage } from "@/lib/access";
import { toastError } from "@/components/ui/toast";
import TaskSearchFilter, { EMPTY_TASK_FILTER, ME, NOBODY, type SavedTaskFilter, type TaskFilter } from "@/components/tasks/TaskSearchFilter";

type View = "list" | "board" | "calendar";

const PREFS_KEY = "tasks-view-v2";
const SAVED_KEY = "tasks-saved-filters";
const ME_KEY = "tasks-me";
const DAY = 86_400_000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ }
}

// Tasks: «Список» / «Терміни» (board by deadline) / «Календар» + the extended search (who, status, period, type, deadline, funnel).
export default function TasksPage() {
  const qc = useQueryClient();
  const { settings } = useCrmSettings();
  const { access } = useAccess();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState<{ deadline?: string } | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_TASK_FILTER);
  const [saved, setSaved] = useState<SavedTaskFilter[]>([]);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [meName, setMeName] = useState("");            // owner: who «я» is among the assignees
  const [ready, setReady] = useState(false);

  const isAdmin = !!access && (access.owner || canPage(access, "settings"));

  // remembered view + filter (per browser)
  useEffect(() => {
    const p = load(PREFS_KEY, { view: "list" as View, filter: EMPTY_TASK_FILTER });
    /* eslint-disable react-hooks/set-state-in-effect -- read once from localStorage */
    setView(p.view);
    setFilter({ ...EMPTY_TASK_FILTER, ...p.filter });
    setSaved(load(SAVED_KEY, { list: [] as SavedTaskFilter[] }).list);
    setMeName(load(ME_KEY, { name: "" }).name);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (ready) save(PREFS_KEY, { view, filter });
  }, [ready, view, filter]);
  const saveFilters = (list: SavedTaskFilter[]) => { setSaved(list); save(SAVED_KEY, { list }); };

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    fetchTasks();
  }, [fetchTasks]);

  const actions = useTaskActions(fetchTasks);

  async function createTask(data: Record<string, unknown>) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return toastError("Не вдалося створити задачу");
    setCreate(null);
    qc.invalidateQueries({ queryKey: BELL_KEY });
    fetchTasks();
  }

  async function patch(t: TaskItem, body: Record<string, unknown>, local: Partial<TaskItem>) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...local } : x)));
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toastError(res.status === 403 ? "Твоя роль не дозволяє змінювати цю угоду" : "Не вдалося зберегти");
      fetchTasks();
      return;
    }
    qc.invalidateQueries({ queryKey: BELL_KEY });
  }

  function toggle(t: TaskItem, done: boolean) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: done ? "DONE" : "TODO", completedAt: done ? new Date().toISOString() : null } : x)));
    actions.setDone(t, t.lead, done);
  }
  const move = (t: TaskItem, d: Date | null) => patch(t, { deadline: d ? d.toISOString() : null }, { deadline: d ? d.toISOString() : null });
  const assign = (t: TaskItem, a: string | null) => patch(t, { assignee: a }, { assignee: a });
  const openLead = (t: TaskItem) => { if (t.lead) setOpenLeadId(t.lead.id); };
  const calendarFor = (t: TaskItem) => {
    const cal = t.lead && settings.tasks.rules.find((r) => r.id === t.autoRuleId)?.calendar;
    return cal ? () => actions.openCalendar(t, t.lead!) : undefined;
  };

  // who is «я»
  const people = [...new Set([...settings.tasks.assignees, ...tasks.map((t) => t.assignee).filter((a): a is string => !!a)])];
  const me = access?.owner ? (meName && people.includes(meName) ? meName : settings.tasks.defaultAssignee) : access?.name ?? "";

  // ── filters ──
  const needle = q.trim().toLowerCase();
  const firstFunnel = settings.funnels[0]?.id ?? "main";
  const base = tasks.filter((t) => {
    // others see only their own tasks + nobody's
    if (!isAdmin) { if (t.assignee && t.assignee !== me) return false; }
    else if (filter.who.length && !filter.who.some((w) => (w === ME ? t.assignee === me : w === NOBODY ? !t.assignee : t.assignee === w))) return false;
    if (filter.kind !== "all" && (filter.kind === "auto") !== !!t.autoRuleId) return false;
    if (filter.funnels.length && !filter.funnels.includes(t.lead ? t.lead.funnelId ?? firstFunnel : "-")) return false;
    if (needle) {
      const hay = `${t.title} ${t.lead ? `${leadDisplayName(t.lead)} ${t.lead.number} ${t.lead.name}` : ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const thisMonth = startOfMonth(new Date());
  const periodOk = (t: TaskItem) => {
    const at = t.status === "DONE" ? t.completedAt ?? t.deadline : t.deadline;
    if (filter.period === "all") return true;
    if (filter.period === "month") return inMonth(at, thisMonth);
    if (filter.period === "prev") return inMonth(at, subMonths(thisMonth, 1));
    if (!at) return false;
    const d = localDate(new Date(at));
    return (!filter.from || d >= filter.from) && (!filter.to || d <= filter.to);
  };
  // «Термін» — about open tasks; done ones pass (they are shown only with «Виконані / Усі»)
  const dueOk = (t: TaskItem) => {
    if (filter.due === "any" || t.status === "DONE") return true;
    if (filter.due === "none") return !t.deadline;
    const b = bucketOf(t.deadline);
    if (filter.due === "overdue") return b === "overdue";
    if (filter.due === "today") return b === "today";
    return !!t.deadline && b !== "overdue" && new Date(t.deadline).getTime() - Date.parse(new Date().toDateString()) < 7 * DAY;
  };
  const scoped = base.filter((t) => periodOk(t) && dueOk(t));
  const open = sortOpen(scoped.filter((t) => t.status !== "DONE"));
  const done = sortDone(scoped.filter((t) => t.status === "DONE"));
  const listRows = filter.status === "open" ? open : filter.status === "done" ? done : [...open, ...done];

  const allOpen = base.filter((t) => t.status !== "DONE");
  const overdue = allOpen.filter((t) => bucketOf(t.deadline) === "overdue").length;
  const today = allOpen.filter((t) => bucketOf(t.deadline) === "today").length;
  const mineOnly = !isAdmin || (filter.who.length === 1 && filter.who[0] === ME);

  const seg = (on: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${on ? "bg-[var(--accent)] text-black shadow-[0_4px_14px_-6px_var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04]"}`;
  const group = "flex items-center gap-0.5 p-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]";

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-lg font-semibold text-[var(--text)]">{mineOnly ? "Мої задачі" : filter.who.length ? "Задачі" : "Усі задачі"}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {allOpen.length} в роботі
            {overdue > 0 && <span className="text-red-400"> · {overdue} прострочено</span>}
            {today > 0 && <span className="text-amber-400"> · {today} на сьогодні</span>}
          </p>
        </div>
        {overdue > 0 && (
          <button onClick={() => { setView("list"); setFilter({ ...filter, status: "open", due: "overdue", period: "all" }); }}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15 cursor-pointer" title="Протерміновані">
            <span className="min-w-5 h-5 px-1 rounded-md bg-red-500 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">{overdue > 99 ? "99+" : overdue}</span>
            <span className="hidden sm:inline">Протерміновані</span><span className="sm:hidden">Простр.</span>
          </button>
        )}
        <button onClick={() => setCreate({})}
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-black text-sm rounded-xl hover:brightness-110 cursor-pointer font-semibold shrink-0 transition-[filter]"
          style={{ background: "var(--accent)" }} aria-label="Нова задача">
          <Plus size={15} /> <span className="hidden sm:inline">Нова задача</span><span className="sm:hidden">Задача</span>
        </button>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`${group} w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center`}>
          <button onClick={() => setView("list")} className={seg(view === "list")}><List size={13} />Список</button>
          <button onClick={() => setView("board")} className={seg(view === "board")}><Columns3 size={13} />Терміни</button>
          <button onClick={() => setView("calendar")} className={seg(view === "calendar")}><CalendarDays size={13} />Календар</button>
        </div>

        <TaskSearchFilter
          search={q} onSearch={setQ}
          filter={filter} onApply={setFilter}
          people={people}
          funnels={settings.funnels.map((f) => ({ id: f.id, name: f.name }))}
          admin={isAdmin}
          saved={saved} onSaved={saveFilters}
          me={me}
          onMe={access?.owner ? (n) => { setMeName(n); save(ME_KEY, { name: n }); } : undefined}
          meOptions={access?.owner ? people : undefined}
        />
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--text-muted)] text-sm">Завантаження…</div>
      ) : view === "list" ? (
        <TasksTable
          tasks={listRows}
          people={people}
          onToggle={toggle}
          onDelete={(t) => actions.remove(t)}
          onOpenLead={openLead}
          onAssign={assign}
          calendarFor={calendarFor}
        />
      ) : view === "board" ? (
        <TasksBoard tasks={scoped} showDone={filter.status !== "open"} onToggle={toggle} onMove={move} onOpenLead={openLead} />
      ) : (
        <TasksCalendar
          tasks={base}
          month={month}
          onMonth={setMonth}
          onToggle={toggle}
          onOpen={openLead}
          onCreate={(d) => setCreate({ deadline: `${localDate(d)}T10:00` })}
        />
      )}

      <Modal open={!!create} onClose={() => setCreate(null)} title="Нова задача" size="sm">
        {create && <TaskForm onSave={createTask} onCancel={() => setCreate(null)} initialDeadline={create.deadline} />}
      </Modal>

      {actions.modal}

      {openLeadId && (
        <LeadDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} onUpdate={fetchTasks} />
      )}
    </div>
  );
}
