"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, Check, ArrowRight, Briefcase, CalendarClock, Inbox, ListTodo, UserPlus, X } from "lucide-react";
import { leadDisplayName } from "@/lib/leadOptions";
import { fmtMoney, projectTitle } from "@/lib/finance";
import { canNotify, type NotifyKey } from "@/lib/access";
import { useAccess } from "@/lib/useAccess";
import { BELL_KEY, useTaskActions } from "@/components/tasks/useTaskActions";
import { bucketOf, fmtDue, relDue, sortOpen, type TaskItem } from "@/components/tasks/taskUtils";

const WEEK = 7 * 86_400_000;
const SEEN_KEY = "bell-seen";
// remember «everything up to now is seen» (per browser)
function markSeen(): number {
  const t = Date.now();
  try { localStorage.setItem(SEEN_KEY, String(t)); } catch { /* ignore */ }
  return t;
}

interface BellLead {
  id: string; number: number; name: string; phone: string | null; projectName: string | null; source: string | null;
  amount: number | null; currency: string | null; createdAt: string; stage: { label: string; color: string };
}
interface BellPayment {
  id: string; title: string | null; amount: number; currency: string | null; payer: string | null; dueDate: string | null;
  lead: (Omit<BellLead, "stage">) | null;
}
interface BellData { leads: BellLead[]; projects: BellLead[]; payments: BellPayment[]; funnels?: { id: string; label: string; leads: BellLead[] }[] }
type TabKey = NotifyKey | `f:${string}`; // f:<funnelId> — a funnel with its own tab («Апсейл», «Підписка»)
const FUNNEL_COLORS = ["#a78bfa", "#f472b6", "#2dd4bf", "#fb923c", "#60a5fa"];

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)} хв тому`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.round(h / 24);
  return d === 1 ? "вчора" : `${d} дн. тому`;
};

// Header bell: overdue tasks, today's tasks and the next ones. Click a task → its lead opens.
export default function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // phones / tablets (no sidebar): the panel is a bottom sheet instead of a dropdown under the bell
  const [mobile, setMobile] = useState(false);
  const [drag, setDrag] = useState(0); // swipe-down offset of the sheet, px
  const dragFrom = useRef<number | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const { access } = useAccess();
  const kinds = (["tasks", "leads", "projects", "payments"] as NotifyKey[]).filter((k) => canNotify(access, k));
  const [tab, setTab] = useState<TabKey>("tasks");
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser
    try { setSeen(Number(localStorage.getItem(SEEN_KEY)) || 0); } catch { /* ignore */ }
  }, []);
  const feed = useQuery({
    queryKey: ["bell-feed"],
    enabled: kinds.some((k) => k !== "tasks"),
    queryFn: async (): Promise<BellData> => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const q = useQuery({
    queryKey: BELL_KEY,
    enabled: kinds.includes("tasks"),
    queryFn: async (): Promise<TaskItem[]> => {
      const res = await fetch("/api/tasks?open=1");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const actions = useTaskActions(() => q.refetch());

  // closing the panel marks everything as seen
  function toggle() {
    if (open) setSeen(markSeen());
    else if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key ?? "tasks");
    setOpen(!open);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || sheetRef.current?.contains(t)) return;
      // a confirm / task dialog opened from the panel must not close it
      if ((t as Element).closest?.("[role=dialog], .fixed.z-\\[80\\], .fixed.z-\\[100\\]")) return;
      setSeen(markSeen()); setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tasks = sortOpen(q.data ?? []);
  const overdue = tasks.filter((t) => bucketOf(t.deadline) === "overdue");
  const today = tasks.filter((t) => bucketOf(t.deadline) === "today");
  // «ті, які будуть» — the coming week
  const soon = tasks
    .filter((t) => { const b = bucketOf(t.deadline); return (b === "tomorrow" || b === "later") && new Date(t.deadline!).getTime() - q.dataUpdatedAt < WEEK; })
    .slice(0, 8);
  const fresh = (l: { createdAt: string }) => new Date(l.createdAt).getTime() > seen;
  const leads = feed.data?.leads ?? [], projects = feed.data?.projects ?? [], payments = feed.data?.payments ?? [];
  const isLate = (p: BellPayment) => !!p.dueDate && new Date(p.dueDate) < new Date(new Date().toDateString());
  const lateP = payments.filter(isLate);
  const badge: Record<NotifyKey, number> = {
    tasks: overdue.length + today.length,
    leads: leads.filter(fresh).length,
    projects: projects.filter(fresh).length,
    payments: payments.length, // all to ask for: overdue, today, tomorrow
  };
  const META: Record<NotifyKey, { label: string; icon: typeof Bell; color: string }> = {
    tasks: { label: "Справи", icon: ListTodo, color: "#fbbf24" },
    leads: { label: "Ліди", icon: UserPlus, color: "#38bdf8" },
    projects: { label: "Проєкти", icon: Briefcase, color: "#C98C0A" },
    payments: { label: "Оплати", icon: CalendarClock, color: "#22c55e" },
  };
  // funnels with their own tab go right after «Ліди» (same permission as leads)
  const funnelTabs = kinds.includes("leads") ? feed.data?.funnels ?? [] : [];
  const tabs: { key: TabKey; label: string; icon: typeof Bell; color: string; badge: number; list?: BellLead[] }[] = kinds.flatMap((k) => [
    { key: k as TabKey, ...META[k], badge: badge[k] },
    ...(k === "leads" ? funnelTabs.map((f, i) => ({ key: `f:${f.id}` as TabKey, label: f.label, icon: Inbox, color: FUNNEL_COLORS[i % FUNNEL_COLORS.length], badge: f.leads.filter(fresh).length, list: f.leads })) : []),
  ]);
  const count = tabs.reduce((s, t) => s + t.badge, 0);
  const funnelTab = tabs.find((t) => t.key === tab && t.list);

  function go(t: TaskItem) {
    if (!t.lead) return;
    setOpen(false);
    router.push(`/leads/${t.lead.number}`);
  }
  function openLead(number: number) {
    toggle();
    router.push(`/leads/${number}`);
  }

  const leadRow = (l: BellLead, project: boolean, deal = false) => (
    <button key={l.id} onClick={() => openLead(l.number)} className="w-full flex items-start gap-2.5 px-3 py-2 max-lg:px-4 max-lg:py-3 text-left hover:bg-white/[0.04] active:bg-white/[0.05] cursor-pointer">
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${fresh(l) ? "bg-[#38bdf8]" : "bg-transparent"}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-[var(--text)] truncate">{project ? projectTitle(l) : leadDisplayName(l)}</span>
        <span className="block text-[11px] text-[var(--text-muted)] truncate">
          <span style={{ color: l.stage.color }}>{l.stage.label}</span>
          {project ? (l.name.trim() ? ` · ${l.name}` : "") : deal ? (l.projectName ? ` · ${l.projectName}` : "") : l.source ? ` · ${l.source}` : ""}
          {project && l.amount ? ` · ${fmtMoney(l.amount, l.currency ?? "UAH")}` : ""}
        </span>
      </span>
      <span className="text-[10px] text-[var(--text-dim)] whitespace-nowrap pt-0.5">{ago(l.createdAt)}</span>
    </button>
  );
  const payRow = (p: BellPayment) => {
    const late = isLate(p);
    const cur = p.currency ?? p.lead?.currency ?? "UAH";
    return (
      <button key={p.id} onClick={() => (p.lead ? openLead(p.lead.number) : (toggle(), router.push("/pnl/schedule")))} className="w-full flex items-start gap-2.5 px-3 py-2 max-lg:px-4 max-lg:py-3 text-left hover:bg-white/[0.04] active:bg-white/[0.05] cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-[var(--text)] truncate">{p.lead ? projectTitle(p.lead) : p.payer || "Без проєкту"}</span>
          <span className="block text-[11px] text-[var(--text-muted)] truncate">{p.title || "Оплата"}{p.dueDate && <span style={{ color: late ? "#ef4444" : "#fbbf24" }}> · {late ? "прострочено " : "до "}{new Date(p.dueDate).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}</span>}</span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-[#4ade80] whitespace-nowrap">{fmtMoney(p.amount, cur)}</span>
      </button>
    );
  };
  const empty = (t: string) => <div className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">{t}</div>;

  const section = (title: string, color: string, list: TaskItem[]) =>
    list.length > 0 && (
      <div className="py-1">
        <div className="px-3 max-lg:px-4 py-1 max-lg:pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{title} · {list.length}</div>
        {list.map((t) => (
          <div key={t.id} className="group flex items-start gap-2 max-lg:gap-3 px-3 py-2 max-lg:px-4 max-lg:py-2.5 hover:bg-white/[0.04]">
            <button
              onClick={() => actions.setDone(t, t.lead, true)}
              className="mt-0.5 w-4 h-4 max-lg:w-6 max-lg:h-6 max-lg:rounded-md max-lg:mt-0 rounded border border-[var(--border)] hover:border-[var(--accent)] flex items-center justify-center cursor-pointer shrink-0"
              title="Виконано"
            >
              <Check size={10} className="opacity-0 group-hover:opacity-40 text-[var(--text)]" />
            </button>
            <button onClick={() => go(t)} className="flex-1 min-w-0 text-left cursor-pointer">
              <div className="text-sm text-[var(--text)] truncate">{t.title}</div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {t.lead ? leadDisplayName(t.lead) : "Без ліда"}
                {t.deadline && <span style={{ color }}> · {fmtDue(t.deadline)}{color === "#ef4444" ? ` (${relDue(t.deadline)})` : ""}</span>}
              </div>
            </button>
          </div>
        ))}
      </div>
    );

  const body = (
    <>
            {!kinds.length && empty("Сповіщення для твоєї ролі вимкнені")}
            {tab === "tasks" && kinds.includes("tasks") && (
              <>
                {section("Прострочені", "#ef4444", overdue)}
                {section("Сьогодні", "#fbbf24", today)}
                {section("Найближчі", "#94a3b8", soon)}
                {!overdue.length && !today.length && !soon.length && empty("Немає справ на найближчий тиждень")}
              </>
            )}
            {tab === "leads" && kinds.includes("leads") && (leads.length ? <div className="py-1">{leads.map((l) => leadRow(l, false))}</div> : empty("Нових лідів немає — усі взяті в роботу"))}
            {tab === "projects" && kinds.includes("projects") && (projects.length ? <div className="py-1">{projects.map((l) => leadRow(l, true))}</div> : empty("Нових проєктів немає — усі взяті в роботу"))}
            {tab === "payments" && kinds.includes("payments") && (payments.length ? <div className="py-1">{payments.map(payRow)}</div> : empty("Немає оплат, які треба запросити сьогодні чи завтра"))}
            {funnelTab && (funnelTab.list!.length ? <div className="py-1">{funnelTab.list!.map((l) => leadRow(l, false, true))}</div> : empty(`Нових угод у «${funnelTab.label}» немає — усі взяті в роботу`))}
    </>
  );
  const footer = (
    <>
          {tab === "tasks" && (
            <button onClick={() => { setOpen(false); router.push("/tasks"); }}
              className="w-full flex items-center justify-center gap-1 px-3 py-2 max-lg:py-3.5 max-lg:text-sm border-t border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">
              Усі задачі <ArrowRight size={12} />
            </button>
          )}
          {tab === "payments" && (
            <button onClick={() => { toggle(); router.push("/pnl/schedule"); }}
              className="w-full flex items-center justify-center gap-1 px-3 py-2 max-lg:py-3.5 max-lg:text-sm border-t border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">
              Графік оплат <ArrowRight size={12} />
            </button>
          )}
    </>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={toggle}
        aria-label="Сповіщення"
        title={count ? `${overdue.length} прострочено · ${today.length} на сьогодні` : "Сповіщення"}
        style={{
          position: "relative",
          width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 10,
          background: open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: count ? "var(--text)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <Bell size={14} />
        {count > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px",
              borderRadius: 8, fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center",
              background: overdue.length || lateP.length ? "#ef4444" : "var(--accent)", color: overdue.length || lateP.length ? "#fff" : "#000",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && !mobile && (
        <div
          className="absolute right-0 mt-2 w-[min(400px,calc(100vw-24px))] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden"
          style={{ background: "rgba(12,12,12,0.98)", backdropFilter: "blur(24px)", zIndex: 60 }}
        >
          <div className={`${tabs.length > 4 ? "grid grid-cols-3" : "flex items-center"} gap-0.5 p-1.5 border-b border-[var(--border)]`}>
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} title={t.label}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${on ? "bg-white/[0.07] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                  <t.icon size={13} className="shrink-0" style={{ color: on ? t.color : undefined }} /><span className="truncate">{t.label}</span>
                  {t.badge > 0 && <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center" style={{ background: t.color, color: "#000" }}>{t.badge}</span>}
                </button>
              );
            })}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {body}
          </div>
          {footer}
        </div>
      )}
      {/* phones: a bottom sheet over everything (the bottom bar included); swipe it down or tap outside to close */}
      {open && mobile && createPortal(
        <div className="fixed inset-0 z-[75] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] dialog-fade" />
          <div
            ref={sheetRef}
            className="relative flex flex-col max-h-[85dvh] rounded-t-2xl border-t border-[var(--border)] shadow-2xl sheet-up"
            style={{ background: "rgba(12,12,12,0.99)", transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : "transform 0.2s ease" }}
          >
            <div
              className="shrink-0 touch-none"
              onTouchStart={(e) => { dragFrom.current = e.touches[0].clientY; }}
              onTouchMove={(e) => { if (dragFrom.current !== null) setDrag(Math.max(0, e.touches[0].clientY - dragFrom.current)); }}
              onTouchEnd={() => { const far = drag > 90; dragFrom.current = null; setDrag(0); if (far) toggle(); }}
            >
              <div className="flex justify-center pt-2.5 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
              <div className="flex items-center justify-between px-4 pt-1 pb-2">
                <h2 className="text-base font-semibold text-[var(--text)]">Сповіщення</h2>
                <button onClick={toggle} aria-label="Закрити" className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-[var(--text-muted)] active:bg-white/[0.06] cursor-pointer"><X size={18} /></button>
              </div>
            </div>
            {/* tabs: one row, swipe sideways */}
            <div className="shrink-0 flex gap-1.5 px-3 pb-2.5 overflow-x-auto overscroll-x-contain no-scrollbar border-b border-[var(--border)]">
              {tabs.map((t) => {
                const on = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium cursor-pointer border transition-colors ${on ? "bg-white/[0.08] text-[var(--text)] border-white/[0.12]" : "text-[var(--text-muted)] border-white/[0.06]"}`}>
                    <t.icon size={14} className="shrink-0" style={{ color: on ? t.color : undefined }} />{t.label}
                    {t.badge > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-[18px] text-center" style={{ background: t.color, color: "#000" }}>{t.badge}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{body}</div>
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{footer}</div>
          </div>
        </div>,
        document.body,
      )}
      {/* the header has backdrop-filter, which would trap fixed dialogs — render them in <body> */}
      {actions.open && createPortal(actions.modal, document.body)}
    </div>
  );
}
