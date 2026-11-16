"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Phone, Mail, Trash2, CalendarPlus, Columns3, List } from "lucide-react";
import LeadsKanban from "@/components/leads/LeadsKanban";
import { Modal } from "@/components/ui/modal";
import { LeadForm, type LeadFormData } from "@/components/leads/LeadForm";
import LeadDrawer from "@/components/leads/LeadDrawer";
import CalendarModal, { toLocalInput } from "@/components/leads/CalendarModal";
import { useStageGuard } from "@/components/tasks/useStageGuard";
import { useAccess } from "@/lib/useAccess";
import { can, canPage } from "@/lib/access";
import { formatMoney, toEur } from "@/lib/currency";
import { useFx } from "@/lib/useFx";
import { leadDisplayName, hasRealName } from "@/lib/leadOptions";
import MessengerIcon from "@/components/ui/MessengerIcon";
import { timeAgo } from "@/lib/timeAgo";
import { getFunnel, resolveStage, LEGACY_LOSS_REASONS, type CrmSettings } from "@/lib/crmSettings";
import StageBar from "@/components/leads/StageBar";
import CloseLeadModal from "@/components/leads/CloseLeadModal";
import LeadSearchFilter, { type FilterOptions } from "@/components/leads/LeadSearchFilter";
import FunnelPicker from "@/components/leads/FunnelPicker";
import { EMPTY_FILTER, normalizeFilter, toFilterQuery, quickFilter, getValue, type LeadFilter, type QuickKind } from "@/lib/leadFilter";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { useAdCampaigns } from "@/lib/useAdCampaigns";
import { toastError } from "@/components/ui/toast";
import ListPager, { usePager } from "@/components/ui/ListPager";
import { PrivacyButton } from "@/components/ui/Privacy";
import { TaskFlag, useOpenTasksByLead } from "@/components/tasks/TaskFlag";

// Convert UTC ISO string to Europe/Warsaw (UTC+2) for datetime-local input
function toWarsawInput(utcStr: string): string {
  const d = new Date(new Date(utcStr).getTime() + 2 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

interface Lead {
  id: string;
  number: number;
  name: string;
  instagram: string | null;
  telegram: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  source: string | null;
  geo: string | null;
  niche: string | null;
  amount: number | null;
  currency?: string | null;
  status: string;
  siteStructure: string | null;
  hasExtraLang: boolean;
  languages: string | null;
  service: string | null;
  paymentSystem: string | null;
  usedServices: string[];
  projectDeadline: string | null;
  pushAt: string | null;
  pushComment: string | null;
  messenger: string | null;
  sourceDetail: string | null;
  calendarAt: string | null;
  calendarStatus: string | null;
  funnelId: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { tasks: number; deals: number };
}

type Tab = "leads" | "deals";
const TAB_STORAGE_KEY = "leads-tab";
const FUNNEL_STORAGE_KEY = "leads-funnel";
const VIEW_STORAGE_KEY = "leads-view";
type View = "list" | "kanban";

// Compact colored stage chip (mobile cards).
function StageChip({ settings, lead }: { settings: CrmSettings; lead: Lead }) {
  const { stage, reason } = resolveStage(settings, lead);
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap"
      style={{ color: stage.color, borderColor: `${stage.color}40`, background: `${stage.color}18` }}
    >
      {reason ? `${stage.label} · ${reason.label}` : stage.label}
    </span>
  );
}


// Small chip showing the scheduled calendar event on a lead row.
function CalendarChip({ lead, onClick }: { lead: Lead; onClick: (e: React.MouseEvent) => void }) {
  if (!lead.calendarAt) return null;
  const d = toLocalInput(lead.calendarAt);
  const label = `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`;
  return (
    <button
      onClick={onClick}
      title="Редагувати подію"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer hover:opacity-80 transition-opacity"
      style={{ color: "#4285F4", borderColor: "rgba(66,133,244,0.35)", background: "rgba(66,133,244,0.10)" }}
    >
      <CalendarPlus size={9} />
      {label}{lead.calendarStatus ? ` · ${lead.calendarStatus}` : ""}
    </button>
  );
}

// Blue meeting button in the list: no meeting → «Зустріч»; planned → its date and time (click = reschedule).
function MeetButton({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const planned = !!lead.calendarAt;
  const d = planned ? toLocalInput(lead.calendarAt!) : "";
  return (
    <button
      onClick={onClick}
      title={planned ? `Зустріч${lead.calendarStatus ? ` «${lead.calendarStatus}»` : ""} — натисни, щоб перепланувати` : "Запланувати зустріч у Google Календарі"}
      className="h-7 flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer tabular-nums"
      style={planned
        ? { color: "#fff", background: "#4285F4", borderColor: "#4285F4" }
        : { color: "#7aa7ff", background: "rgba(66,133,244,0.12)", borderColor: "rgba(66,133,244,0.35)" }}
    >
      <CalendarPlus size={13} />
      {planned ? `${d.slice(8, 10)}.${d.slice(5, 7)} · ${d.slice(11, 16)}` : "Зустріч"}
    </button>
  );
}

function ChannelChip({ channel }: { channel: string }) {
  return <MessengerIcon channel={channel} size={11} title={`Спілкуємось у ${channel}`} />;
}

function TelegramLink({ username }: { username: string }) {
  return (
    <a
      href={`https://t.me/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
      style={{ color: "#26A5E4" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
      @{username}
    </a>
  );
}

function LeadsViewInner({ potential = false, openNumber }: { potential?: boolean; openNumber?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const { campaigns: adCampaigns } = useAdCampaigns();
  const [search, setSearch] = useState("");
  // Bitrix-style filter from the search panel (applied on «Знайти»).
  const [filter, setFilterState] = useState<LeadFilter>(EMPTY_FILTER);
  // «Ліди» = all leads, «Угоди» = only stages marked as deals in Налаштування.
  const [tab, setTabState] = useState<Tab>("leads");
  const { settings, loaded: settingsLoaded, save: saveSettings } = useCrmSettings();
  const { fx } = useFx();
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [calendarLead, setCalendarLead] = useState<Lead | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const openTasks = useOpenTasksByLead();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [closingLead, setClosingLead] = useState<{ lead: Lead; kind?: "win" | "loss" } | null>(null);
  const [view, setViewState] = useState<View>("list");
  const [createStatus, setCreateStatus] = useState<string | null>(null); // quick «+» in a kanban column
  const [funnelId, setFunnelIdState] = useState<string>("");

  const filterKey = potential ? "potential-filter" : "leads-filter";

  // Restore the last opened tab (per browser). Done after mount to avoid a hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of localStorage after mount
      if (saved === "leads" || saved === "deals") setTabState(saved);
      const savedFunnel = localStorage.getItem(FUNNEL_STORAGE_KEY);
      if (savedFunnel) setFunnelIdState(savedFunnel);
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
      if (savedView === "list" || savedView === "kanban") setViewState(savedView);
      const savedFilter = localStorage.getItem(filterKey);
      if (savedFilter) setFilterState(normalizeFilter(JSON.parse(savedFilter)));
    } catch {}
  }, [filterKey]);

  function setView(next: View) {
    setViewState(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch {}
  }

  function setTab(next: Tab) {
    setTabState(next);
    try { localStorage.setItem(TAB_STORAGE_KEY, next); } catch {}
  }

  function setFunnelId(next: string) {
    if (next === "__edit__") { router.push("/settings"); return; }
    setFunnelIdState(next);
    setFilter({ ...filter, values: { ...filter.values, stages: [], reasons: [] } }); // stages differ between funnels
    try { localStorage.setItem(FUNNEL_STORAGE_KEY, next); } catch {}
  }

  // Applied filter is remembered per browser.
  function setFilter(next: LeadFilter) {
    setFilterState(next);
    try { localStorage.setItem(filterKey, JSON.stringify(next)); } catch {}
  }

  const isDeals = !potential && tab === "deals";
  // Funnels this user may see (until the role is loaded — all; the server filters anyway)
  const { access, loaded: accessLoaded } = useAccess();
  const visibleFunnels = accessLoaded ? settings.funnels.filter((f) => can(access, f.id, "view")) : settings.funnels;
  const shownFunnelId = visibleFunnels.some((f) => f.id === funnelId) ? funnelId : visibleFunnels[0]?.id ?? funnelId;
  const { funnel, filterOptions, quick, columnIds, filterParam } = useMemo(() => {
    // Current funnel (falls back to the first one if the saved id no longer exists).
    const funnel = getFunnel(settings, shownFunnelId);
    // On «Угоди» only deal stages are offered / shown.
    const base = isDeals ? funnel.stages.filter((s) => s.isDeal) : funnel.stages;
    const inGroup = (kind: string) =>
      !filter.group || (filter.group === "closed" ? kind !== "active" : filter.group === "active" ? kind === "active" : filter.group === kind);
    let allowed = base.filter((s) => inGroup(s.kind)).map((s) => s.id);
    const chosen = getValue<string[]>(filter, "stages");
    const picked = chosen.filter((id) => allowed.includes(id));
    if (chosen.length) allowed = picked; // chosen stages outside the tab/group → nothing matches
    const constrained = isDeals || !!filter.group || chosen.length > 0;
    const statuses = constrained ? (allowed.length ? allowed : ["__none__"]) : null;

    const reasons = [...funnel.win.reasons, ...funnel.loss.reasons, ...LEGACY_LOSS_REASONS]
      .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
    const winIds = new Set(funnel.win.reasons.map((r) => r.id));
    const filterOptions: FilterOptions = {
      stages: base.map((s) => ({ value: s.id, label: s.label, accent: s.color })),
      reasons: reasons.map((r) => ({ value: r.id, label: r.label, accent: winIds.has(r.id) ? "#22c55e" : "#f87171" })),
      campaigns: [],
    };
    const ids = (kind: string) => base.filter((s) => s.kind === kind).map((s) => s.id);
    const stageIds = { active: ids("active"), win: ids("win"), loss: ids("loss") };
    const quick = (kind: QuickKind) => quickFilter(kind, stageIds);
    return { funnel, filterOptions, quick, columnIds: statuses, filterParam: JSON.stringify(toFilterQuery(filter, statuses)) };
  }, [settings, shownFunnelId, isDeals, filter]);
  const funnelParam = potential || !settingsLoaded ? "" : funnel.id;
  // what this user may do in the shown funnel
  const canCreate = !accessLoaded || can(access, funnel.id, "create");
  const canDelete = !accessLoaded || can(access, funnel.id, "delete");

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (potential) params.set("potential", "1");
    if (search) params.set("q", search);
    if (filterParam !== "{}") params.set("f", filterParam);
    if (funnelParam) params.set("funnel", funnelParam);
    const res = await fetch(`/api/leads?${params}`);
    if (!res.ok) return;
    setLeads(await res.json());
    setLoading(false);
  }, [potential, search, filterParam, funnelParam]);

  useEffect(() => {
    setSearching(true);
    const t = setTimeout(() => fetchLeads().finally(() => setSearching(false)), 400);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  // Глобальний пошук з хедера: /leads?q=... підставляє пошук, /leads?open=<id> відкриває ліда.
  // Параметри одразу знімаються з URL, щоб повторний перехід спрацював знову.
  useEffect(() => {
    const q = searchParams.get("q");
    const open = searchParams.get("open");
    const v = searchParams.get("view");
    if (q) setSearch(q);
    if (open) setOpenLead(open);
    if (v === "kanban" || v === "list") setView(v);
    if (q || open || v) router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  // /leads/5 → open lead #5 (or say it was deleted)
  const [missingNumber, setMissingNumber] = useState<{ n: number; deleted: boolean } | null>(null);
  useEffect(() => {
    if (!openNumber) return;
    let cancelled = false;
    fetch(`/api/leads/by-number/${openNumber}`)
      .then((r) => r.json())
      .then((d: { id?: string; deleted?: boolean }) => {
        if (cancelled) return;
        if (d.id) setOpenLead(d.id);
        else setMissingNumber({ n: openNumber, deleted: !!d.deleted });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [openNumber]);

  // The address bar follows the open card: /leads/5 while lead #5 is open, /leads after closing.
  const syncUrl = !potential;
  const leadLoaded = useCallback((n: number) => {
    const target = `/leads/${n}`;
    if (syncUrl && n && window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [syncUrl]);
  function closeLead() {
    setOpenLead(null);
    if (syncUrl && window.location.pathname !== "/leads") window.history.replaceState(null, "", "/leads");
  }

  async function createLead(data: LeadFormData) {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funnelId: potential ? undefined : funnel.id, ...data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toastError("Помилка створення: " + (err.detail || err.error || res.status));
      return;
    }
    setShowCreate(false);
    setCreateStatus(null);
    fetchLeads();
  }

  async function updateLead(data: LeadFormData) {
    if (!editLead) return;
    const res = await fetch(`/api/leads/${editLead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toastError("Помилка збереження: " + (err.detail || err.error || res.status));
      return;
    }
    setEditLead(null);
    fetchLeads();
  }

  // Stage change from the list / kanban: first checks the unfinished tasks of the current stage.
  const stageGuard = useStageGuard(() => fetchLeads());
  function moveStage(lead: Lead, status: string) {
    stageGuard.guard(lead, status, (s) => changeStatus(lead.id, s));
  }

  // Click on a stage-bar cell → move lead to that stage (optimistic).
  async function changeStatus(id: string, status: string) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status, updatedAt: new Date().toISOString() } : l)));
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setLeads(prev);
      toastError("Не вдалося змінити стадію");
      return;
    }
    fetchLeads();
  }

  async function deleteLead(id: string) {
    setConfirmDeleteId(null);
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    fetchLeads();
  }

  // «Потенційно» = only leads on the «КП» stage; «Зароблено» = won.
  // Totals are in EUR: UAH / USD amounts are converted with the NBU rate from the header.
  const potentialAmount = Math.round(leads.reduce((s, l) => resolveStage(settings, l).stage.id === "PROPOSAL" ? s + toEur(l.amount, l.currency, fx) : s, 0));
  const wonAmount = Math.round(leads.reduce((s, l) => resolveStage(settings, l).stage.kind === "win" ? s + toEur(l.amount, l.currency, fx) : s, 0));

  // Newest first.
  const sortedLeads = useMemo(
    () => [...leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [leads]
  );
  // the list shows 30 rows (more on demand); in the kanban view the list isn't rendered at all
  const pager = usePager(sortedLeads, potential ? "potential" : isDeals ? "deals" : "leads");
  const pageLeads = view === "kanban" ? [] : pager.visible;

  const stats = (
    <>
      {leads.length} {isDeals ? "угод в роботі" : "контактів"}
      {potentialAmount > 0 && (
        <span data-private="amount" className="ml-2 font-medium whitespace-nowrap" style={{ color: "var(--accent)" }}>
          · €{potentialAmount.toLocaleString()} потенційно (КП)
        </span>
      )}
      {wonAmount > 0 && (
        <span data-private="amount" className="ml-2 font-medium whitespace-nowrap" style={{ color: "#22c55e" }}>
          · €{wonAmount.toLocaleString()} зароблено
        </span>
      )}
    </>
  );

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-[var(--text)]">{potential ? "Potential" : isDeals ? "Угоди" : "Ліди"}</h1>
          <p className="hidden sm:block text-xs text-[var(--text-muted)] mt-0.5">{stats}</p>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <PrivacyButton />
          {!potential && (
            <FunnelPicker funnels={visibleFunnels} all={settings.funnels} value={funnel.id} onChange={setFunnelId}
              onEdit={!accessLoaded || canPage(access, "settings") ? () => router.push("/settings") : undefined} />
          )}
          {canCreate && <button
            onClick={() => setShowCreate(true)}
            title="Новий лід"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-9 text-black text-sm rounded-lg transition-colors cursor-pointer font-semibold shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Новий лід</span>
          </button>}
        </div>
      </div>
      {/* mobile: stats under the title, full width */}
      <p className="sm:hidden -mt-1 text-xs text-[var(--text-muted)] leading-relaxed">{stats}</p>

      {/* Toolbar: [Ліди | Угоди] [Пошук + фільтр] */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex items-center gap-2 sm:contents">
        {!potential && (
          <div className="flex-1 sm:flex-none flex items-center gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5 shrink-0">
            {([["leads", "Ліди"], ["deals", "Угоди"]] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex-1 sm:flex-none px-3.5 py-2 sm:py-1.5 text-sm rounded-md transition-colors cursor-pointer ${tab === value ? "text-black font-semibold" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                style={tab === value ? { background: "var(--accent)" } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* View: Канбан / Список */}
        <div className="flex items-center gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5 shrink-0">
          {([["kanban", "Канбан", Columns3], ["list", "Список", List]] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              title={label}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-sm rounded-md transition-colors cursor-pointer ${view === value ? "bg-[var(--surface-2)] text-[var(--text)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
            >
              <Icon size={14} />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>
        </div>

        <LeadSearchFilter
          search={search}
          onSearch={setSearch}
          filter={filter}
          onApply={setFilter}
          options={{ ...filterOptions, campaigns: adCampaigns.map((c) => c.name) }}
          quick={quick}
          savedFilters={settings.savedFilters}
          onSaveFilters={(savedFilters) => saveSettings({ ...settings, savedFilters })}
          searching={searching}
        />
      </div>

      {view === "kanban" && (
        <LeadsKanban
          leads={leads}
          settings={settings}
          funnel={funnel}
          stageIds={columnIds}
          loading={loading}
          onOpen={setOpenLead}
          onCalendar={setCalendarLead}
          onDelete={(lead) => setConfirmDeleteId(lead.id)}
          onMove={(lead, st) => moveStage(lead, st)}
          onFinish={(lead, kind) => setClosingLead({ lead, kind })}
          onQuickAdd={(st) => { setCreateStatus(st); setShowCreate(true); }}
          canAdd={canCreate}
          canDelete={canDelete}
        />
      )}

      {/* ── Mobile cards (< sm) ── */}
      <div className={view === "kanban" ? "hidden" : "block sm:hidden space-y-2"}>
        {loading ? (
          <p className="text-center py-10 text-sm text-[var(--text-muted)]">Завантаження...</p>
        ) : sortedLeads.length === 0 ? (
          <p className="text-center py-10 text-sm text-[var(--text-muted)]">Лідів немає</p>
        ) : pageLeads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => setOpenLead(lead.id)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 cursor-pointer active:opacity-80 transition-opacity"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <p data-private="name" className="font-medium text-[var(--text)] truncate">{leadDisplayName(lead)}</p>
                {lead.niche && <p data-private="niche" className="text-xs text-[var(--text-muted)] truncate">{lead.niche}</p>}
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <StageChip settings={settings} lead={lead} />
                <button
                  onClick={(e) => { e.stopPropagation(); setCalendarLead(lead); }}
                  title="Додати в Google Календар"
                  className="-m-1 p-2.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                >
                  <CalendarPlus size={15} />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {lead.telegram && <span data-private="contacts"><TelegramLink username={lead.telegram} /></span>}
              {lead.phone && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(lead.phone!);
                    setCopiedPhone(lead.id);
                    setTimeout(() => setCopiedPhone(null), 1500);
                  }}
                  data-private="contacts"
                  className="flex items-center gap-1 text-xs text-[var(--text-muted)] cursor-pointer"
                >
                  <Phone size={10} />
                  {copiedPhone === lead.id ? <span className="text-green-400">✓</span> : lead.phone}
                </button>
              )}
              {lead.source && <span data-private="source" className="text-xs text-[var(--text-muted)]">{lead.source}</span>}
              {lead.messenger && <ChannelChip channel={lead.messenger} />}
              <CalendarChip lead={lead} onClick={(e) => { e.stopPropagation(); setCalendarLead(lead); }} />
              {lead.amount ? (
                <span data-private="amount" className="text-xs font-semibold ml-auto" style={{ color: "var(--accent)" }}>
                  {formatMoney(lead.amount, lead.currency)}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {!loading && view !== "kanban" && <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl"><ListPager pager={pager} noun={isDeals ? "угод" : "лідів"} className="border-t-0" /></div>}
      </div>

      {/* ── Desktop table (≥ sm) ── */}
      <div className={`${view === "kanban" ? "hidden" : "hidden sm:block"} bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {["Лід", "Контакти", "Стадія", "Джерело", "Сума", "Оновлено"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap">{h}</th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-[var(--text-muted)]">Завантаження...</td></tr>
            ) : sortedLeads.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-[var(--text-muted)]">{isDeals ? "Угод в роботі немає" : "Лідів немає"}</td></tr>
            ) : pageLeads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                onClick={() => setOpenLead(lead.id)}
              >
                {/* Лід: ім'я (або «Угода #4501») + ніша */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TaskFlag info={openTasks.get(lead.id)} />
                    <div data-private="name" title={leadDisplayName(lead)} className={`text-[13px] font-medium truncate max-w-[240px] leading-tight ${hasRealName(lead) ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                      {leadDisplayName(lead)}
                    </div>
                  </div>
                  {lead.niche && <div data-private="niche" className="text-[11px] text-[var(--text-muted)] truncate max-w-[160px] leading-tight mt-0.5">{lead.niche}</div>}
                </td>

                {/* Контакти: телефон (клік — копіювати) + месенджер, під ним Telegram. Instagram не показуємо. */}
                <td className="px-3 py-2">
                  <div data-private="contacts" className="flex items-center gap-1.5 w-fit">
                    {lead.phone ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(lead.phone!);
                          setCopiedPhone(lead.id);
                          setTimeout(() => setCopiedPhone(null), 1500);
                        }}
                        className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--accent)] transition-colors cursor-pointer whitespace-nowrap"
                        title="Скопіювати"
                      >
                        <Phone size={10} className="text-[var(--text-muted)]" />
                        {copiedPhone === lead.id ? <span className="text-green-400">✓ Скопійовано</span> : lead.phone}
                      </button>
                    ) : lead.email ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><Mail size={10} />{lead.email}</span>
                    ) : (
                      <span className="text-xs text-[var(--text-dim)]">—</span>
                    )}
                    {lead.messenger && <ChannelChip channel={lead.messenger} />}
                  </div>
                  {lead.telegram && <div data-private="contacts" className="mt-0.5 w-fit"><TelegramLink username={lead.telegram} /></div>}
                </td>

                {/* Стадія — сегментована смужка, клік по сегменту змінює стадію */}
                <td className="px-3 py-2">
                  <StageBar
                    resolved={resolveStage(settings, lead)}
                    onChange={(st) => moveStage(lead, st)}
                    onFinish={() => setClosingLead({ lead })}
                  />
                </td>

                {/* Джерело + кампанія (локацію не показуємо) */}
                <td className="px-3 py-2">
                  <div data-private="source" title={lead.source ?? ""} className="text-xs text-[var(--text)] truncate max-w-[150px] leading-tight">{lead.source ?? "—"}</div>
                  {lead.sourceDetail && <div data-private="source" className="text-[11px] text-[var(--text-muted)] truncate max-w-[150px] leading-tight mt-0.5">{lead.sourceDetail}</div>}
                </td>

                <td className="px-3 py-2">
                  {lead.amount
                    ? <span data-private="amount" className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--accent)" }}>{formatMoney(lead.amount, lead.currency)}</span>
                    : <span className="text-xs text-[var(--text-dim)]">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-muted)] whitespace-nowrap" title={new Date(lead.updatedAt).toLocaleString("uk-UA")}>
                  {timeAgo(lead.updatedAt)}
                </td>
                {/* Дії: зустріч (запланована → дата/час, клік — перепланувати) + видалити */}
                <td className="pl-3 pr-5 py-2 w-px">
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <MeetButton lead={lead} onClick={() => setCalendarLead(lead)} />
                    {canDelete && <button
                      onClick={() => setConfirmDeleteId(lead.id)}
                      title="Видалити"
                      aria-label="Видалити"
                      className="w-7 h-7 flex items-center justify-center rounded-lg border transition-colors cursor-pointer text-red-400 bg-red-500/10 border-red-500/25 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300"
                    >
                      <Trash2 size={13} />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && view !== "kanban" && <ListPager pager={pager} noun={isDeals ? "угод" : "лідів"} />}
      </div>

      {stageGuard.modal}

      {/* Modals */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateStatus(null); }} title="Новий лід" size="lg">
        {showCreate && (
          <LeadForm
            key={createStatus ?? "new"}
            onSave={createLead}
            onCancel={() => { setShowCreate(false); setCreateStatus(null); }}
            funnelId={potential ? null : funnel.id}
            initial={createStatus ? { status: createStatus } : undefined}
          />
        )}
      </Modal>

      <Modal open={!!editLead} onClose={() => setEditLead(null)} title="Редагувати ліда" size="lg">
        {editLead && (
          <LeadForm
            edit
            funnelId={editLead.funnelId}
            onSave={updateLead}
            onCancel={() => setEditLead(null)}
            initial={{
              name: editLead.name,
              instagram: editLead.instagram ?? "",
              telegram: editLead.telegram ?? "",
              phone: editLead.phone ?? "",
              email: editLead.email ?? "",
              comment: editLead.comment ?? "",
              source: editLead.source ?? "",
              sourceDetail: editLead.sourceDetail ?? "",
              geo: editLead.geo ?? "",
              niche: editLead.niche ?? "",
              amount: editLead.amount?.toString() ?? "",
              currency: editLead.currency ?? "EUR",
              status: editLead.status,
              siteStructure: editLead.siteStructure ?? "",
              hasExtraLang: editLead.hasExtraLang ?? false,
              languages: editLead.languages ?? "",
              service: editLead.service ?? "",
              paymentSystem: editLead.paymentSystem ?? "",
              paymentSystemCustom: "",
              projectDeadline: editLead.projectDeadline ?? "",
              pushAt: editLead.pushAt ? toWarsawInput(editLead.pushAt) : "",
              pushComment: editLead.pushComment ?? "",
              messenger: editLead.messenger ?? "",
              createdAt: editLead.createdAt?.slice(0, 10) ?? "",
            }}
          />
        )}
      </Modal>

      {openLead && (
        <LeadDrawer
          key={openLead}
          leadId={openLead}
          onClose={closeLead}
          onUpdate={fetchLeads}
          onOpenLead={setOpenLead}
          onLoaded={leadLoaded}
        />
      )}

      {missingNumber && (
        <Modal open onClose={() => { setMissingNumber(null); closeLead(); }} title={`Лід #${missingNumber.n}`}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              {missingNumber.deleted
                ? <>Лід <b className="text-[var(--text)]">#{missingNumber.n}</b> було видалено. Номер за ним закріплений і більше нікому не видається.</>
                : <>Ліда з номером <b className="text-[var(--text)]">#{missingNumber.n}</b> ще не існує.</>}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => { setMissingNumber(null); closeLead(); }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg text-black cursor-pointer"
                style={{ background: "var(--accent)" }}
              >
                До списку лідів
              </button>
            </div>
          </div>
        </Modal>
      )}

      {closingLead && (
        <CloseLeadModal
          lead={closingLead.lead}
          initialKind={closingLead.kind}
          funnel={getFunnel(settings, closingLead.lead.funnelId)}
          onClose={() => setClosingLead(null)}
          onDone={fetchLeads}
        />
      )}

      {calendarLead && (
        <CalendarModal lead={calendarLead} onClose={() => setCalendarLead(null)} onSaved={() => fetchLeads()} />
      )}

      {/* Delete confirmation */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="Видалити ліда?">
        <p className="text-sm text-[var(--text-muted)] mb-5">
          Цю дію не можна скасувати. Лід та всі пов'язані задачі й активності будуть видалені.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmDeleteId(null)}
            className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            Скасувати
          </button>
          <button
            onClick={() => confirmDeleteId && deleteLead(confirmDeleteId)}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors cursor-pointer"
          >
            Так, видалити
          </button>
        </div>
      </Modal>
    </div>
  );
}

// Спільний вигляд для вкладок Leads та Potential (potential — гарячі стадії + пуші).
// useSearchParams вимагає Suspense-межу на статично згенерованій сторінці.
export default function LeadsView({ potential = false, openNumber }: { potential?: boolean; openNumber?: number }) {
  return (
    <Suspense fallback={null}>
      <LeadsViewInner potential={potential} openNumber={openNumber} />
    </Suspense>
  );
}
