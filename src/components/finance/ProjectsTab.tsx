"use client";

import { useMemo, useState } from "react";
import { useEdgeScroll } from "@/components/ui/EdgeScroll";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ArrowDown, ArrowUp, Briefcase, Building2, ChevronLeft, Columns3, FileSpreadsheet, FileText, LayoutGrid, List, Pencil, Plus, Search, ShoppingCart, Sparkles, Store, Trash2, UserPlus, UserRound, X, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ask } from "@/components/ui/dialogs";
import { toast, toastError } from "@/components/ui/toast";
import { CURRENCIES, fmtMoney, projectTitle } from "@/lib/finance";
import { Avatar } from "@/components/finance/Person";
import ListPager, { usePager } from "@/components/ui/ListPager";
import { isPhoneLike, leadDisplayName } from "@/lib/leadOptions";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { LEGACY_LOSS_REASONS, resolveStage, type CrmSettings, type Stage } from "@/lib/crmSettings";
import LeadSearchFilter, { type FilterOptions } from "@/components/leads/LeadSearchFilter";
import StageBar from "@/components/leads/StageBar";
import { EMPTY_FILTER, activeKeys, getValue, normalizeFilter, quickFilter, toFilterQuery, type LeadFilter, type QuickKind } from "@/lib/leadFilter";
import { useAdCampaigns } from "@/lib/useAdCampaigns";
import { DEALS_KEY, PROJECTS_KEY, TX_KEY, type DealRow, type ProjectRow } from "@/components/finance/useFinance";
import { pct, projectStats, usePnlData, type ProjectStat } from "@/components/finance/pnlData";
import { groupNum } from "@/lib/numInput";
import { projectProgress, type Progress } from "@/lib/projectProgress";
import { PrivacyButton } from "@/components/ui/Privacy";
import { CUR_SYMBOL, CurrencyButtons, FieldLabel, FormFooter, Panel, TemplateCards, cellLabelCls, fieldCls, type CardOption } from "@/components/ui/formKit";
import { LEAD_SERVICES } from "@/lib/leadOptions";

type SortKey = "name" | "value" | "income" | "left" | "costs" | "cash" | "margin" | "progress";
type Filter = "deals" | "debt" | "sheet";

// contact data that goes into a new project deal
interface ContactFields { phone?: string | null; telegram?: string | null; instagram?: string | null; email?: string | null; messenger?: string | null; payer?: string | null }
interface ContactHit extends ContactFields { id: string; number: number; name: string; projectName?: string | null; funnelId: string | null; status: string; closeReason?: string | null }

const paymentsFunnel = (s: CrmSettings) => s.funnels.find((f) => f.payments) ?? null;

// «Що робимо» cards of a new project (the deal's service)
const SERVICE_LOOK: Record<string, [LucideIcon, string, string]> = {
  "АІ лендос": [Sparkles, "#a78bfa", "АІ лендос"],
  "АІ корпоративний": [Building2, "#c084fc", "АІ корпоративний"],
  "АІ каталог": [LayoutGrid, "#e879f9", "АІ каталог"],
  "ШБ лендинг": [FileText, "#38bdf8", "ШБ лендинг"],
  "ШБ Корпоративний": [Briefcase, "#22d3ee", "ШБ корпоративний"],
  "ШБ Інтернет магазин": [ShoppingCart, "#2dd4bf", "ШБ магазин"],
  "Індив Інтернет магазин": [Store, "#f59e0b", "Індив магазин"],
};
const PROJECT_TEMPLATES: CardOption[] = [
  { key: "", label: "Інше", icon: Plus, color: "#C98C0A" },
  ...LEAD_SERVICES.filter((sv) => sv.startsWith("АІ")).map((sv) => { const [icon, color, label] = SERVICE_LOOK[sv] ?? [Briefcase, "#C98C0A", sv]; return { key: sv, label, icon, color }; }),
];
const projectTemplate = (sv: string) => PROJECT_TEMPLATES.find((t) => t.key === sv) ?? PROJECT_TEMPLATES[0];

// Create a deal in «Операційка» (the only place projects live). Returns the new deal.
async function createDeal(settings: CrmSettings, data: { name: string; projectName?: string; amount: number | null; currency: string; service?: string; contact?: ContactFields }): Promise<DealRow | null> {
  const f = paymentsFunnel(settings);
  if (!f) { toastError("Увімкни «Оплати в угодах» у воронці «Операційка» (Налаштування)"); return null; }
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data.contact, name: data.name, projectName: data.projectName ?? null, amount: data.amount, currency: data.currency, service: data.service || null, funnelId: f.id, status: f.stages[0]?.id }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { toastError(out.error ?? "Не вдалося створити угоду"); return null; }
  return out as DealRow;
}

const VIEW_KEY = "projects-view";
const FILTER_KEY = "projects-filter";

// «Проєкти» (under CRM): deals of «Операційка» — list with money or kanban by stage.
// Projects imported from the sheet and not linked to a deal yet are under «З таблиці».
export default function ProjectsTab({ canEdit, onOpenLead }: { canEdit: boolean; onOpenLead: (id: string) => void }) {
  const d = usePnlData();
  const { settings, save: saveSettings } = useCrmSettings();
  const { campaigns: adCampaigns } = useAdCampaigns();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  // the CRM search: the same filter panel, applied to deals of «Операційка» on the server
  const [filter, setFilterState] = useState<LeadFilter>(() => {
    try { return normalizeFilter(JSON.parse(localStorage.getItem(FILTER_KEY) ?? "null")); } catch { return EMPTY_FILTER; }
  });
  const setLeadFilter = (f: LeadFilter) => { setFilterState(f); try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* ignore */ } };
  const [tab, setTab] = useState<Filter>("deals");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "progress", dir: -1 });
  const [newOpen, setNewOpen] = useState(false);
  const [sheetEdit, setSheetEdit] = useState<ProjectRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [view, setViewState] = useState<"list" | "kanban">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "kanban" ? "kanban" : "list"; } catch { return "list"; }
  });
  const setView = (v: "list" | "kanban") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

  // project name lives on the deal (its `name` is the contact)
  async function rename(deal: DealRow, v: string) {
    setRenaming(null);
    const next = v.trim();
    if (next === (deal.projectName ?? "")) return;
    const res = await fetch(`/api/leads/${deal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectName: next || null }) });
    if (!res.ok) return toastError("Не вдалося перейменувати");
    qc.invalidateQueries({ queryKey: DEALS_KEY });
    qc.invalidateQueries({ queryKey: TX_KEY });
  }

  // kanban: move a deal to another stage (optimistic)
  async function move(deal: DealRow, status: string) {
    const prev = qc.getQueryData<DealRow[]>(DEALS_KEY);
    qc.setQueryData<DealRow[]>(DEALS_KEY, (list) => list?.map((x) => (x.id === deal.id ? { ...x, status } : x)));
    const res = await fetch(`/api/leads/${deal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) { qc.setQueryData(DEALS_KEY, prev); toastError(res.status === 403 ? "Немає права змінювати цю угоду" : "Не вдалося перемістити"); }
  }

  const pf = paymentsFunnel(settings);
  const { filterOptions, quick, filterParam } = useMemo(() => {
    const stages = pf?.stages ?? [];
    const inGroup = (kind: string) =>
      !filter.group || (filter.group === "closed" ? kind !== "active" : filter.group === "active" ? kind === "active" : filter.group === kind);
    let allowed = stages.filter((s) => inGroup(s.kind)).map((s) => s.id);
    const chosen = getValue<string[]>(filter, "stages");
    if (chosen.length) allowed = chosen.filter((id) => allowed.includes(id));
    const constrained = !!filter.group || chosen.length > 0;
    const statuses = constrained ? (allowed.length ? allowed : ["__none__"]) : null;
    const reasons = [...(pf?.win.reasons ?? []), ...(pf?.loss.reasons ?? []), ...LEGACY_LOSS_REASONS].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
    const winIds = new Set((pf?.win.reasons ?? []).map((r) => r.id));
    const filterOptions: FilterOptions = {
      stages: stages.map((s) => ({ value: s.id, label: s.label, accent: s.color })),
      reasons: reasons.map((r) => ({ value: r.id, label: r.label, accent: winIds.has(r.id) ? "#22c55e" : "#f87171" })),
      campaigns: [],
    };
    const ids = (kind: string) => stages.filter((s) => s.kind === kind).map((s) => s.id);
    const quick = (kind: QuickKind) => quickFilter(kind, { active: ids("active"), win: ids("win"), loss: ids("loss") });
    return { filterOptions, quick, filterParam: JSON.stringify(toFilterQuery(filter, statuses)) };
  }, [pf, filter]);
  const searching = !!q.trim() || !!filter.group || activeKeys(filter).length > 0;
  const matchQ = useQuery({
    queryKey: ["projects-search", pf?.id, q.trim(), filterParam],
    enabled: searching && !!pf,
    queryFn: async (): Promise<Set<string>> => {
      const params = new URLSearchParams({ funnel: pf!.id });
      if (q.trim()) params.set("q", q.trim());
      if (filterParam !== "{}") params.set("f", filterParam);
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      return new Set(((await res.json()) as { id: string }[]).map((x) => x.id));
    },
    placeholderData: (prev) => prev,
  });
  const matched = searching ? matchQ.data ?? null : null;

  const stats = projectStats(d.deals, d.projects, d.txs, d.fin, d.toUah);
  const real = stats.filter((s) => s.type !== "none");
  const sheetCount = stats.filter((s) => s.type === "sheet").length;

  const needle = q.trim().toLowerCase();
  const rows = stats
    .filter((s) => tab === "sheet" ? s.type === "sheet" : tab === "debt" ? s.left > 0 : s.type !== "sheet")
    // deals: what the CRM search found; sheet projects: plain text match
    .filter((s) => !searching || (s.deal ? !matched || matched.has(s.deal.id) : !!needle && !activeKeys(filter).length && !filter.group && `${s.name} ${s.sheetNames.join(" ")} ${s.project?.client ?? ""}`.toLowerCase().includes(needle)))
    .sort((a, b) => {
      if (a.type === "none") return 1;
      if (b.type === "none") return -1;
      const v = (s: ProjectStat): number | string => {
        switch (sort.key) {
          case "name": return s.name.toLowerCase();
          case "margin": return s.margin ?? -Infinity;
          case "progress": return s.deal ? projectProgress(settings, s.deal)?.pct ?? -1 : -2;
          default: return s[sort.key];
        }
      };
      const x = v(a), y = v(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  const pager = usePager(rows, "projects");

  const refresh = () => { qc.invalidateQueries({ queryKey: PROJECTS_KEY }); qc.invalidateQueries({ queryKey: DEALS_KEY }); qc.invalidateQueries({ queryKey: TX_KEY }); };

  // sheet project → new deal in «Операційка» with its value, and link them
  async function toDeal(p: ProjectRow) {
    setBusyId(p.id);
    try {
      const deal = await createDeal(settings, { name: p.name, amount: p.value, currency: p.currency });
      if (!deal) return;
      const res = await fetch(`/api/finance/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: deal.id }) });
      if (!res.ok) return toastError("Угоду створено, але не вдалося зв'язати");
      toast({ kind: "success", title: "Угоду створено в «Операційці»", text: `${p.name} — усі оплати й витрати перенесено`, duration: 3500 });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "deals", label: "Усі проєкти", n: stats.filter((s) => s.type === "deal").length },
    { key: "debt", label: "З боргом", n: real.filter((p) => p.left > 0).length },
    ...(sheetCount ? [{ key: "sheet" as Filter, label: "Не зв'язані", n: sheetCount }] : []),
  ];

  const th = (key: SortKey, label: string, cls = "text-right") => (
    <th className={`${cls} font-medium py-2.5 pr-4 cursor-pointer select-none hover:text-[var(--text-muted)]`}
      onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }))}>
      <span className="inline-flex items-center gap-0.5">{label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
    </th>
  );
  const kanban = view === "kanban" && tab !== "sheet";

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><Briefcase size={17} /></div>
        <h1 className="text-lg font-semibold text-[var(--text)] mr-auto">Проєкти</h1>
        <PrivacyButton />
        {canEdit && (
          <button onClick={() => setNewOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110" style={{ background: "var(--accent)" }}>
            <Plus size={15} /> Проєкт
          </button>
        )}
      </div>

      {/* view + search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5 shrink-0">
          {([["kanban", "Канбан", Columns3], ["list", "Список", List]] as const).map(([value, lbl, Icon]) => (
            <button key={value} onClick={() => setView(value)} title={lbl}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${view === value ? "bg-[var(--surface-2)] text-[var(--text)] font-medium" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
              <Icon size={14} /><span>{lbl}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 basis-full sm:basis-auto min-w-0 sm:min-w-[260px]">
          <LeadSearchFilter
            search={q}
            onSearch={setQ}
            filter={filter}
            onApply={setLeadFilter}
            options={{ ...filterOptions, campaigns: adCampaigns.map((c) => c.name) }}
            quick={quick}
            savedFilters={settings.savedFilters}
            onSaveFilters={(savedFilters) => saveSettings({ ...settings, savedFilters })}
            searching={searching && matchQ.isFetching}
            extras={chips.filter((c) => c.key !== "deals").map((c) => ({ key: c.key, label: c.label, n: c.n, active: tab === c.key, onToggle: () => setTab(tab === c.key ? "deals" : c.key) }))}
          />
        </div>
      </div>

      {tab === "sheet" && sheetCount > 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          Це проєкти з фінтаблиці: <b className="text-[var(--text)]">Зв&apos;язати</b> — з наявною угодою, <b className="text-[var(--text)]">В угоду</b> — створити нову. Оплати й витрати переїдуть у картку угоди.
        </div>
      )}

      {kanban ? (
        <ProjectsKanban settings={settings} rows={rows.filter((s) => s.deal)} loading={d.loading} onOpen={onOpenLead} onMove={canEdit ? move : undefined} />
      ) : (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {/* phone: a card per project instead of the wide table */}
        <div className="md:hidden divide-y divide-white/[0.05]">
          {d.loading && <div className="py-12 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>}
          {!d.loading && !rows.length && (
            <div className="py-12 text-center text-sm text-[var(--text-muted)]">
              {needle ? "Нічого не знайдено" : tab === "deals" ? "Проєктів ще немає — натисни «Проєкт»" : "Нічого не знайдено"}
            </div>
          )}
          {pager.visible.map((s) => (
            <MobileProjectCard key={s.key} s={s} settings={settings} sheet={tab === "sheet"} canEdit={canEdit} busy={!!s.project && busyId === s.project.id}
              onOpen={() => { if (s.deal) onOpenLead(s.deal.id); else if (s.project && canEdit) setSheetEdit(s.project); }}
              onLink={() => setSheetEdit(s.project)} onToDeal={() => toDeal(s.project!)} />
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="fit-table w-full text-sm min-w-[940px] 2xl:min-w-[1080px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)] bg-white/[0.015]">
                {th("name", "Проєкт", "text-left pl-4")}
                <th className="text-left font-medium py-2.5 pr-4">Стадія</th>
                {th("value", "Вартість")}
                {th("income", "Отримано")}
                {th("left", "Залишилось")}
                {th("costs", "Витрати")}
                {th("cash", "По касі")}
                {th("margin", "Маржа")}
                {tab === "sheet" ? <th className="w-[190px]" /> : th("progress", "Виконано", "text-left")}
              </tr>
            </thead>
            <tbody>
              {d.loading && <tr><td colSpan={9} className="py-12 text-center text-[var(--text-muted)]">Завантаження…</td></tr>}
              {!d.loading && !rows.length && (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-[var(--text-muted)]">
                  {needle ? "Нічого не знайдено" : tab === "deals" ? "Проєктів ще немає — натисни «Проєкт»" : "Нічого не знайдено"}
                </td></tr>
              )}
              {pager.visible.map((s) => {
                const none = s.type === "none";
                const paidPct = s.value > 0 ? Math.min(100, (s.income / s.value) * 100) : 0;
                const stage = s.deal ? resolveStage(settings, s.deal).stage : null;
                return (
                  <tr key={s.key}
                    onClick={() => { if (s.deal) onOpenLead(s.deal.id); else if (s.project && canEdit) setSheetEdit(s.project); }}
                    className={`border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025] transition-colors ${none ? "bg-white/[0.012]" : "cursor-pointer"}`}>
                    <td className="py-2 pl-4 pr-4 max-w-[320px]">
                      {s.deal && renaming === s.deal.id ? (
                        <input autoFocus defaultValue={s.deal.projectName ?? ""} placeholder={`Проєкт #${s.deal.number}`} onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => rename(s.deal!, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }}
                          className="w-full px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--accent)]/60 text-sm text-[var(--text)] outline-none" />
                      ) : (
                        <div className="group/name flex items-center gap-1.5 min-w-0">
                          <span data-private="project" className={`truncate ${none ? "text-[var(--text-muted)] italic" : "text-[var(--text)] font-medium"}`}>{s.name}</span>
                          {s.deal && canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); setRenaming(s.deal!.id); }} title="Назва проєкту"
                              className="p-0.5 rounded text-[var(--text-dim)] hover:text-[var(--text)] opacity-0 group-hover/name:opacity-100 cursor-pointer"><Pencil size={11} /></button>
                          )}
                        </div>
                      )}
                      {s.deal ? (
                        s.deal.name.trim() ? <div data-private={isPhoneLike(s.deal.name) ? "contacts" : "name"} className="text-[11px] text-[var(--text-muted)] truncate">{s.deal.name}</div> : null
                      ) : s.project ? (
                        <div className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] truncate"><FileSpreadsheet size={10} className="shrink-0" />з таблиці{s.project.client ? <span data-private="name">&nbsp;· {s.project.client}</span> : null}</div>
                      ) : <div className="text-[11px] text-[var(--text-dim)]">оплати й підрядники без проєкту</div>}
                    </td>
                    <td className="py-2 pr-4">
                      {s.deal && stage && (
                        <StageBar resolved={resolveStage(settings, s.deal)}
                          onChange={canEdit ? (st) => move(s.deal!, st) : undefined}
                          onFinish={() => onOpenLead(s.deal!.id)} />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums" data-private="amount">
                      {s.value > 0 ? (
                        <>
                          <div className="text-[var(--text)]">{fmtMoney(s.value)}</div>
                          {s.currency !== "UAH" && <div className="text-[10px] text-[var(--text-dim)]">{fmtMoney(s.valueCur, s.currency)}</div>}
                        </>
                      ) : <span className="text-[var(--text-dim)]">—</span>}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums" data-private="amount">
                      <div className="text-[#4ade80]">{s.income ? fmtMoney(s.income) : <span className="text-[var(--text-dim)]">—</span>}</div>
                      {s.value > 0 && <div className="mt-1 ml-auto w-20 h-1 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${paidPct}%` }} /></div>}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums" data-private="amount">{s.left > 0 ? <span className="text-[#fbbf24]">{fmtMoney(s.left)}</span> : <span className="text-[var(--text-dim)]">—</span>}</td>
                    <td data-private="amount" className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]" title={s.costs ? `підрядники ${fmtMoney(s.contractor)} · інше ${fmtMoney(s.expense)} · податок ${fmtMoney(s.tax)}` : undefined}>{s.costs + s.tax ? `−${fmtMoney(s.costs + s.tax)}` : <span className="text-[var(--text-dim)]">—</span>}</td>
                    <td data-private="amount" className="py-2 pr-4 text-right tabular-nums font-semibold" style={{ color: s.cash >= 0 ? "#C98C0A" : "#f87171" }}>{fmtMoney(s.cash)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {s.margin === null ? <span className="text-[var(--text-dim)]">—</span> : (
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ color: s.margin >= 0.5 ? "#4ade80" : s.margin >= 0.2 ? "#fbbf24" : "#f87171", background: "rgba(255,255,255,0.04)" }}>{pct(s.margin)}</span>
                      )}
                    </td>
                    {tab === "sheet" && s.project ? (
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {canEdit && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setSheetEdit(s.project); }} className="px-2 py-1 rounded-md text-[11px] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer mr-1">Зв&apos;язати</button>
                            <button onClick={(e) => { e.stopPropagation(); toDeal(s.project!); }} disabled={busyId === s.project.id}
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-black cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)" }}>
                              {busyId === s.project.id ? "…" : "В угоду"}
                            </button>
                          </>
                        )}
                      </td>
                    ) : (
                      <td className="py-2 pr-4"><ProgressCell p={s.deal ? projectProgress(settings, s.deal) : null} /></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!d.loading && <ListPager pager={pager} noun="проєктів" />}
      </div>
      )}

      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} onCreated={(deal) => { refresh(); onOpenLead(deal.id); }} />}
      {sheetEdit && <SheetProjectModal project={sheetEdit} deals={d.deals} onClose={() => setSheetEdit(null)} onSaved={refresh} />}
    </div>
  );
}

// Kanban of projects: a column per stage of «Операційка» (arrow headers like the CRM board), drag a card to move it.
function ProjectsKanban({ settings, rows, loading, onOpen, onMove }: {
  settings: CrmSettings; rows: ProjectStat[]; loading: boolean; onOpen: (id: string) => void; onMove?: (deal: DealRow, status: string) => void;
}) {
  const funnel = paymentsFunnel(settings);
  const { ref: edgeRef, onScroll: edgeScroll, arrows: edgeArrows } = useEdgeScroll(`${rows.length}|${funnel?.stages.length}`);
  if (!funnel) return <div className="py-12 text-center text-sm text-[var(--text-muted)]">Увімкни «Оплати в угодах» у воронці «Операційка» (Налаштування)</div>;
  const byStage = new Map<string, ProjectStat[]>();
  for (const s of rows) {
    const st = resolveStage(settings, s.deal!).stage;
    byStage.set(st.id, [...(byStage.get(st.id) ?? []), s]);
  }
  // every stage, the two final ones too («Завершення проєкту» / «Програш»)
  const columns: Stage[] = [...funnel.stages];
  for (const [id, list] of byStage) if (!columns.some((c) => c.id === id)) columns.push(resolveStage(settings, list[0].deal!).stage);

  function onDragEnd(r: DropResult) {
    if (!onMove || !r.destination || r.destination.droppableId === r.source.droppableId) return;
    const s = rows.find((x) => x.deal!.id === r.draggableId);
    const target = columns.find((c) => c.id === r.destination!.droppableId);
    if (!s?.deal || !target) return;
    if (target.kind === "active") onMove(s.deal, target.id);
    else onOpen(s.deal.id); // finishing asks for the case link / reason — in the deal card
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {/* phone: stage chips with counts — tap jumps to the column */}
      <div className="md:hidden -mx-3 px-3 mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        {columns.map((stage) => {
          const n = byStage.get(stage.id)?.length ?? 0;
          return (
            <button key={stage.id}
              onClick={() => { const el = edgeRef.current?.querySelector<HTMLElement>(`[data-col="${stage.id}"]`); if (el && edgeRef.current) edgeRef.current.scrollTo({ left: el.offsetLeft - 12, behavior: "smooth" }); }}
              className={`shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs cursor-pointer ${n ? "border-white/10 bg-white/[0.04] text-[var(--text)]" : "border-white/[0.05] text-[var(--text-dim)]"}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color, opacity: n ? 1 : 0.4 }} />
              <span className="max-w-[140px] truncate">{stage.label}</span>
              <span className="tabular-nums font-semibold" style={{ color: n ? stage.color : undefined }}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="relative">
      {edgeArrows}
      <div ref={edgeRef} onScroll={edgeScroll} className="overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory md:snap-none -mx-3 px-3 scroll-px-3 sm:mx-0 sm:px-0 sm:scroll-px-0">
        {/* phone: one column ≈ the screen, swipe between stages */}
        <div className="flex gap-2 md:gap-1.5 w-full h-[calc(100dvh-345px)] min-h-[300px] md:h-[calc(100vh-230px)] md:min-h-[420px]" style={{ minWidth: columns.length * 200 }}>
          {columns.map((stage, i) => {
            const items = byStage.get(stage.id) ?? [];
            const sum = items.reduce((a, s) => a + s.value, 0);
            const first = i === 0;
            return (
              <div key={stage.id} data-col={stage.id} className="flex-none w-[85vw] md:w-auto md:flex-1 md:basis-0 md:min-w-[200px] snap-start flex flex-col min-h-0">
                <div className="relative h-7 flex items-center gap-1.5 pr-4 text-[11px] font-semibold text-black shrink-0" title={stage.label}
                  style={{
                    background: stage.color,
                    clipPath: first ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)" : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)",
                    paddingLeft: first ? 10 : 14, borderRadius: first ? "6px 0 0 6px" : 0,
                  }}>
                  <span className="truncate">{stage.label}</span>
                  <span className="shrink-0 text-black/60 font-medium">{items.length}</span>
                </div>
                <div className="px-1 py-1 text-[11px] font-semibold text-[var(--text)] shrink-0" data-private="amount">{fmtMoney(sum)}</div>
                <Droppable droppableId={stage.id} isDropDisabled={!onMove}>
                  {(prov, snap) => (
                    <div ref={prov.innerRef} {...prov.droppableProps}
                      className="flex-1 min-h-0 overflow-y-auto rounded-md p-1 space-y-1.5 transition-colors border"
                      style={{ background: snap.isDraggingOver ? `${stage.color}14` : "rgba(255,255,255,0.015)", borderColor: snap.isDraggingOver ? `${stage.color}55` : "rgba(255,255,255,0.05)", borderStyle: items.length ? "solid" : "dashed" }}>
                      {loading && !items.length && <div className="h-16 rounded-lg bg-white/[0.03] animate-pulse" />}
                      {items.map((s, index) => (
                        <Draggable key={s.deal!.id} draggableId={s.deal!.id} index={index} isDragDisabled={!onMove}>
                          {(p, st) => (
                            <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} style={{ ...p.draggableProps.style, opacity: st.isDragging ? 0.9 : 1 }}>
                              <ProjectCard s={s} color={stage.color} progress={projectProgress(settings, s.deal!)} onOpen={() => onOpen(s.deal!.id)} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {prov.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </DragDropContext>
  );
}

function ProjectCard({ s, color, progress, onOpen }: { s: ProjectStat; color: string; progress: Progress | null; onOpen: () => void }) {
  const paid = s.value > 0 ? Math.min(100, (s.income / s.value) * 100) : 0;
  return (
    <div onClick={onOpen} className="relative rounded-lg bg-[var(--surface-2)] border border-white/[0.06] hover:border-white/15 hover:bg-[#1a1a1a] transition-colors cursor-pointer overflow-hidden pl-3 pr-2.5 pt-2.5 pb-2.5 md:pt-2 md:pb-2">
      <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full" style={{ background: color }} />
      <div className="flex items-start gap-2">
        <p data-private="project" className="flex-1 min-w-0 text-[13px] md:text-[12px] font-semibold leading-snug line-clamp-2 text-[var(--text)]">{s.name}</p>
        {progress && <span className="shrink-0 text-[11px] font-bold tabular-nums" title="Виконано" style={{ color: progress.pct >= 60 ? "#4ade80" : progress.pct >= 30 ? "#fbbf24" : progress.pct > 0 ? "#fb923c" : "var(--text-dim)" }}>{progress.pct}%</span>}
      </div>
      {s.deal!.name.trim() && <p data-private={isPhoneLike(s.deal!.name) ? "contacts" : "name"} className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{s.deal!.name}</p>}
      <div className="mt-2 flex items-center gap-2 text-[11px] tabular-nums" data-private="amount">
        <span className="font-semibold" style={{ color: s.value ? "var(--accent)" : "var(--text-dim)" }}>{s.value ? fmtMoney(s.valueCur, s.currency) : "—"}</span>
        {s.left > 0 && <span className="ml-auto text-[#fbbf24]" title="Залишилось отримати">−{fmtMoney(s.left)}</span>}
      </div>
      {s.value > 0 && <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${paid}%` }} /></div>}
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors";
const label = "block text-[11px] font-medium text-[var(--text-muted)] mb-1";

// «+ Проєкт» = new deal in «Операційка». Contact: pick an existing one (search) or create a new one.
function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: DealRow) => void }) {
  const { settings } = useCrmSettings();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<ContactHit | null>(null);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "", telegram: "", email: "" });
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);
  const f = paymentsFunnel(settings);
  const tpl = projectTemplate(service);
  const needle = q.trim();
  const hitsQ = useQuery({
    queryKey: ["contact-search", needle],
    enabled: needle.length >= 2 && !picked && !creating,
    queryFn: async (): Promise<ContactHit[]> => {
      const res = await fetch(`/api/leads?q=${encodeURIComponent(needle)}`);
      if (!res.ok) return [];
      const list = (await res.json()) as ContactHit[];
      // one row per contact: the newest deal of each phone / name
      const seen = new Set<string>();
      return list.filter((x) => { const k = (x.phone || x.name).trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
    },
    placeholderData: (prev) => prev,
  });
  const hits = needle.length >= 2 ? hitsQ.data ?? [] : [];

  function startNew() {
    const digits = needle.replace(/[^\d+]/g, "");
    const isPhone = digits.replace(/\D/g, "").length >= 7;
    setNc({ name: isPhone ? "" : needle, phone: isPhone ? needle : "", telegram: needle.startsWith("@") ? needle : "", email: needle.includes("@") && !needle.startsWith("@") ? needle : "" });
    setCreating(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const contactName = picked ? picked.name : creating ? nc.name.trim() : "";
    if (!name.trim() && !contactName && !(creating && nc.phone.trim())) return toastError("Вкажи назву проєкту або контакт");
    setBusy(true);
    try {
      const contact: ContactFields = picked
        ? { phone: picked.phone, telegram: picked.telegram, instagram: picked.instagram, email: picked.email, messenger: picked.messenger, payer: picked.payer }
        : creating ? { phone: nc.phone.trim() || null, telegram: nc.telegram.trim() || null, email: nc.email.trim() || null } : {};
      // the deal's name is the contact; the project name is separate (empty → «Проєкт #N»)
      const deal = await createDeal(settings, { name: contactName || name.trim(), projectName: name.trim() || undefined, amount: Number(amount.replace(/\s/g, "").replace(",", ".")) || null, currency, service, contact });
      if (!deal) return;
      // existing contact → link the new project to its deal, so the history shows up in «Пов'язані угоди»
      if (picked) await fetch(`/api/leads/${deal.id}/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId: picked.id }) }).catch(() => {});
      toast({ kind: "success", title: "Проєкт створено", text: `Угода #${deal.number} у «${f?.name ?? "Операційка"}»`, duration: 3500 });
      onCreated(deal);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Новий проєкт" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel>Що робимо</FieldLabel>
          <TemplateCards options={PROJECT_TEMPLATES} value={service} onChange={setService} />
        </div>

        <div>
          <FieldLabel>Назва проєкту</FieldLabel>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`${fieldCls} text-[15px] font-semibold`} placeholder="Сайт для Status Home · порожньо → «Проєкт #N»" />
        </div>

        <Panel icon={UserRound} title="Клієнт" color={tpl.color} right={picked ? "існуючий контакт" : creating ? "новий контакт" : "пошук або новий"}>
          {picked ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/[0.06]">
              <UserRound size={14} className="text-[var(--accent)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[var(--text)] truncate">{picked.name || picked.phone}</div>
                <div className="text-[11px] text-[var(--text-dim)] truncate">{[picked.phone, picked.telegram && `@${picked.telegram}`, `#${picked.number}`].filter(Boolean).join(" · ")}</div>
              </div>
              <button type="button" onClick={() => setPicked(null)} className="p-1 text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Інший контакт"><X size={13} /></button>
            </div>
          ) : creating ? (
            <div className="rounded-lg border border-[var(--accent)]/40 bg-white/[0.015] p-3 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--accent)]"><UserPlus size={13} /> Новий контакт
                <button type="button" onClick={() => setCreating(false)} className="ml-auto text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">← до пошуку</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Ім'я" className={input} />
                <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} placeholder="Телефон" inputMode="tel" className={input} />
                <input value={nc.telegram} onChange={(e) => setNc({ ...nc, telegram: e.target.value })} placeholder="Telegram @…" className={input} />
                <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Email" className={input} />
              </div>
              <div className="text-[11px] text-[var(--text-dim)]">Решту (посилання на чат, платник…) додаси в картці — вона відкриється одразу після створення.</div>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук контакту: ім'я, телефон, Telegram…" className={`${input} pl-8`} />
              </div>
              {needle.length >= 2 && (
                <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-white/[0.04]">
                  {hitsQ.isFetching && !hits.length && <div className="px-3 py-2 text-xs text-[var(--text-dim)]">Шукаю…</div>}
                  {hits.map((x) => {
                    const st = resolveStage(settings, x);
                    return (
                      <button type="button" key={x.id} onClick={() => setPicked(x)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.05] cursor-pointer">
                        <UserRound size={13} className="text-[var(--text-dim)] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[var(--text)] truncate">{x.name || x.phone || `#${x.number}`}</div>
                          <div className="text-[11px] text-[var(--text-dim)] truncate">{[x.phone, x.telegram && `@${x.telegram}`].filter(Boolean).join(" · ") || "без контактів"}</div>
                        </div>
                        <span className="text-[10px] shrink-0" style={{ color: st.stage.color }}>{st.funnel.name} · #{x.number}</span>
                      </button>
                    );
                  })}
                  <button type="button" onClick={startNew} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--accent)]/[0.06] cursor-pointer">
                    <UserPlus size={14} /> Створити контакт «{needle}»
                  </button>
                </div>
              )}
              {needle.length < 2 && (
                <button type="button" onClick={() => { setNc({ name: "", phone: "", telegram: "", email: "" }); setCreating(true); }}
                  className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"><UserPlus size={12} /> Новий контакт</button>
              )}
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] rounded-xl border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]/60 transition-colors overflow-hidden">
          <label className="px-3 py-2 min-w-0">
            <span className={cellLabelCls}>Вартість проєкту</span>
            <input value={amount} onChange={(e) => setAmount(groupNum(e.target.value))} inputMode="decimal" placeholder="0"
              className="w-full bg-transparent text-[26px] leading-tight sm:text-xl font-bold tabular-nums outline-none placeholder:text-[var(--text-dim)]" style={{ color: tpl.color }} />
          </label>
          <CurrencyButtons list={CURRENCIES} value={currency} onChange={setCurrency} />
        </div>
        <FormFooter onCancel={onClose} busy={busy} disabled={!f} color={tpl.color}>
          {busy ? "Створюю…" : <>Створити проєкт{service ? ` · ${tpl.label}` : ""}{amount ? ` · ${amount} ${CUR_SYMBOL[currency] ?? ""}` : ""}</>}
        </FormFooter>
      </form>
    </Modal>
  );
}

// sheet project: link to an «Операційка» deal, rename, value, delete
function SheetProjectModal({ project, deals, onClose, onSaved }: { project: ProjectRow; deals: DealRow[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client ?? "");
  const [value, setValue] = useState(project.value ? String(project.value) : "");
  const [currency, setCurrency] = useState(project.currency ?? "UAH");
  const [deal, setDeal] = useState<DealRow | null>(deals.find((x) => x.id === project.leadId) ?? null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/finance/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, client, value: Number(value.replace(/\s/g, "").replace(",", ".")) || null, currency, leadId: deal?.id ?? null }),
      });
      if (!res.ok) return toastError((await res.json().catch(() => ({}))).error ?? "Не вдалося зберегти");
      toast({ kind: "success", title: deal ? "Зв'язано з угодою" : "Збережено", text: deal ? `${name} → ${leadDisplayName(deal)}` : name, duration: 3500 });
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!(await ask(`Видалити проєкт «${project.name}»? Його операції залишаться в кешфлоу як «без проєкту».`))) return;
    const res = await fetch(`/api/finance/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) return toastError("Не вдалося видалити");
    onSaved();
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Проєкт з таблиці" size="md">
      <div className="relative">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={label}>Угода в «Операційці»</label>
          {deal ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/[0.06]">
              <Avatar name={projectTitle(deal)} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--text)] truncate">{projectTitle(deal)}</span>
                {deal.name.trim() && <span className="block text-[11px] text-[var(--text-dim)] truncate">{leadDisplayName(deal)}</span>}
              </span>
              <span className="text-[11px] text-[var(--text-dim)] tabular-nums">#{deal.number}</span>
              <button type="button" onClick={() => setPicking(true)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">змінити</button>
              <button type="button" onClick={() => setDeal(null)} className="p-0.5 text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Відв'язати"><X size={13} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => setPicking(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/60 cursor-pointer transition-colors">
              <Search size={14} /> Вибрати угоду «Операційки»
              <span className="ml-auto text-[11px] text-[var(--text-dim)]">{deals.length} угод</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label}>Назва</label><input value={name} onChange={(e) => setName(e.target.value)} className={input} /></div>
          <div><label className={label}>Клієнт</label><input value={client} onChange={(e) => setClient(e.target.value)} className={input} placeholder="ПІБ / компанія" /></div>
        </div>
        <div>
          <label className={label}>Вартість (якщо в угоді не вказано суму)</label>
          <div className="flex gap-2">
            <input value={value} onChange={(e) => setValue(groupNum(e.target.value))} inputMode="decimal" className={`${input} tabular-nums`} placeholder="0" />
            <div className="flex p-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shrink-0">
              {CURRENCIES.map((c) => (
                <button type="button" key={c} onClick={() => setCurrency(c)}
                  className={`px-2.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${currency === c ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{c}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={remove} className="px-3 py-2.5 rounded-xl text-sm border border-[var(--border)] text-[var(--text-dim)] hover:text-red-400 hover:border-red-500/40 cursor-pointer" aria-label="Видалити проєкт"><Trash2 size={15} /></button>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button type="submit" disabled={busy} className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold text-black cursor-pointer disabled:opacity-50 hover:brightness-110" style={{ background: "var(--accent)" }}>
            {busy ? "Зберігаю…" : "Зберегти"}
          </button>
        </div>
      </form>
      {picking && <DealSheet deals={deals} onClose={() => setPicking(false)} onPick={(x) => { setDeal(x); setPicking(false); }} />}
      </div>
    </Modal>
  );
}

// Deal picker over the form (as in the cashflow operation popup): one search over all «Операційка» deals.
function DealSheet({ deals, onClose, onPick }: { deals: DealRow[]; onClose: () => void; onPick: (d: DealRow) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const items = deals.map((x) => ({
    d: x,
    name: projectTitle(x),
    sub: [x.name.trim() ? leadDisplayName(x) : "", `#${x.number}`, x.amount ? fmtMoney(x.amount, x.currency ?? "UAH") : ""].filter(Boolean).join(" · "),
  }));
  const hits = items.filter((i) => !needle || `${i.name} ${i.sub} ${i.d.phone ?? ""} ${i.d.payer ?? ""}`.toLowerCase().includes(needle));
  return (
    <div className="absolute -inset-4 sm:-inset-5 z-20 flex flex-col p-4 sm:p-5 bg-[#101013]">
      <div className="flex items-center gap-2 pb-3">
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.05] cursor-pointer" aria-label="Назад"><ChevronLeft size={16} /></button>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
            placeholder={`Пошук серед ${items.length} угод — назва, клієнт, номер, телефон`}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </div>
      </div>
      <div className="flex-1 min-h-[280px] overflow-y-auto -mx-1 px-1">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Угоди «Операційки» <span className="opacity-60">{hits.length}</span></div>
        {!hits.length && <div className="py-8 text-center text-sm text-[var(--text-muted)]">Нічого не знайдено — закрий і натисни «В угоду», щоб створити</div>}
        {hits.slice(0, 200).map((i) => (
          <button type="button" key={i.d.id} onClick={() => onPick(i.d)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-white/[0.05] cursor-pointer transition-colors">
            <Avatar name={i.name} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-[var(--text)] truncate">{i.name}</span>
              <span className="block text-[11px] text-[var(--text-dim)] truncate tabular-nums">{i.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Phone row of the list: name + client, stage, money with a paid bar, progress. Tap = open the deal.
function MobileProjectCard({ s, settings, sheet, canEdit, busy, onOpen, onLink, onToDeal }: {
  s: ProjectStat; settings: CrmSettings; sheet: boolean; canEdit: boolean; busy: boolean;
  onOpen: () => void; onLink: () => void; onToDeal: () => void;
}) {
  const none = s.type === "none";
  const stage = s.deal ? resolveStage(settings, s.deal).stage : null;
  const progress = s.deal ? projectProgress(settings, s.deal) : null;
  const paidPct = s.value > 0 ? Math.min(100, (s.income / s.value) * 100) : 0;
  return (
    <div onClick={onOpen} className={`relative px-4 py-3.5 active:bg-white/[0.04] transition-colors ${none ? "bg-white/[0.012]" : "cursor-pointer"}`}>
      {stage && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: stage.color }} />}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div data-private="project" className={`text-[15px] leading-snug truncate ${none ? "text-[var(--text-muted)] italic" : "text-[var(--text)] font-semibold"}`}>{s.name}</div>
          {s.deal ? (
            s.deal.name.trim() ? <div data-private={isPhoneLike(s.deal.name) ? "contacts" : "name"} className="text-xs text-[var(--text-muted)] truncate mt-0.5">{s.deal.name}</div> : null
          ) : s.project ? (
            <div className="flex items-center gap-1 text-xs text-[var(--text-dim)] truncate mt-0.5"><FileSpreadsheet size={11} className="shrink-0" />з таблиці{s.project.client ? <span data-private="name">&nbsp;· {s.project.client}</span> : null}</div>
          ) : <div className="text-xs text-[var(--text-dim)] mt-0.5">оплати й підрядники без проєкту</div>}
        </div>
        {progress && (
          <div className="shrink-0 text-right">
            <div className="text-base font-bold tabular-nums leading-none" style={{ color: progress.pct >= 60 ? "#4ade80" : progress.pct >= 30 ? "#fbbf24" : progress.pct > 0 ? "#fb923c" : "var(--text-dim)" }}>{progress.pct}%</div>
            <div className="text-[10px] text-[var(--text-dim)] mt-0.5">виконано</div>
          </div>
        )}
      </div>
      {stage && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium min-w-0" style={{ color: stage.color }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stage.color }} />
          <span className="truncate">{stage.label}</span>
        </div>
      )}
      {none ? (
        <div className="mt-2 flex items-baseline justify-between text-xs" data-private="amount">
          <span className="text-[var(--text-dim)]">По касі</span>
          <span className="font-semibold tabular-nums" style={{ color: s.cash >= 0 ? "#C98C0A" : "#f87171" }}>{fmtMoney(s.cash)}</span>
        </div>
      ) : (
        <div className="mt-2.5" data-private="amount">
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="min-w-0"><div className="text-[var(--text-dim)]">Вартість</div><div className="tabular-nums font-semibold text-[var(--text)] truncate">{s.value > 0 ? fmtMoney(s.valueCur, s.currency) : "—"}</div></div>
            <div className="min-w-0"><div className="text-[var(--text-dim)]">Отримано</div><div className="tabular-nums font-semibold text-[#4ade80] truncate">{s.income ? fmtMoney(s.income) : "—"}</div></div>
            <div className="min-w-0 text-right"><div className="text-[var(--text-dim)]">Залишилось</div><div className={`tabular-nums font-semibold truncate ${s.left > 0 ? "text-[#fbbf24]" : "text-[var(--text-dim)]"}`}>{s.left > 0 ? fmtMoney(s.left) : "—"}</div></div>
          </div>
          {s.value > 0 && <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${paidPct}%` }} /></div>}
        </div>
      )}
      {sheet && s.project && canEdit && (
        <div className="mt-3 flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); onLink(); }} className="flex-1 h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text-muted)] cursor-pointer">Зв&apos;язати</button>
          <button onClick={(e) => { e.stopPropagation(); onToDeal(); }} disabled={busy} className="flex-1 h-10 rounded-lg text-sm font-semibold text-black cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? "…" : "В угоду"}</button>
        </div>
      )}
    </div>
  );
}

// «Виконано на 78%» — working stages from «Брифінг» + ticked tasks of the current one
function ProgressCell({ p }: { p: Progress | null }) {
  if (!p) return <span className="text-xs text-[var(--text-dim)]">—</span>;
  const color = p.pct >= 100 ? "#22c55e" : p.pct >= 60 ? "#4ade80" : p.pct >= 30 ? "#fbbf24" : p.pct > 0 ? "#fb923c" : "#6b7280";
  return (
    <div className="w-[96px] 2xl:w-[120px]" title={`Виконано ${p.done} з ${p.total} кроків (робочі стадії з «Брифінгу» + задачі в них)`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-[var(--text-dim)]">виконано</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{p.pct}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${p.pct}%`, background: color }} />
      </div>
    </div>
  );
}
