"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  X, Phone, Mail, Plus, CheckSquare, Clock, MessageSquare, Briefcase, Video, Pencil, Trash2, Link2, Check,
  Bell, CalendarPlus, ArrowRight, Flag, History, RotateCcw, ListChecks, LayoutGrid, Copy, ArrowRightLeft, ExternalLink, Workflow, Settings2, CornerDownRight,
  Wallet, Info, MessageSquareText, Shuffle, ListTodo, CircleCheck, Sparkles, Pin, PinOff
} from "lucide-react";
import CalendarModal from "@/components/leads/CalendarModal";
import {
  COMMUNICATION_CHANNELS, CHANNEL_ACCENT, PUSH_STAGES, LEAD_SERVICES, PAYMENT_SYSTEMS, UPSELL_SERVICES,
  leadDisplayName, hasRealName,
} from "@/lib/leadOptions";
import MessengerIcon, { messengerHref, preferredMessenger } from "@/components/ui/MessengerIcon";
import { timeAgo } from "@/lib/timeAgo";
import { cleanPhone } from "@/lib/leadFilter";
import { resolveStage, getFunnel, activeStages, CONTACT_SECTION, type Funnel, type CardField } from "@/lib/crmSettings";
import { useCrmSettings } from "@/lib/useCrmSettings";
import { useFx } from "@/lib/useFx";
import { CURRENCIES, CURRENCY_SYMBOL, CURRENCY_LABEL, asCurrency, formatMoney, toEur } from "@/lib/currency";
import CloseLeadModal from "@/components/leads/CloseLeadModal";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import TaskComposer, { type NewTask } from "@/components/tasks/TaskComposer";
import TaskRow from "@/components/tasks/TaskRow";
import { useTaskActions, BELL_KEY } from "@/components/tasks/useTaskActions";
import { useStageGuard } from "@/components/tasks/useStageGuard";
import { toast } from "@/components/ui/toast";
import { useAccess } from "@/lib/useAccess";
import DealPayments from "@/components/finance/DealPayments";
import SourcePayments from "@/components/leads/SourcePayments";
import { PartnerLeads, PartnerPicker } from "@/components/leads/PartnerBlocks";
import PaymentPlan from "@/components/finance/PaymentPlan";
import { fmtMoney, projectTitle } from "@/lib/finance";
import { can } from "@/lib/access";
import { sortOpen, sortDone, type TaskItem } from "@/components/tasks/taskUtils";
import { useQueryClient } from "@tanstack/react-query";
import { useDragScroll } from "@/lib/useDragScroll";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { toastError } from "@/components/ui/toast";
import { groupNum } from "@/lib/numInput";
import { useLeadSources } from "@/lib/useLeadSources";

// Bitrix-style lead card: header with actions, chevron stage bar, tabs.
// «Загальне»: editable fields on the left (click a value to edit it), activity stream on the right.

interface Activity { id: string; type: string; content: string; createdAt: string; pinned?: boolean | null; editedAt?: string | null }
type Task = TaskItem;
interface Deal { id: string; company: string | null; status: string; budget: number | null }
interface LinkedLead { id: string; number: number; name: string; projectName?: string | null; amount?: number | null; currency?: string | null; phone: string | null; funnelId: string | null; status: string; closeReason: string | null; createdAt: string }

interface LeadDetail {
  id: string;
  name: string;
  projectName?: string | null;
  payer?: string | null;
  instagram: string | null;
  telegram: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  source: string | null;
  sourceDetail: string | null;
  geo: string | null;
  niche: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  remindAt: string | null;
  remindSent: boolean;
  siteStructure: string | null;
  hasExtraLang: boolean;
  languages: string | null;
  service: string | null;
  paymentSystem: string | null;
  usedServices: string[];
  projectDeadline: string | null;
  caseUrl?: string | null;
  pushAt: string | null;
  pushSent: boolean;
  pushComment: string | null;
  pushStage: string | null;
  messenger: string | null;
  funnelId: string | null;
  closeReason: string | null;
  closedAt: string | null;
  calendarAt: string | null;
  calendarStatus: string | null;
  kpAt: string | null;
  customFields: Record<string, unknown> | null;
  number: number;
  sourceLeadId: string | null;
  sourceLeadNumber: number | null;
  partnerId?: string | null;
  sourceLead: LinkedLead | null;
  transfers: LinkedLead[];
  linked: LinkedLead[];     // linked by hand
  suggested: LinkedLead[];  // other deals with the same phone
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  activities: Activity[];
  deals: Deal[];
}

type Tab = "main" | "tasks" | "payments" | "history";

// UTC ISO → "YYYY-MM-DDTHH:mm" in Europe/Warsaw (UTC+2) — what the API expects for pushAt / calendarAt.
function toWarsawInput(utc: string): string {
  return new Date(new Date(utc).getTime() + 2 * 3600_000).toISOString().slice(0, 16);
}
// UTC ISO → browser-local "YYYY-MM-DDTHH:mm" (remindAt is stored as a real instant).
function toLocalInput(utc: string): string {
  const d = new Date(utc);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function fmtDateTime(iso: string) {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: uk });
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Сьогодні";
  if (d.toDateString() === y.toDateString()) return "Вчора";
  return format(d, "d MMMM yyyy", { locale: uk });
}
function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)} хв`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год`;
  return `${Math.round(h / 24)} дн`;
}
const STATUS_RE = /^Статус змінено: (\S+) → (\S+)$/;

// ── Inline-editable field ──

type FieldKind = "text" | "number" | "textarea" | "select" | "datetime" | "date";

// card fields hidden in «Режим показу» (eye button in CRM)
const PRIVATE_FIELD: Record<string, string> = { telegram: "contacts", instagram: "contacts", email: "contacts", niche: "niche", source: "source", amount: "amount" };

function Field({
  label, value, display, kind = "text", options, placeholder, onSave, mono,
}: {
  label: React.ReactNode;
  value: string;                 // raw value for the editor
  display?: React.ReactNode;     // custom view (links, chips…)
  kind?: FieldKind;
  options?: string[];
  placeholder?: string;
  onSave?: (v: string) => Promise<void> | void;
  mono?: boolean;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);

  useEffect(() => { if (edit !== null) ref.current?.focus(); }, [edit]);

  async function commit() {
    if (edit === null) return;
    const v = kind === "number" ? edit.replace(/\s/g, "").replace(",", ".") : edit;
    setEdit(null);
    if (v !== value) await onSave?.(v);
  }

  const cls = "w-full px-2 py-1 rounded-md bg-[var(--surface-2)] border border-[var(--accent)] text-[var(--text)] text-[13px] focus:outline-none";
  const empty = !value && !display;

  return (
    <div className="group/f py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-0.5">{label}</div>
      {edit !== null ? (
        kind === "textarea" ? (
          <textarea
            ref={ref}
            value={edit}
            rows={4}
            onChange={(e) => setEdit(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(); }}
            className={`${cls} resize-y`}
          />
        ) : kind === "select" ? (
          <select ref={ref} value={edit} onChange={(e) => setEdit(e.target.value)} onBlur={commit} className={`${cls} cursor-pointer`}>
            <option value="">—</option>
            {options?.map((o) => <option key={o} value={o}>{o}</option>)}
            {edit && !options?.includes(edit) && <option value={edit}>{edit}</option>}
          </select>
        ) : (
          <input
            ref={ref}
            type={kind === "datetime" ? "datetime-local" : kind === "date" ? "date" : "text"}
            inputMode={kind === "number" ? "decimal" : undefined}
            value={edit}
            placeholder={placeholder}
            onChange={(e) => setEdit(kind === "number" ? groupNum(e.target.value) : e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }}
            className={cls}
          />
        )
      ) : (
        <div
          onClick={() => onSave && setEdit(kind === "number" ? groupNum(value) : value)}
          className={`relative text-[13px] leading-snug rounded-md -mx-1 px-1 py-0.5 ${onSave ? "cursor-text hover:bg-white/[0.04]" : ""} ${mono ? "tabular-nums" : ""}`}
        >
          {empty ? <span className="text-[var(--text-dim)]">не заповнено</span> : display ?? <span className="text-[var(--text)] whitespace-pre-wrap break-words">{value}</span>}
          {onSave && <Pencil size={10} className="absolute right-1 top-1.5 opacity-0 group-hover/f:opacity-60 text-[var(--text-muted)]" />}
        </div>
      )}
    </div>
  );
}

// «i» next to a field label: hover → what this field is for
function Hint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex align-middle ml-1 normal-case tracking-normal">
      <Info size={11} className="text-[var(--text-dim)] hover:text-[var(--accent)] cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 w-60 px-2.5 py-2 rounded-lg border border-white/[0.1] bg-[#18181b] text-[11px] leading-snug text-[var(--text-muted)] shadow-xl opacity-0 group-hover/hint:opacity-100 transition-opacity">
        {text}
      </span>
    </span>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 pt-3 pb-2">
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/[0.05]">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Funnel's own field (settings → «Поля картки») ──

function CustomFieldView({ f, value, onSave }: { f: CardField; value: unknown; onSave: (v: unknown) => void }) {
  const label = <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-1">{f.label}</div>;
  if (f.type === "bool") {
    const on = value === true;
    return (
      <div className="py-1.5">
        {label}
        <button
          onClick={() => onSave(on ? null : true)}
          className="w-8 h-[18px] rounded-full relative transition-colors cursor-pointer"
          style={{ background: on ? "var(--accent)" : "var(--surface-2)", border: "1px solid var(--border)" }}
          aria-label={f.label}
        >
          <span className="absolute top-[1px] w-[14px] h-[14px] rounded-full bg-white transition-all" style={{ left: on ? 15 : 1 }} />
        </button>
      </div>
    );
  }
  if (f.type === "multi") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="py-1.5">
        {label}
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((o) => {
            const on = list.includes(o);
            return (
              <button
                key={o}
                onClick={() => onSave(on ? list.filter((x) => x !== o) : [...list, o])}
                className="px-2 py-0.5 text-[11px] rounded-md border transition-colors cursor-pointer"
                style={on
                  ? { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-subtle)" }
                  : { color: "var(--text-dim)", borderColor: "var(--border)" }}
              >
                {on && "✓ "}{o}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  const str = value === undefined || value === null ? "" : String(value);
  const kind: FieldKind = f.type === "textarea" ? "textarea" : f.type === "number" ? "number" : f.type === "select" ? "select" : f.type === "date" ? "date" : "text";
  let display: React.ReactNode | undefined;
  if (str && f.type === "link") {
    const href = /^https?:\/\//.test(str) ? str : `https://${str}`;
    display = (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[#7aa7ff] hover:underline break-all">
        {str}<ExternalLink size={10} />
      </a>
    );
  } else if (str && f.type === "date") {
    display = <span className="text-[var(--text)]">{format(new Date(str), "d MMMM yyyy", { locale: uk })}</span>;
  }
  return (
    <Field
      label={f.label}
      kind={kind}
      options={f.options}
      value={str}
      display={display}
      mono={f.type === "number"}
      onSave={(v) => onSave(f.type === "number" ? (v === "" ? null : Number(v)) : v)}
    />
  );
}

// ── Row of «Пов'язані угоди» ──

function LinkedRow({
  caption, number, linked, settings, onOpen, action,
}: {
  caption: string;
  number: number;
  linked: LinkedLead | null;
  settings: ReturnType<typeof useCrmSettings>["settings"];
  onOpen: (id: string) => void;
  action?: React.ReactNode; // «Зв'язати» / unlink
}) {
  if (!linked) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface-2)]/50 text-xs text-[var(--text-dim)]">
        <span>{caption}</span><b>#{number}</b><span className="ml-auto">лід видалено</span>
      </div>
    );
  }
  const r = resolveStage(settings, linked);
  // a project deal → its project name (and the contact after it)
  const title = r.funnel.payments ? projectTitle(linked) : leadDisplayName(linked);
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onOpen(linked.id)}
        className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] text-left transition-colors cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] truncate">
            {caption} · {r.funnel.name} · {new Date(linked.createdAt).toLocaleDateString("uk-UA")}
          </div>
          <div className="text-sm text-[var(--text)] truncate">
            <span className="text-[var(--text-dim)] tabular-nums">#{linked.number}</span> {title}
            {r.funnel.payments && hasRealName(linked) && <span className="text-[var(--text-dim)]"> · {linked.name}</span>}
          </div>
        </div>
        {!!linked.amount && <span className="text-xs tabular-nums text-[var(--text-muted)] shrink-0">{fmtMoney(linked.amount, linked.currency ?? "EUR")}</span>}
        <span className="px-2 py-0.5 rounded text-[11px] font-medium shrink-0" style={{ color: r.stage.color, background: `${r.stage.color}1a` }}>{r.stage.label}</span>
        <ExternalLink size={12} className="text-[var(--text-dim)] shrink-0" />
      </button>
      {action}
    </div>
  );
}

// «Зв'язати угоду»: search any deal by number, phone, name, project → link it
function LinkSearch({ selfId, known, settings, onPick, onClose }: {
  selfId: string; known: Set<string>; settings: ReturnType<typeof useCrmSettings>["settings"]; onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LinkedLead[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const s = q.trim();
    if (!s) return;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/leads?q=${encodeURIComponent(s)}`);
        if (res.ok) setHits(((await res.json()) as LinkedLead[]).filter((x) => x.id !== selfId).slice(0, 8));
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, selfId]);
  const shown = q.trim() ? hits : [];
  return (
    <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--surface-2)]/60 p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
          placeholder="Номер угоди, телефон, ім'я або проєкт…"
          className="flex-1 px-2.5 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        <button onClick={onClose} className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Закрити"><X size={13} /></button>
      </div>
      {busy && <div className="px-1 text-[11px] text-[var(--text-dim)]">Шукаю…</div>}
      {!busy && q.trim() && !shown.length && <div className="px-1 text-[11px] text-[var(--text-dim)]">Нічого не знайдено</div>}
      {shown.map((x) => {
        const r = resolveStage(settings, x);
        const linked = known.has(x.id);
        return (
          <button key={x.id} disabled={linked} onClick={() => onPick(x.id)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-default cursor-pointer">
            <span className="text-xs tabular-nums text-[var(--text-dim)]">#{x.number}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{r.funnel.payments ? projectTitle(x) : leadDisplayName(x)}{x.phone && <span className="text-[var(--text-dim)]"> · {x.phone}</span>}</span>
            <span className="text-[10px] text-[var(--text-dim)] shrink-0">{r.funnel.name}</span>
            <span className="text-[11px] font-semibold shrink-0" style={{ color: linked ? "var(--text-dim)" : "var(--accent)" }}>{linked ? "вже" : "Зв'язати"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Chevron stage bar (Bitrix-like) ──

function StageChevrons({
  funnel, currentId, closed, reasonLabel, onPick, onFinish,
}: {
  funnel: Funnel;
  currentId: string;
  closed: { color: string; label: string } | null;
  reasonLabel?: string;
  onPick: (id: string) => void;
  onFinish: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<{ i: number; width: number } | null>(null);
  // Stage geometry measured while nothing is expanded. Hit-testing uses these fixed positions,
  // so expanding a stage never changes which stage is "under the cursor" → no jumping back and forth.
  const geo = useRef<{ left: number; right: number; need: number; cut: boolean }[]>([]);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  useDragScroll(wrapRef); // swipe / drag / wheel sideways when the stages don't fit
  const stages = activeStages(funnel);
  const idx = stages.findIndex((s) => s.id === currentId);
  const cur = stages[idx];
  const baseColor = closed?.color ?? cur?.color ?? "#888";
  const winHint = funnel.stages.find((s) => s.kind === "win")?.hint;
  const cells: { id: string; label: string; color: string; hint?: string }[] = [...stages.map((s) => ({ id: s.id, label: s.label, color: s.color, hint: s.hint })), { id: "__finish__", label: closed ? `${closed.label}${reasonLabel ? ` · ${reasonLabel}` : ""}` : "Завершити", color: closed?.color ?? "var(--accent)", hint: winHint }];
  const finishIdx = cells.length - 1;
  // Hover preview (Bitrix-like): everything up to the hovered stage takes the hovered stage's colour.
  const previewing = hover !== null && hover !== finishIdx;

  // Resting layout is computed, not read from the screen: when nothing is expanded all stages are equal
  // (flex 1 1 0, min 92px, 3px gap). Reading the screen mid-animation gave wrong sizes.
  const GAP = 3;
  const MIN = 92;
  function measure() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const n = cells.length;
    const w = Math.max(MIN, (box.width - GAP * (n - 1)) / n);
    geo.current = cells.map((_, i) => {
      const label = cellRefs.current[i]?.querySelector("span");
      const pad = (i === 0 ? 12 : 17) + 18;
      const need = Math.ceil((label?.scrollWidth ?? 0) + pad);
      const left = box.left + i * (w + GAP) - wrap.scrollLeft;
      return { left, right: left + w + GAP, need, cut: need > w + 0.5 };
    });
  }

  function onMove(x: number) {
    if (hover === null || !geo.current.length) measure();
    const g = geo.current;
    let i = g.findIndex((c) => x >= c.left && x < c.right);
    if (i === -1) i = g.reduce((best, c, j) => (Math.abs((c.left + c.right) / 2 - x) < Math.abs((g[best].left + g[best].right) / 2 - x) ? j : best), 0);
    if (i !== hover) {
      setHover(i);
      setExpanded(g[i].cut ? { i, width: g[i].need } : null);
    }
  }

  // phones: the bar scrolls sideways — bring the current stage into view
  useEffect(() => {
    const wrap = wrapRef.current, cell = cellRefs.current[closed ? finishIdx : idx];
    if (wrap && cell && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, cell.offsetLeft - wrap.offsetLeft - 24);
  }, [idx, closed, finishIdx]);

  return (
    <div
      ref={wrapRef}
      className="flex gap-[3px] overflow-x-auto overscroll-x-contain no-scrollbar"
      onPointerMove={(e) => { if (e.pointerType === "mouse") onMove(e.clientX); }}
      onPointerLeave={() => { setHover(null); setExpanded(null); }}
    >
      {cells.map((c, i) => {
        const finish = i === finishIdx;
        let filled: boolean;
        let color: string;
        if (previewing) {
          filled = i <= hover!;
          color = cells[hover!].color;
        } else if (hover === finishIdx && finish) {
          filled = true;
          color = c.color;
        } else {
          filled = closed ? true : i <= idx;
          color = baseColor;
        }
        const isCur = !closed && i === idx && hover === null;
        const isExp = expanded?.i === i;
        return (
          <button
            key={c.id}
            ref={(el) => { cellRefs.current[i] = el; }}
            onClick={() => (finish ? onFinish() : c.id !== currentId || closed ? onPick(c.id) : undefined)}
            aria-label={c.label}
            title={c.hint ? `${c.label} — ${c.hint}` : c.label}
            className="relative h-10 sm:h-8 shrink-0 sm:shrink max-sm:flex-none! flex items-center text-[12px] sm:text-[11px] font-semibold cursor-pointer overflow-hidden"
            style={{
              flex: isExp ? `0 0 ${expanded!.width}px` : "1 1 0px",
              minWidth: expanded === null ? 92 : isExp ? 0 : 30,
              transition: "flex 200ms ease, min-width 200ms ease, background-color 150ms ease, color 150ms ease",
              background: filled ? color : "rgba(255,255,255,0.06)",
              color: filled ? "#000" : "var(--text-muted)",
              clipPath: i === 0
                ? "polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%)"
                : "polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%)",
              borderRadius: i === 0 ? "7px 0 0 7px" : undefined,
              paddingLeft: i === 0 ? 12 : 17,
              paddingRight: 14,
              boxShadow: isCur ? `0 0 14px ${color}66` : undefined,
              opacity: filled && !isCur && !closed && hover === null ? 0.85 : 1,
            }}
          >
            <span className={isExp ? "whitespace-nowrap" : "truncate"}>
              {finish && !closed ? <><Flag size={11} className="inline -mt-0.5 mr-1" />{c.label}</> : c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main ──


// How an event of the deal feed looks: icon, colour, title (comments are the highlighted ones).
type EventKind = "comment" | "process" | "funnel" | "stage" | "task" | "done" | "reopen" | "created" | "deal" | "payments" | "other";
function eventMeta(a: { type: string; content: string }): { kind: EventKind; title: string; color: string; Icon: typeof MessageSquareText; text?: string } {
  const c = a.content;
  if (a.type === "NOTE") {
    if (c.startsWith("Передано у воронку") || c.startsWith("Створено передачею")) return { kind: "process", title: "Бізнес-процес", color: "#a855f7", Icon: Workflow };
    if (c.startsWith("Перенесено у воронку")) return { kind: "funnel", title: "Воронка змінена", color: "#38bdf8", Icon: Shuffle };
    if (c.startsWith("Справу повернуто")) return { kind: "reopen", title: "Справу повернуто в роботу", color: "#f97316", Icon: RotateCcw };
    if (c.startsWith("Етапи оплат з ліда")) return { kind: "payments", title: "Етапи оплат", color: "#22c55e", Icon: Wallet };
    return { kind: "comment", title: "Коментар", color: "#eab308", Icon: MessageSquareText };
  }
  if (a.type === "STATUS_CHANGE") return { kind: "stage", title: "Стадія змінена", color: "#7aa7ff", Icon: ArrowRightLeft };
  if (a.type === "TASK_CREATED") return { kind: "task", title: "Створено справу", color: "#38bdf8", Icon: ListTodo };
  if (a.type === "TASK_DONE") return { kind: "done", title: "Справу виконано", color: "#22c55e", Icon: CircleCheck, text: c.replace(/^Задача виконана:\s*/, "") };
  if (a.type === "CREATED") return { kind: "created", title: "Лід створено", color: "#C98C0A", Icon: Sparkles };
  if (a.type === "DEAL_CREATED") return { kind: "deal", title: "Угоду створено", color: "#C98C0A", Icon: Briefcase };
  return { kind: "other", title: "Подія", color: "#94a3b8", Icon: Clock };
}

export default function LeadDrawer({
  leadId,
  onClose,
  onUpdate,
  onOpenLead,
  onLoaded,
}: {
  leadId: string;
  onClose: () => void;
  onUpdate: () => void;
  onOpenLead?: (id: string) => void; // jump to a linked lead (transfer source / copy)
  onLoaded?: (number: number) => void; // lead data arrived (used to put /leads/<number> in the address bar)
}) {
  const { sources: leadSources } = useLeadSources();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [tab, setTab] = useState<Tab>("main");
  const tabsRef = useRef<HTMLDivElement>(null);
  useDragScroll(tabsRef, !!lead);
  const [composer, setComposer] = useState<"note" | "task" | "transfer">("note");
  const [running, setRunning] = useState<string | null>(null);
  const [transferred, setTransferred] = useState<{ id: string; number: number; name: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [closing, setClosing] = useState<"win" | "loss" | "pick" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ funnelId: string; status: string } | null>(null);
  const { settings } = useCrmSettings();
  const { fx } = useFx();
  const qc = useQueryClient();
  const { access } = useAccess();
  // "now" for durations — refreshed every time the lead is (re)loaded
  const [now, setNow] = useState(() => Date.now());

  const fetchLead = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LeadDetail = await res.json();
      setLead(data);
      setNow(Date.now());
    } catch (e) {
      console.error("fetchLead error:", e);
      setLead({ id: leadId, name: "Помилка завантаження", status: "NEW_LEAD", tasks: [], activities: [], deals: [], usedServices: [] } as unknown as LeadDetail);
    }
  }, [leadId]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const taskActions = useTaskActions(() => { fetchLead(); onUpdate(); });
  // a task ticked somewhere else (bell, «Задачі» page) → refresh this card's tasks and timeline
  useEffect(() => qc.getQueryCache().subscribe((e) => {
    if (e.type === "updated" && e.action.type === "invalidate" && e.query.queryKey[0] === BELL_KEY[0]) fetchLead();
  }), [qc, fetchLead]);
  const stageGuard = useStageGuard(() => { fetchLead(); onUpdate(); });
  const dialogOpen = taskActions.open || stageGuard.open;

  const loadedNumber = lead?.number;
  useEffect(() => { if (loadedNumber) onLoaded?.(loadedNumber); }, [loadedNumber, onLoaded]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !showCalendar && !dialogOpen && !closing && !confirmDelete && !transfer) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, showCalendar, dialogOpen, closing, confirmDelete, transfer]);

  async function patch(data: Record<string, unknown>) {
    // optimistic for simple fields
    setLead((l) => (l ? ({ ...l, ...data } as LeadDetail) : l));
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      toast({ kind: "info", title: "Немає прав", text: err.error ?? "Твоя роль не дозволяє змінювати цю угоду" });
    }
    fetchLead();
    onUpdate();
  }

  function openLinked(id: string) {
    if (onOpenLead) onOpenLead(id);
    else window.location.assign(`/leads?open=${id}`);
  }

  async function linkLead(targetId: string) {
    const res = await fetch(`/api/leads/${leadId}/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId }) });
    if (!res.ok) return toastError((await res.json().catch(() => null))?.error ?? "Не вдалося зв'язати");
    setLinking(false);
    fetchLead();
  }
  async function unlinkLead(targetId: string) {
    const res = await fetch(`/api/leads/${leadId}/links`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId }) });
    if (!res.ok) return toastError("Не вдалося відв'язати");
    fetchLead();
  }

  async function runProcess(processId: string) {
    setRunning(processId);
    try {
      const res = await fetch(`/api/leads/${leadId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "error");
      const p = settings.processes.find((x) => x.id === processId);
      setTransferred({ id: data.id, number: data.number, name: getFunnel(settings, p?.toFunnelId).name });
      fetchLead();
      onUpdate();
    } catch (e) {
      toastError(`Не вдалося передати: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRunning(null);
    }
  }

  async function moveToFunnel(funnelId: string, status: string) {
    const next = getFunnel(settings, funnelId);
    setTransfer(null);
    await patch({ status, funnelId: next.id, funnelName: next.name });
  }

  function saveCustom(id: string, v: unknown) {
    const cur = { ...(lead?.customFields ?? {}) };
    if (v === null || v === "" || (Array.isArray(v) && !v.length)) delete cur[id];
    else cur[id] = v;
    patch({ customFields: { [id]: v ?? null } });
    setLead((l) => (l ? { ...l, customFields: cur } : l));
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, content: note.trim() }),
    });
    setNote("");
    setBusy(false);
    fetchLead();
  }

  // comments: edit text / pin on top (optimistic)
  async function patchNote(id: string, data: { content?: string; pinned?: boolean }) {
    setLead((l) => l && { ...l, activities: l.activities.map((a) => (a.id === id ? { ...a, ...data, ...(data.content ? { editedAt: new Date().toISOString() } : {}) } : a)) });
    const res = await fetch(`/api/activities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) fetchLead();
  }
  function saveEditNote() {
    if (!editNote) return;
    const text = editNote.text.trim();
    if (text) patchNote(editNote.id, { content: text });
    setEditNote(null);
  }

  async function createTask(data: NewTask) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, leadId }),
    });
    if (res.ok) {
      const t: Task = await res.json();
      setLead((l) => l && { ...l, tasks: [t, ...l.tasks] }); // optimistic
    }
    qc.invalidateQueries({ queryKey: BELL_KEY });
    fetchLead();
    onUpdate();
  }

  function toggleTask(task: Task, done: boolean) {
    const status = done ? "DONE" : "TODO";
    setLead((l) => l && { ...l, tasks: l.tasks.map((t) => (t.id === task.id ? { ...t, status, completedAt: done ? new Date().toISOString() : null } : t)) });
    if (lead) taskActions.setDone(task, { id: lead.id, status: lead.status, funnelId: lead.funnelId }, done);
  }

  // Tasks of rules with «Додати в календар» get the calendar button
  function calendarFor(task: Task): (() => void) | undefined {
    if (!lead || !settings.tasks.rules.find((r) => r.id === task.autoRuleId)?.calendar) return undefined;
    const l = lead;
    return () => taskActions.openCalendar(task, { ...l, number: l.number });
  }


  async function deleteLead() {
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    setConfirmDelete(false);
    onUpdate();
    onClose();
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1400);
  }

  // ── loading shell ──
  if (!lead) {
    return (
      <div className="fixed inset-0 z-[70] flex">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative ml-auto w-full lg:w-[calc(100vw-72px)] max-w-[1400px] h-full bg-[#0b0b0b] border-l border-[var(--border)] flex items-center justify-center lead-card-in">
          <span className="text-[var(--text-muted)] text-sm">Завантаження…</span>
        </div>
      </div>
    );
  }

  const resolved = resolveStage(settings, lead);
  const { funnel, stage, reason } = resolved;
  const closedInfo = stage.kind !== "active" ? { color: stage.color, label: stage.label } : null;
  const openTasks = sortOpen(lead.tasks.filter((t) => t.status !== "DONE"));
  const doneTasks = sortDone(lead.tasks.filter((t) => t.status === "DONE"));
  const taskRow = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      onToggle={(done) => toggleTask(t, done)}
      onDelete={() => taskActions.remove(t)}
      onCalendar={calendarFor(t)}
    />
  );
  const stageName = (id: string) => resolveStage(settings, { status: id, funnelId: lead.funnelId }).stage;

  const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");
  const { sections: cardSections, items: cardItems } = funnel.fields;
  // Win / loss reason sits in the block that holds «Сума» (or the first non-empty block).
  const reasonSection =
    cardItems.find((f) => f.builtin && f.id === "amount")?.section ??
    cardSections.find((x) => x.id !== CONTACT_SECTION && cardItems.some((f) => f.section === x.id))?.id ??
    CONTACT_SECTION;
  const chatChannel = preferredMessenger(lead);
  const chatHref = messengerHref(chatChannel, lead);
  // «Клієнт звернувся ще раз»: a process from this funnel into the same funnel
  const repeatProcess = settings.processes.find((p) => p.fromFunnelId === funnel.id && p.toFunnelId === funnel.id) ?? null;
  // a sales funnel that hands deals over to a funnel with payments («Операційка») plans the payment stages here
  const payTarget = funnel.payments ? null : settings.funnels.find((f) => f.payments && settings.processes.some((p) => p.fromFunnelId === funnel.id && p.toFunnelId === f.id)) ?? null;
  // «Зустріч» button: the meeting dialog; if a «Додати зустріч у календар» task is open, saving ticks it done
  function openMeeting() {
    if (!lead) return;
    const calTask = openTasks.find((t) => settings.tasks.rules.find((r) => r.id === t.autoRuleId)?.calendar);
    if (calTask) taskActions.openCalendar(calTask, { ...lead, number: lead.number });
    else setShowCalendar(true);
  }

  // Upcoming items for «Заплановано»
  const upcoming = [
    lead.remindAt && !lead.remindSent && { key: "remind", icon: <Bell size={12} />, color: "#4285F4", text: `Нагадування в Telegram · ${fmtDateTime(lead.remindAt)}` },
    lead.pushAt && !lead.pushSent && { key: "push", icon: <Clock size={12} />, color: "#f59e0b", text: `Пуш${lead.pushStage ? ` (${lead.pushStage})` : ""} · ${fmtDateTime(lead.pushAt)}` },
    lead.calendarAt && { key: "cal", icon: <CalendarPlus size={12} />, color: "#4285F4", text: `Подія${lead.calendarStatus ? ` «${lead.calendarStatus}»` : ""} · ${fmtDateTime(lead.calendarAt)}` },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; color: string; text: string }[];

  // Timeline grouped by day (+ synthetic «Лід створено» at the end)
  // A jump over several stages is logged step by step (1 ms apart) → shown as one event with the whole chain.
  const merged: Activity[] = [];
  for (const a of [...lead.activities].sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt))) {
    // «Лід створено зі статусом: X» is a technical record (the card already shows «Лід створено»)
    if (a.type === "STATUS_CHANGE" && a.content.startsWith("Лід створено зі статусом")) continue;
    const m = a.type === "STATUS_CHANGE" ? STATUS_RE.exec(a.content) : null;
    const prev = merged[merged.length - 1];
    if (m && prev?.type === "STATUS_CHANGE" && prev.content.startsWith("Статус змінено: ")
      && prev.content.endsWith(` → ${m[1]}`) && +new Date(a.createdAt) - +new Date(prev.createdAt) < 50) {
      merged[merged.length - 1] = { ...prev, content: `${prev.content} → ${m[2]}`, createdAt: a.createdAt };
    } else merged.push(a);
  }
  merged.reverse();

  // pinned comments: chosen ones; if none was pinned by hand — the very first comment (unless it was unpinned)
  const comments = merged.filter((a) => eventMeta(a).kind === "comment").reverse(); // oldest first
  const handPinned = comments.filter((a) => a.pinned === true);
  const pinnedNotes = handPinned.length ? handPinned : comments[0] && comments[0].pinned !== false ? [comments[0]] : [];
  const pinnedIds = new Set(pinnedNotes.map((a) => a.id));

  const stream = [
    ...merged.filter((a) => !pinnedIds.has(a.id)),
    { id: "__created__", type: "CREATED", content: "Лід створено", createdAt: lead.createdAt },
  ];
  const groups: { day: string; items: Activity[] }[] = [];
  for (const a of stream) {
    const day = dayLabel(a.createdAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  }

  // Time spent on each stage (from status-change history)
  const changes = [...lead.activities]
    .filter((a) => a.type === "STATUS_CHANGE" && STATUS_RE.test(a.content))
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const periods: { stageId: string; from: number; to: number }[] = [];
  {
    let cursor = new Date(lead.createdAt).getTime();
    let currentStage = changes.length ? STATUS_RE.exec(changes[0].content)![1] : lead.status;
    for (const c of changes) {
      const [, from, to] = STATUS_RE.exec(c.content)!;
      const t = new Date(c.createdAt).getTime();
      periods.push({ stageId: from || currentStage, from: cursor, to: t });
      cursor = t;
      currentStage = to;
    }
    periods.push({ stageId: lead.status, from: cursor, to: now });
  }


  // Built-in card field by key (label comes from the funnel settings).
  function builtinField(key: string, label: string): React.ReactNode {
    if (!lead) return null;
    switch (key) {
      case "telegram": return (
        <Field
                      label={label}
                      value={lead.telegram ?? ""}
                      display={lead.telegram ? <a href={`https://t.me/${lead.telegram}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#26A5E4] hover:underline">@{lead.telegram}</a> : undefined}
                      onSave={(v) => patch({ telegram: v })}
                      placeholder="username"
                    />
      );
      case "instagram": return (
        <Field
                      label={label}
                      value={lead.instagram ?? ""}
                      display={lead.instagram ? <a href={`https://instagram.com/${lead.instagram}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#E4405F] hover:underline">@{lead.instagram}</a> : undefined}
                      onSave={(v) => patch({ instagram: v })}
                      placeholder="username"
                    />
      );
      case "email": return (
        <Field label={label} value={lead.email ?? ""} onSave={(v) => patch({ email: v })} />
      );
      case "messenger": return (
        <div className="py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-1">{label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMUNICATION_CHANNELS.map((m) => {
                          const active = lead.messenger === m;
                          const accent = CHANNEL_ACCENT[m] ?? "#26A5E4";
                          return (
                            <button
                              key={m}
                              onClick={() => patch({ messenger: active ? null : m })}
                              className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-lg text-xs transition-all cursor-pointer border"
                              style={active
                                ? { background: `${accent}22`, color: accent, borderColor: `${accent}55` }
                                : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border)" }}
                            >
                              <MessengerIcon channel={m} size={10} />{m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
      );
      case "amount": {
        const cur = asCurrency(lead.currency);
        return (
          <div className="relative">
            <div className="absolute right-0 top-1 z-[1] flex gap-0.5">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => c !== cur && patch({ currency: c })}
                  title={CURRENCY_LABEL[c]}
                  className="w-6 h-5 rounded text-[11px] font-semibold border transition-colors cursor-pointer"
                  style={c === cur
                    ? { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-subtle)" }
                    : { color: "var(--text-dim)", borderColor: "var(--border)", background: "transparent" }}
                >
                  {CURRENCY_SYMBOL[c]}
                </button>
              ))}
            </div>
            <Field
              label={label}
              kind="number"
              value={lead.amount ? String(lead.amount) : ""}
              display={lead.amount ? (
                <span>
                  <span className="font-semibold text-[var(--accent)]">{formatMoney(lead.amount, cur)}</span>
                  {cur !== "EUR" && <span className="ml-2 text-[11px] text-[var(--text-dim)]" title={`Курс НБУ на ${fx.date}`}>≈ {formatMoney(toEur(lead.amount, cur, fx), "EUR")}</span>}
                </span>
              ) : undefined}
              onSave={(v) => patch({ amount: v })}
              mono
            />
          </div>
        );
      }
      case "service": return (
        <Field label={label} kind="select" options={LEAD_SERVICES} value={lead.service ?? ""} onSave={(v) => patch({ service: v })} />
      );
      case "niche": return (
        <Field label={label} value={lead.niche ?? ""} onSave={(v) => patch({ niche: v })} />
      );
      case "source": return (
        <div className="grid grid-cols-2 gap-x-4">
                      <Field label={label} kind="select" options={leadSources.map((s) => s.value)} value={lead.source ?? ""} onSave={(v) => patch({ source: v })} />
                      <Field label="Кампанія / деталі" value={lead.sourceDetail ?? ""} onSave={(v) => patch({ sourceDetail: v })} />
                    </div>
      );
      case "geo": return (
        <Field label={label} value={lead.geo ?? ""} onSave={(v) => patch({ geo: v })} />
      );
      case "comment": return (
        <Field label={label} kind="textarea" value={lead.comment ?? ""} onSave={(v) => patch({ comment: v })} />
      );
      case "siteStructure": return (
        <Field label={label} kind="textarea" value={lead.siteStructure ?? ""} onSave={(v) => patch({ siteStructure: v })} />
      );
      case "paymentSystem": return (
        <Field label={label} kind="select" options={PAYMENT_SYSTEMS} value={lead.paymentSystem ?? ""} onSave={(v) => patch({ paymentSystem: v })} />
      );
      case "caseUrl": return (
        <Field label={label} value={lead.caseUrl ?? ""} placeholder="https://… — бойовий сайт, не тестовий домен" onSave={(v) => patch({ caseUrl: v })}
          display={lead.caseUrl ? (
            <a href={lead.caseUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[13px] text-[#7aa7ff] hover:underline break-all">
              {lead.caseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}<ExternalLink size={11} className="shrink-0" />
            </a>
          ) : undefined} />
      );
      case "projectDeadline": return (
        <Field label={label} value={lead.projectDeadline ?? ""} onSave={(v) => patch({ projectDeadline: v })} />
      );
      case "extraLang": return (
        <div className="py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-1">{label}</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => patch({ hasExtraLang: !lead.hasExtraLang, languages: lead.hasExtraLang ? "" : lead.languages ?? "" })}
                          className="w-8 h-[18px] rounded-full relative transition-colors cursor-pointer shrink-0"
                          style={{ background: lead.hasExtraLang ? "var(--accent)" : "var(--surface-2)", border: "1px solid var(--border)" }}
                          aria-label="Додаткова мова"
                        >
                          <span className="absolute top-[1px] w-[14px] h-[14px] rounded-full bg-white transition-all" style={{ left: lead.hasExtraLang ? 15 : 1 }} />
                        </button>
                        {lead.hasExtraLang && (
                          <div className="flex-1 -my-1.5">
                            <Field label="" value={lead.languages ?? ""} onSave={(v) => patch({ languages: v, hasExtraLang: true })} placeholder="EN, PL…" />
                          </div>
                        )}
                      </div>
                    </div>
      );
      case "usedServices": return (
        <div className="py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-1">{label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {UPSELL_SERVICES.map((sv) => {
                          const on = lead.usedServices.includes(sv);
                          return (
                            <button
                              key={sv}
                              onClick={() => patch({ usedServices: on ? lead.usedServices.filter((x) => x !== sv) : [...lead.usedServices, sv] })}
                              className="px-2 py-0.5 text-[11px] rounded-md border transition-colors cursor-pointer"
                              style={on
                                ? { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-subtle)" }
                                : { color: "var(--text-dim)", borderColor: "var(--border)" }}
                            >
                              {on && "✓ "}{sv}
                            </button>
                          );
                        })}
                      </div>
                    </div>
      );
      case "pushStage": return (
        <div className="py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-1">{label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {PUSH_STAGES.map((p) => {
                          const active = lead.pushStage === p;
                          return (
                            <button
                              key={p}
                              onClick={() => patch({ pushStage: active ? null : p })}
                              className="px-2.5 py-0.5 rounded-lg text-xs transition-all cursor-pointer border"
                              style={active
                                ? { background: "rgba(251,146,60,0.15)", color: "#fb923c", borderColor: "rgba(251,146,60,0.4)" }
                                : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border)" }}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
      );
      case "pushAt": return (
        <Field
                      label={label}
                      kind="datetime"
                      value={lead.pushAt ? toWarsawInput(lead.pushAt) : ""}
                      display={lead.pushAt ? (
                        <span style={{ color: lead.pushSent ? "#22c55e" : "#f59e0b" }}>{fmtDateTime(lead.pushAt)}{lead.pushSent ? " · відправлено ✓" : ""}</span>
                      ) : undefined}
                      onSave={(v) => patch({ pushAt: v })}
                    />
      );
      case "kpAt": return (
        <Field
                      label={label}
                      kind="datetime"
                      value={lead.kpAt ? toLocalInput(lead.kpAt) : ""}
                      display={lead.kpAt ? <span className="text-[#a78bfa]">{fmtDateTime(lead.kpAt)}</span> : undefined}
                      onSave={(v) => patch({ kpAt: v ? new Date(v).toISOString() : null })}
                    />
      );
      case "pushComment": return (
        <Field label={label} kind="textarea" value={lead.pushComment ?? ""} onSave={(v) => patch({ pushComment: v })} />
      );
      default: return null;
    }
  }

  // «… лід #12» in the timeline → clickable when it is a linked lead
  const linkedByNumber = new Map<number, string>(
    [lead.sourceLead, ...lead.transfers].filter((x): x is LinkedLead => !!x).map((x) => [x.number, x.id])
  );
  function commentCard(a: Activity, pinned: boolean) {
    const editing = editNote?.id === a.id;
    const btn = "p-1 rounded-md text-[#facc15]/70 hover:text-[#facc15] hover:bg-[#eab308]/15 cursor-pointer";
    return (
      <div className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br px-3.5 py-2.5 ${pinned ? "border-[#eab308]/45 from-[#eab308]/[0.16] to-[#eab308]/[0.05]" : "border-[#eab308]/30 from-[#eab308]/[0.10] to-[#eab308]/[0.03]"}`}>
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#eab308]" />
        <div className="flex items-center gap-2 mb-1">
          {pinned && <Pin size={12} className="text-[#facc15] -rotate-45" />}
          <span className="text-[11px] font-semibold text-[#facc15]">{pinned ? "Закріплений коментар" : "Коментар"}</span>
          <span className="text-[11px] tabular-nums text-[var(--text-dim)]" title={fmtDateTime(a.createdAt)}>{pinned ? fmtDateTime(a.createdAt) : format(new Date(a.createdAt), "HH:mm")}</span>
          {a.editedAt && <span className="text-[10px] text-[var(--text-dim)]" title={`Змінено ${fmtDateTime(a.editedAt)}`}>· змінено</span>}
          {!editing && (
            <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button className={btn} title="Редагувати" onClick={() => setEditNote({ id: a.id, text: a.content })}><Pencil size={13} /></button>
              <button className={btn} title={pinned ? "Відкріпити" : "Закріпити зверху"} onClick={() => patchNote(a.id, { pinned: !pinned })}>
                {pinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
            </span>
          )}
        </div>
        {editing ? (
          <div>
            <textarea autoFocus value={editNote.text} rows={Math.min(10, Math.max(2, editNote.text.split("\n").length))}
              onChange={(e) => setEditNote({ id: a.id, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEditNote(); if (e.key === "Escape") { e.stopPropagation(); setEditNote(null); } }}
              className="w-full resize-y rounded-lg border border-[#eab308]/30 bg-black/20 px-2.5 py-2 text-[14px] leading-relaxed text-[var(--text)] outline-none focus:border-[#eab308]/60" />
            <div className="mt-1.5 flex items-center gap-2">
              <button onClick={saveEditNote} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#eab308]/20 text-[#facc15] hover:bg-[#eab308]/30 cursor-pointer"><Check size={13} />Зберегти</button>
              <button onClick={() => setEditNote(null)} className="px-2.5 py-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
              <span className="ml-auto text-[10px] text-[var(--text-dim)]">Ctrl+Enter — зберегти · Esc — скасувати</span>
            </div>
          </div>
        ) : (
          <p className="text-[14px] leading-relaxed text-[var(--text)] whitespace-pre-wrap break-words">{linkifyNumbers(a.content)}</p>
        )}
      </div>
    );
  }

  function linkifyNumbers(text: string): React.ReactNode {
    const parts = text.split(/(#\d+)/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
      const id = /^#\d+$/.test(part) ? linkedByNumber.get(Number(part.slice(1))) : undefined;
      return id ? (
        <button key={i} onClick={() => openLinked(id)} className="text-[#7aa7ff] hover:underline cursor-pointer">{part}</button>
      ) : <Fragment key={i}>{part}</Fragment>;
    });
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "main", label: "Загальне", icon: <LayoutGrid size={13} /> },
    { key: "tasks", label: "Справи", icon: <ListChecks size={13} />, count: openTasks.length },
    ...(funnel.payments ? [{ key: "payments" as Tab, label: "Оплати", icon: <Wallet size={13} /> }] : []),
    { key: "history", label: "Історія стадій", icon: <History size={13} /> },
  ];

  const headBtn = "w-10 h-10 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.07] transition-colors cursor-pointer";

  return (
    <>
      <div className="fixed inset-0 z-[70] flex">
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />

        {/* Close tab on the left edge (desktop) */}
        <button
          onClick={onClose}
          className="hidden lg:flex absolute top-4 z-20 w-9 h-9 items-center justify-center rounded-l-full text-black cursor-pointer"
          style={{ right: "min(calc(100vw - 72px), 1400px)", background: "var(--accent)" }}
          aria-label="Закрити"
        >
          <X size={17} />
        </button>

        <div className="relative z-10 ml-auto w-full lg:w-[calc(100vw-72px)] max-w-[1400px] h-full flex flex-col bg-[#0b0b0b] border-l border-white/[0.08] shadow-2xl lead-card-in">
          {/* ── Header ── */}
          <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-white/[0.06] space-y-3">
            {/* phones: action buttons go to their own row above the title, so the name isn't squeezed */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                {editName !== null ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                      // a project deal: the title is the project name (empty → «Проєкт #N»); otherwise the contact name
                      if (funnel.payments) { if (editName.trim() !== (lead.projectName ?? "")) patch({ projectName: editName.trim() }); }
                      else if (editName.trim() && editName !== lead.name) patch({ name: editName.trim() });
                      setEditName(null);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { e.stopPropagation(); setEditName(null); } }}
                    placeholder={funnel.payments ? `Назва проєкту · порожньо — «Проєкт #${lead.number}»` : "Імʼя / назва угоди"}
                    className="w-full max-w-xl text-xl font-semibold bg-transparent border-b border-[var(--accent)] text-[var(--text)] focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: stage.color }} />
                    {lead.number && (funnel.payments ? !!lead.projectName?.trim() : hasRealName(lead)) ? <span className="text-sm font-semibold text-[var(--text-dim)] tabular-nums shrink-0">#{lead.number}</span> : null}
                    <h2
                      data-private={funnel.payments ? "project" : "name"}
                      onClick={() => setEditName(funnel.payments ? lead.projectName ?? "" : hasRealName(lead) ? lead.name : "")}
                      className={`text-xl font-semibold truncate cursor-text ${funnel.payments || hasRealName(lead) ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}
                      title={funnel.payments ? "Назва проєкту — натисни, щоб змінити" : "Натисни, щоб змінити"}
                    >
                      {funnel.payments ? projectTitle(lead) : leadDisplayName(lead)}
                    </h2>
                    {funnel.payments && hasRealName(lead) && <span data-private="name" className="text-sm text-[var(--text-muted)] truncate shrink-0 max-w-[30%]">· {lead.name}</span>}
                    <button onClick={() => setEditName(funnel.payments ? lead.projectName ?? "" : hasRealName(lead) ? lead.name : "")} className="text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Змінити назву">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => copy(`${window.location.origin}/leads/${lead.number}`, "link")}
                      className="text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer"
                      title={`Скопіювати посилання на лід #${lead.number}`}
                    >
                      {copied === "link" ? <Check size={13} className="text-green-400" /> : <Link2 size={13} />}
                    </button>
                    <span className="hidden sm:inline ml-1 px-2 py-0.5 rounded-md border border-white/[0.08] text-xs text-[var(--text-muted)] truncate shrink-0">{funnel.name}</span>
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-dim)]">
                  <span title={fmtDateTime(lead.createdAt)}>Створено {timeAgo(lead.createdAt)}</span>
                  <span title={fmtDateTime(lead.updatedAt)}>Оновлено {timeAgo(lead.updatedAt)}</span>
                  {lead.amount ? <span data-private="amount" className="font-semibold text-[var(--accent)]">{formatMoney(lead.amount, lead.currency)}</span> : null}
                  {lead.closedAt && closedInfo && <span style={{ color: closedInfo.color }}>Закрито {timeAgo(lead.closedAt)}</span>}
                  {lead.sourceLeadNumber && (
                    lead.sourceLead ? (
                      <button onClick={() => openLinked(lead.sourceLead!.id)} className="flex items-center gap-1 text-[#7aa7ff] hover:underline cursor-pointer">
                        <CornerDownRight size={11} /> з #{lead.sourceLead.number} · {getFunnel(settings, lead.sourceLead.funnelId).name}
                      </button>
                    ) : <span className="flex items-center gap-1"><CornerDownRight size={11} /> з #{lead.sourceLeadNumber} (лід видалено)</span>
                  )}
                  {lead.transfers.map((t) => (
                    <button key={t.id} onClick={() => openLinked(t.id)} className="flex items-center gap-1 text-[#7aa7ff] hover:underline cursor-pointer">
                      <ArrowRight size={11} /> #{t.number} · {getFunnel(settings, t.funnelId).name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="sm:hidden mr-auto min-w-0 px-2 py-1 rounded-md border border-white/[0.08] text-xs text-[var(--text-muted)] truncate">{funnel.name}</span>
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} title="Зателефонувати" className={headBtn}><Phone size={14} /></a>
                )}
                {lead.telegram && (
                  <a href={`https://t.me/${lead.telegram}`} target="_blank" rel="noopener noreferrer" title="Telegram" className={headBtn}>
                    <MessengerIcon channel="Telegram" size={11} />
                  </a>
                )}
                {phoneDigits && (
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className={headBtn}>
                    <MessengerIcon channel="WhatsApp" size={11} />
                  </a>
                )}
                <button
                  onClick={openMeeting}
                  title={lead.calendarAt ? `Зустріч ${fmtDateTime(lead.calendarAt)} — перепланувати` : "Запланувати зустріч у Google Календарі"}
                  className={headBtn}
                  style={lead.calendarAt ? { color: "#fff", background: "#4285F4", borderColor: "#4285F4" } : { color: "#4285F4" }}
                >
                  <Video size={14} />
                </button>
                {can(access, funnel.id, "delete") && (
                  <button onClick={() => setConfirmDelete(true)} title="Видалити" className={`${headBtn} hover:!text-red-400`}><Trash2 size={14} /></button>
                )}
                <button onClick={onClose} title="Закрити (Esc)" className={`${headBtn} lg:hidden`}><X size={15} /></button>
              </div>
            </div>

            {/* Stage chevrons */}
            <StageChevrons
              funnel={funnel}
              currentId={stage.id}
              closed={closedInfo}
              reasonLabel={reason?.label}
              onPick={(id) => stageGuard.guard(lead, id, (status) => patch({ status }))}
              onFinish={() => setClosing("pick")}
            />

            {/* Tabs */}
            <div ref={tabsRef} className="flex items-center gap-1 -mb-3 overflow-x-auto overscroll-x-contain no-scrollbar">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 sm:py-2 text-[13px] border-b-2 transition-colors cursor-pointer whitespace-nowrap ${tab === t.key ? "border-[var(--accent)] text-[var(--text)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                >
                  {t.icon}{t.label}
                  {!!t.count && <span className="ml-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-black" style={{ background: "var(--accent)" }}>{t.count}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto">
            {tab === "main" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-4 p-4 sm:p-6">
                {/* Left: fields */}
                <div className="space-y-3">
                  {stage.kind !== "active" && repeatProcess && (
                    <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06]">
                      <RotateCcw size={16} className="text-[var(--accent)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--text)]">Клієнт повернувся?</div>
                        <div className="text-[11px] text-[var(--text-muted)]">Нова угода з тим самим контактом і проєктом — правки, нова сторінка, підтримка. Ця залишиться в історії.</div>
                      </div>
                      <button onClick={() => runProcess(repeatProcess.id)} disabled={!!running}
                        className="px-3 py-2 rounded-lg text-xs font-semibold text-black cursor-pointer disabled:opacity-50 shrink-0" style={{ background: "var(--accent)" }}>
                        {running === repeatProcess.id ? "Створюю…" : repeatProcess.name}
                      </button>
                    </div>
                  )}
                  {transferred && stage.kind !== "active" && repeatProcess && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10 text-xs text-green-300">
                      <Check size={13} /> Створено нову угоду #{transferred.number}.
                      <button onClick={() => openLinked(transferred.id)} className="ml-auto font-semibold hover:underline cursor-pointer">Відкрити →</button>
                    </div>
                  )}
                  {cardSections.map((sec) => {
                    const own = cardItems.filter((f) => f.section === sec.id);
                    const isContact = sec.id === CONTACT_SECTION;
                    // closed lead: reason + win / loss date (stamped automatically in every funnel)
                    const withReason = stage.kind !== "active" && (!!reason || !!lead.closedAt) && sec.id === reasonSection;
                    if (!isContact && !own.length && !withReason) return null;
                    return (
                      <Section
                        key={sec.id}
                        title={sec.label || "Без назви"}
                      >
                        {isContact && (
                          <>
<div className="flex items-center gap-3 py-2">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-black shrink-0" style={{ background: stage.color }}>
                        {(leadDisplayName(lead).replace(/^Угода #/, "#")[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div data-private="name" className="text-sm font-medium text-[var(--text)] truncate">{leadDisplayName(lead)}</div>
                        {lead.phone && (
                          <button data-private="contacts" onClick={() => copy(lead.phone!, "phone")} className="flex items-center gap-1 text-xs text-[#7aa7ff] hover:text-[var(--accent)] cursor-pointer" title="Скопіювати">
                            {copied === "phone" ? <><Check size={11} className="text-green-400" /> скопійовано</> : <><Copy size={10} />{lead.phone}</>}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {lead.phone && <a href={`tel:${lead.phone}`} className={headBtn} title="Зателефонувати"><Phone size={13} /></a>}
                        {chatChannel && chatHref && (
                          <a href={chatHref} target="_blank" rel="noopener noreferrer" className={headBtn} title={`Написати в ${chatChannel}`}>
                            <MessengerIcon channel={chatChannel} size={10} title={`Написати в ${chatChannel}`} />
                          </a>
                        )}
                        {lead.email && <a href={`mailto:${lead.email}`} className={headBtn} title="Email"><Mail size={13} /></a>}
                      </div>
                    </div>
                    <div data-private="contacts"><Field label="Телефон" value={lead.phone ?? ""} mono onSave={(v) => patch({ phone: cleanPhone(v) })} placeholder="+380…" /></div>
                          </>
                        )}
                        {withReason && reason && <Field label={stage.kind === "win" ? "Причина виграшу" : "Причина програшу"} value={reason.label} />}
                        {withReason && lead.closedAt && (
                          <div className="py-1.5">
                            <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)] mb-0.5">{stage.kind === "win" ? "Дата виграшу" : "Дата програшу"}</div>
                            <div className="text-sm" style={{ color: stage.color }}>{fmtDateTime(lead.closedAt)}</div>
                          </div>
                        )}
                        {funnel.payments && sec.id === "project" && (
                          <Field label={<>Назва проєкту<Hint text="Як проєкт називається в заголовку картки, «Проєктах», «Графіку оплат», кешфлоу та P&L. Порожньо — «Проєкт #номер»." /></>}
                            value={lead.projectName ?? ""} placeholder={`Проєкт #${lead.number}`} onSave={(v) => patch({ projectName: v })} />
                        )}
                        {own.map((f) =>
                          f.builtin
                            ? PRIVATE_FIELD[f.id]
                              ? <div key={f.id} data-private={PRIVATE_FIELD[f.id]}>{builtinField(f.id, f.label)}</div>
                              : <Fragment key={f.id}>{builtinField(f.id, f.label)}</Fragment>
                            : <CustomFieldView key={f.id} f={f} value={lead.customFields?.[f.id]} onSave={(v) => saveCustom(f.id, v)} />
                        )}
                        {funnel.payments && isContact && (
                          <Field label={<>Ім&apos;я платника<Hint text="На кого робимо інвойс: компанія або ПІБ, як має стояти в рахунку (Payer). Автоматично підставляється, коли формуєш «Invoice» по етапу оплати." /></>}
                            value={lead.payer ?? ""} placeholder="Компанія / ПІБ для інвойсу" onSave={(v) => patch({ payer: v })} />
                        )}
                        {/* sales deal: payment stages right under the amount — handed over to «Операційка» by the business process */}
                        {payTarget && own.some((f) => f.builtin && f.id === "amount") && (
                          <div className="pt-2"><PaymentPlan lead={{ id: lead.id, amount: lead.amount, currency: lead.currency }} canEdit={can(access, funnel.id, "edit")} target={payTarget.name} /></div>
                        )}
                      </Section>
                    );
                  })}

                  {funnel.payments && (
                    <DealPayments
                      mode="summary"
                      onOpen={() => setTab("payments")}
                      lead={{ id: lead.id, number: lead.number, name: lead.name, phone: lead.phone, amount: lead.amount, currency: lead.currency, projectName: lead.projectName, payer: lead.payer }}
                      canEdit={can(access, funnel.id, "edit")}
                      onChanged={fetchLead}
                    />
                  )}

                  {/* «Партнери»: the partner's leads + «Додати ліда»; other funnels: who brought the lead */}
                  {funnel.partners ? (
                    <PartnerLeads partner={{ id: lead.id, name: lead.name, number: lead.number }} onOpen={openLinked}
                      salesFunnel={(() => { const f = settings.funnels.find((x) => !x.payments && !x.partners); const st = f?.stages.find((x) => x.kind === "active"); return f && st ? { id: f.id, name: f.name, firstStage: st.id } : null; })()} />
                  ) : !funnel.payments && (
                    <PartnerPicker partnerId={lead.partnerId ?? null} canEdit={can(access, funnel.id, "edit")} onSave={(id) => patch({ partnerId: id })} onOpen={openLinked} />
                  )}

                  {/* Підписка / Апсейл: the project's payment stages (paid / not yet) */}
                  {!funnel.payments && lead.sourceLead && getFunnel(settings, lead.sourceLead.funnelId).payments && (
                    <SourcePayments project={lead.sourceLead} onOpen={() => openLinked(lead.sourceLead!.id)} />
                  )}

                  <Section title="Пов'язані угоди" action={
                    <button onClick={() => setLinking((v) => !v)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-white/[0.05] cursor-pointer">
                      <Link2 size={11} /> Зв&apos;язати угоду
                    </button>
                  }>
                    <div className="space-y-1.5 py-1">
                      {linking && <LinkSearch selfId={lead.id} known={new Set([lead.sourceLeadId ?? "", ...lead.transfers.map((t) => t.id), ...lead.linked.map((t) => t.id)])} settings={settings} onPick={(id) => linkLead(id)} onClose={() => setLinking(false)} />}
                      {lead.sourceLeadNumber && (
                        <LinkedRow
                          caption={lead.sourceLead && lead.sourceLead.funnelId === lead.funnelId ? "Попередня угода клієнта" : "Передано з"}
                          number={lead.sourceLead?.number ?? lead.sourceLeadNumber}
                          linked={lead.sourceLead}
                          settings={settings}
                          onOpen={openLinked}
                        />
                      )}
                      {lead.transfers.map((t) => (
                        <LinkedRow key={t.id} caption={t.funnelId === lead.funnelId ? "Клієнт звернувся ще раз" : "Передано в"} number={t.number} linked={t} settings={settings} onOpen={openLinked} />
                      ))}
                      {lead.linked.map((t) => (
                        <LinkedRow key={t.id} caption="Зв'язано" number={t.number} linked={t} settings={settings} onOpen={openLinked}
                          action={<button onClick={() => unlinkLead(t.id)} title="Відв'язати" aria-label="Відв'язати" className="p-1.5 rounded-md text-[var(--text-dim)] hover:text-red-400 hover:bg-white/[0.05] cursor-pointer"><X size={12} /></button>} />
                      ))}
                      {lead.suggested.length > 0 && (
                        <div className="pt-1">
                          <div className="text-[10px] uppercase tracking-wide text-[#fbbf24] mb-1">Той самий номер телефону — зв&apos;язати?</div>
                          <div className="space-y-1.5">
                            {lead.suggested.map((t) => (
                              <LinkedRow key={t.id} caption="Знайдено" number={t.number} linked={t} settings={settings} onOpen={openLinked}
                                action={<button onClick={() => linkLead(t.id)} className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-black cursor-pointer shrink-0" style={{ background: "var(--accent)" }}>Зв&apos;язати</button>} />
                            ))}
                          </div>
                        </div>
                      )}
                      {!lead.sourceLeadNumber && !lead.transfers.length && !lead.linked.length && !lead.suggested.length && !linking && (
                        <div className="text-xs text-[var(--text-dim)] py-1">Немає пов&apos;язаних угод</div>
                      )}
                    </div>
                  </Section>

                  {lead.deals.length > 0 && (
                    <Section title="Клієнти">
                      <div className="space-y-1.5 py-1">
                        {lead.deals.map((d) => (
                          <div key={d.id} className="flex items-center justify-between bg-[var(--surface-2)] px-3 py-2 rounded-lg">
                            <span className="text-sm text-[var(--text)]">{d.company ?? "Без назви"}</span>
                            <div className="flex items-center gap-2">
                              {d.budget && <span className="text-xs text-[var(--text-muted)]">${d.budget.toLocaleString()}</span>}
                              <Badge value={d.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>

                {/* Right: activity stream */}
                <div className="space-y-3 min-w-0">
                  {/* Composer */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-1 mb-2.5">
                      {([["note", "Коментар", <MessageSquare key="n" size={12} />], ["task", "Справа", <CheckSquare key="t" size={12} />], ["transfer", "Передати", <Workflow key="b" size={12} />]] as const).map(([k, l, icon]) => (
                        <button
                          key={k}
                          onClick={() => setComposer(k)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${composer === k ? "bg-[var(--accent-subtle)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                        >
                          {icon}{l}
                        </button>
                      ))}
                    </div>
                    {composer === "note" && (
                      <div className="flex gap-2">
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                          rows={2}
                          placeholder="Написати коментар… (Enter — зберегти, Shift+Enter — новий рядок)"
                          className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none placeholder:text-[var(--text-dim)]"
                        />
                        <button onClick={addNote} disabled={!note.trim() || busy} className="px-3 rounded-lg text-sm font-semibold text-black disabled:opacity-40 cursor-pointer" style={{ background: "var(--accent)" }}>
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                    {composer === "task" && <TaskComposer onCreate={createTask} autoFocus />}
                    {composer === "transfer" && (() => {
                      const procs = settings.processes.filter((p) => p.fromFunnelId === funnel.id);
                      return (
                        <div className="space-y-2">
                          {transferred && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10 text-xs text-green-300">
                              <Check size={13} /> Створено копію #{transferred.number} у «{transferred.name}». Оригінал лишився тут.
                              <button onClick={() => openLinked(transferred.id)} className="ml-auto font-semibold hover:underline cursor-pointer">Відкрити →</button>
                            </div>
                          )}
                          {procs.length ? procs.map((p) => {
                            const to = getFunnel(settings, p.toFunnelId);
                            const st = to.stages.find((x) => x.id === p.toStageId);
                            return (
                              <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40">
                                <Workflow size={14} className="text-[var(--accent)] shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-[var(--text)] truncate">{p.name}</div>
                                  <div className="text-[11px] text-[var(--text-dim)] truncate">
                                    Копія у «{to.name}»{st && <> → <span style={{ color: st.color }}>{st.label}</span></>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => runProcess(p.id)}
                                  disabled={!!running}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black disabled:opacity-50 cursor-pointer shrink-0"
                                  style={{ background: "var(--accent)" }}
                                >
                                  {running === p.id ? "Передаю…" : "Запустити"}
                                </button>
                              </div>
                            );
                          }) : (
                            <div className="px-3 py-2.5 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)]">
                              Для воронки «{funnel.name}» ще немає бізнес-процесів.{" "}
                              <a href="/settings" className="text-[var(--accent)] hover:underline">Створити в Налаштуваннях → Бізнес-процеси</a>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-0.5">
                            {settings.funnels.length > 1 ? (
                              <button
                                onClick={() => {
                                  const to = settings.funnels.find((f) => f.id !== funnel.id)!;
                                  setTransfer({ funnelId: to.id, status: activeStages(to)[0].id });
                                }}
                                className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer"
                                title="Без копії: лід просто переїде в іншу воронку (якщо помилились воронкою)"
                              >
                                <ArrowRightLeft size={11} /> Перемістити без копії
                              </button>
                            ) : <span />}
                            <a href="/settings" className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--text)]">
                              <Settings2 size={11} /> Налаштувати процеси
                            </a>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Planned */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Заплановано</span>
                      {doneTasks.length > 0 && (
                        <button onClick={() => setShowDone((v) => !v)} className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">
                          {showDone ? "Сховати виконані" : `Виконані (${doneTasks.length})`}
                        </button>
                      )}
                    </div>
                    {openTasks.length === 0 && upcoming.length === 0 ? (
                      <button
                        onClick={() => setComposer("task")}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer"
                        style={{ background: "rgba(201,140,10,0.08)", border: "1px dashed rgba(201,140,10,0.35)" }}
                      >
                        <Plus size={16} className="text-[var(--accent)] shrink-0" />
                        <span>
                          <span className="block text-sm text-[var(--text)]">Створіть справу</span>
                          <span className="block text-[11px] text-[var(--text-muted)]">Заплануйте наступну дію, щоб не забути про клієнта</span>
                        </span>
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        {openTasks.map(taskRow)}
                        {upcoming.map((u) => (
                          <div key={u.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs" style={{ color: u.color, background: `${u.color}12` }}>
                            {u.icon}{u.text}
                          </div>
                        ))}
                      </div>
                    )}
                    {showDone && doneTasks.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/[0.05] space-y-1">
                        {doneTasks.map(taskRow)}
                      </div>
                    )}
                  </div>

                  {/* Pinned comments — always on top of the feed */}
                  {pinnedNotes.length > 0 && (
                    <div className="space-y-2">
                      {pinnedNotes.map((a) => <div key={a.id}>{commentCard(a, true)}</div>)}
                    </div>
                  )}

                  {/* Timeline — every kind of event has its own icon and colour; comments stand out */}
                  <div className="relative pl-10">
                    <div className="absolute left-[13px] top-2 bottom-2 w-px bg-gradient-to-b from-white/[0.09] via-white/[0.06] to-transparent" />
                    {groups.map((g) => (
                      <div key={g.day} className="mb-4">
                        <div className="relative -ml-10 mb-2.5 flex items-center gap-2">
                          <span className="w-7 flex justify-center"><span className="w-1.5 h-1.5 rounded-full bg-white/25" /></span>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{g.day}</span>
                          <span className="flex-1 h-px bg-white/[0.05]" />
                        </div>
                        <div className="space-y-2">
                          {g.items.map((a) => {
                            const ev = eventMeta(a);
                            const time = <span className="text-[11px] tabular-nums text-[var(--text-dim)]" title={fmtDateTime(a.createdAt)}>{format(new Date(a.createdAt), "HH:mm")}</span>;
                            const dot = (
                              <span className="absolute -left-10 top-1.5 w-7 h-7 rounded-lg flex items-center justify-center ring-4 ring-[var(--surface)]" style={{ color: ev.color, background: `color-mix(in srgb, ${ev.color} 16%, #121214)` }}>
                                <ev.Icon size={14} />
                              </span>
                            );

                            // comment — the main thing in the feed: yellow card
                            if (ev.kind === "comment") {
                              return (
                                <div key={a.id} className="relative">
                                  {dot}
                                  {commentCard(a, false)}
                                </div>
                              );
                            }

                            // stage change: chips of the stages
                            const chain = a.type === "STATUS_CHANGE" && a.content.startsWith("Статус змінено: ") ? a.content.slice("Статус змінено: ".length).split(" → ") : null;
                            const m = chain && chain.length >= 2 && chain.every((x) => /^\S+$/.test(x)) ? chain : null;
                            let body: React.ReactNode;
                            if (m) {
                              body = (
                                <span className="flex flex-wrap items-center gap-1.5">
                                  {m.map((id, i) => {
                                    const st = stageName(id);
                                    const passed = i > 0 && i < m.length - 1;
                                    return (
                                      <span key={i} className="flex items-center gap-1.5" style={passed ? { opacity: 0.55 } : undefined} title={passed ? "Пройдено автоматично (стрибок через стадію)" : undefined}>
                                        {i > 0 && <ArrowRight size={11} className="text-[var(--text-dim)]" />}
                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ color: st.color, background: `${st.color}1f` }}>{st.label}</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              );
                            } else if (ev.kind === "process") {
                              // «Передано у воронку «X» («proc») · новий лід #N» / «Створено передачею «proc» з воронки «X» · лід #N»
                              const to = /^Передано у воронку «([^»]+)»/.exec(a.content)?.[1];
                              const from = /з воронки «([^»]+)»/.exec(a.content)?.[1];
                              const num = /#(\d+)/.exec(a.content)?.[0];
                              body = (
                                <span className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text)]">
                                  {to ? <>Передано в <b className="font-semibold" style={{ color: ev.color }}>{to}</b></> : from ? <>Прийшло з <b className="font-semibold" style={{ color: ev.color }}>{from}</b></> : a.content}
                                  {num && <span className="text-[var(--text-dim)]">·</span>}
                                  {num && linkifyNumbers(num)}
                                </span>
                              );
                            } else if (a.type === "CREATED") {
                              body = <span className="text-sm text-[var(--text)]">{leadDisplayName(lead)}{lead.source ? <span className="text-[var(--text-muted)]"> · {lead.source}</span> : ""}</span>;
                            } else {
                              body = <span className="text-sm text-[var(--text)] whitespace-pre-wrap break-words">{linkifyNumbers(ev.text ?? a.content)}</span>;
                            }

                            // everything else — a light line: title, time, what happened
                            return (
                              <div key={a.id} className="relative">
                                {dot}
                                <div className={`rounded-xl px-3 py-2 ${ev.kind === "done" ? "border border-[#22c55e]/25 bg-[#22c55e]/[0.06]" : "border border-white/[0.05] bg-white/[0.015]"}`}>
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[11px] font-semibold" style={{ color: ev.color }}>{ev.title}</span>
                                    {time}
                                  </div>
                                  {body}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "payments" && funnel.payments && (
              <div className="p-4 sm:p-6">
                <DealPayments
                  lead={{ id: lead.id, number: lead.number, name: lead.name, phone: lead.phone, amount: lead.amount, currency: lead.currency, projectName: lead.projectName, payer: lead.payer }}
                  canEdit={can(access, funnel.id, "edit")}
                  onChanged={fetchLead}
                />
              </div>
            )}

            {tab === "tasks" && (
              <div className="p-4 sm:p-6 max-w-3xl space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Нова справа</div>
                  <TaskComposer onCreate={createTask} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[var(--text)]">В роботі · {openTasks.length}</h3>
                  {openTasks.length === 0 && <p className="text-sm text-[var(--text-dim)]">Немає запланованих справ</p>}
                  {openTasks.map(taskRow)}
                </div>
                {doneTasks.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-[var(--text-muted)]">Виконані · {doneTasks.length}</h3>
                    {doneTasks.map(taskRow)}
                  </div>
                )}
              </div>
            )}

            {tab === "history" && (
              <div className="p-4 sm:p-6 max-w-3xl space-y-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">Скільки часу лід провів на кожній стадії</h3>
                <div className="space-y-1.5">
                  {periods.map((p, i) => {
                    const st = stageName(p.stageId);
                    const total = Math.max(1, now - new Date(lead.createdAt).getTime());
                    const width = Math.max(3, ((p.to - p.from) / total) * 100);
                    const last = i === periods.length - 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 text-xs truncate" style={{ color: st.color }}>{st.label}</span>
                        <div className="flex-1 h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${width}%`, background: st.color }} />
                        </div>
                        <span className="w-28 shrink-0 text-right text-xs text-[var(--text-muted)] tabular-nums">
                          {duration(p.to - p.from)}{last && stage.kind === "active" ? " · зараз" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--text-dim)]">Рахується з історії змін стадій. Старі зміни, зроблені до появи історії, можуть бути не видні.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Win / loss dialog */}
      {closing && (
        <CloseLeadModal
          lead={lead}
          funnel={funnel}
          initialKind={closing === "pick" ? undefined : closing}
          onClose={() => setClosing(null)}
          onDone={() => { fetchLead(); onUpdate(); }}
        />
      )}

      {taskActions.modal}
      {stageGuard.modal}
      {showCalendar && (
        <CalendarModal
          lead={{ ...lead, number: lead.number }}
          onClose={() => setShowCalendar(false)}
          onSaved={() => { fetchLead(); onUpdate(); }}
        />
      )}

      <Modal open={!!transfer} onClose={() => setTransfer(null)} title="Перенести в іншу воронку">
        {transfer && (() => {
          const to = getFunnel(settings, transfer.funnelId);
          const sel = "w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] cursor-pointer";
          return (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                Зараз: <b className="text-[var(--text)]">{funnel.name}</b> · <span style={{ color: stage.color }}>{stage.label}</span>
              </p>
              <div>
                <div className="text-[11px] text-[var(--text-dim)] mb-1">Воронка</div>
                <select
                  value={transfer.funnelId}
                  onChange={(e) => setTransfer({ funnelId: e.target.value, status: activeStages(getFunnel(settings, e.target.value))[0].id })}
                  className={sel}
                >
                  {settings.funnels.filter((f) => f.id !== funnel.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-dim)] mb-1.5">Стадія</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeStages(to).map((st) => {
                    const on = transfer.status === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => setTransfer({ ...transfer, status: st.id })}
                        className="px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer"
                        style={on
                          ? { color: st.color, borderColor: `${st.color}80`, background: `${st.color}1f` }
                          : { color: "var(--text-muted)", borderColor: "var(--border)" }}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-dim)]">Усі дані, справи й історія ліда збережуться. Поля, яких немає в новій воронці, просто сховаються.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTransfer(null)} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
                <button
                  onClick={() => moveToFunnel(transfer.funnelId, transfer.status)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg text-black cursor-pointer"
                  style={{ background: "var(--accent)" }}
                >
                  Перенести
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Видалити ліда?">
        <p className="text-sm text-[var(--text-muted)] mb-5">Цю дію не можна скасувати. Лід та всі повʼязані задачі й активності будуть видалені.</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setConfirmDelete(false)} className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button onClick={deleteLead} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 cursor-pointer">Так, видалити</button>
        </div>
      </Modal>

    </>
  );
}
