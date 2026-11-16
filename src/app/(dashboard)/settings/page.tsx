"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Briefcase, Trophy, XCircle, Check, GitBranch, RotateCcw, Save,
  History, ArrowRight, AlertTriangle, ListPlus, Workflow, CornerDownRight, Layers, Flag, ArrowRightLeft, ListChecks, KeyRound, Bell,
} from "lucide-react";
import {
  TASK_PRIORITIES, PRIORITY_META, TIMEZONES, defaultRules, newRule, newStep, ruleStageIn, defaultTaskTemplates,
  type TaskTemplate, type AutoRule, type AutoStep, type AutoWhen, type AutoNo, type TaskPriority, type TaskSettings,
} from "@/lib/taskAutomation";
import {
  PAGE_GROUPS, FUNNEL_ACTIONS, NO_PERM, FULL_PERM, normPerm, newRoleId, NOTIFY, DEFAULT_NOTIFY,
  type Role, type FunnelPerm, type AccessSettings,
} from "@/lib/access";
import { useAccess } from "@/lib/useAccess";
import SourceRename from "@/components/leads/SourceRename";
import { Modal } from "@/components/ui/modal";
import { LEGACY_MIGRATION } from "@/lib/leadOptions";
import { useCrmSettings } from "@/lib/useCrmSettings";
import {
  CLOSE_FIELDS, STAGE_COLORS, newFunnel, newId, defaultFunnel,
  BUILTIN_FIELDS, CUSTOM_FIELD_TYPES, CONTACT_SECTION, SIMPLE_BUILTINS, fieldRule, newProcess,
  type CrmSettings, type Funnel, type Stage, type CloseRules, type CardField, type FieldRule, type TransferProcess,
} from "@/lib/crmSettings";
import { toastError } from "@/components/ui/toast";
import { TASK_ICONS } from "@/components/tasks/TaskModal";
import { ask, askText } from "@/components/ui/dialogs";

type Stats = Record<string, { total: number; stages: Record<string, number>; unknown: Record<string, number> }>;

interface LegacyPreview {
  rows: { from: string; status: string; label: string; count: number; tasks: number; task?: { title: string }; note?: string }[];
  total: number;
  migrated: number;
}

const input =
  "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors";
const card = "bg-[var(--surface)] border border-[var(--border)] rounded-xl";
const iconBtn =
  "p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ── Small pieces ──

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 rounded-md border border-white/10 cursor-pointer"
        style={{ background: value }}
        aria-label="Колір"
      />
      {open && (
        <div className="absolute z-20 top-8 left-0 p-2 rounded-xl border border-[var(--border)] grid grid-cols-8 gap-1.5 shadow-2xl"
          style={{ background: "rgba(14,14,14,0.98)" }}>
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className="w-5 h-5 rounded cursor-pointer flex items-center justify-center"
              style={{ background: c, outline: c === value ? "2px solid white" : undefined, outlineOffset: 1 }}
            >
              {c === value && <Check size={10} strokeWidth={3} className="text-black" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 cursor-pointer group">
      <span
        className="w-8 h-[18px] rounded-full relative transition-colors"
        style={{ background: on ? "var(--accent)" : "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <span
          className="absolute top-[1px] w-[14px] h-[14px] rounded-full bg-white transition-all"
          style={{ left: on ? 15 : 1 }}
        />
      </span>
      <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text)]">{label}</span>
    </button>
  );
}

// ── Win / loss block ──

function CloseBlock({
  kind, stage, rules, onStage, onRules,
}: {
  kind: "win" | "loss";
  stage: Stage;
  rules: CloseRules;
  onStage: (s: Stage) => void;
  onRules: (r: CloseRules) => void;
}) {
  const Icon = kind === "win" ? Trophy : XCircle;
  return (
    <div className={`${card} p-4 space-y-4`} style={{ borderColor: `${stage.color}40` }}>
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color: stage.color }} />
        <ColorPicker value={stage.color} onChange={(color) => onStage({ ...stage, color })} />
        <input
          value={stage.label}
          onChange={(e) => onStage({ ...stage, label: e.target.value })}
          className={`${input} font-medium`}
          placeholder={kind === "win" ? "Виграш" : "Програш"}
        />
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
          Причини {kind === "win" ? "виграшу" : "програшу"}
        </div>
        <div className="space-y-1.5">
          {rules.reasons.map((r, i) => (
            <div key={r.id} className="flex items-center gap-1.5">
              <input
                value={r.label}
                onChange={(e) => {
                  const reasons = [...rules.reasons];
                  reasons[i] = { ...r, label: e.target.value };
                  onRules({ ...rules, reasons });
                }}
                className={input}
              />
              <button
                type="button"
                onClick={() => onRules({ ...rules, reasons: rules.reasons.filter((x) => x.id !== r.id) })}
                className={`${iconBtn} hover:!text-red-400`}
                aria-label="Видалити причину"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {rules.reasons.length === 0 && <p className="text-xs text-[var(--text-dim)]">Причин поки немає</p>}
        </div>
        <button
          type="button"
          onClick={() => onRules({ ...rules, reasons: [...rules.reasons, { id: newId("r"), label: "" }] })}
          className="mt-2 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          <Plus size={13} /> Додати причину
        </button>
      </div>

      <Toggle
        on={rules.reasonRequired}
        onChange={(reasonRequired) => onRules({ ...rules, reasonRequired })}
        label="Причина обовʼязкова"
      />

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
          Обовʼязкові поля при закритті
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CLOSE_FIELDS.map((f) => {
            const on = rules.requiredFields.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onRules({
                  ...rules,
                  requiredFields: on ? rules.requiredFields.filter((k) => k !== f.key) : [...rules.requiredFields, f.key],
                })}
                className="px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer"
                style={on
                  ? { background: `${stage.color}1a`, borderColor: `${stage.color}80`, color: stage.color }
                  : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {on && "✓ "}{f.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Old stage codes → new funnel (one-time migration) ──

function LegacyStagesSection({ stageLabel, onChanged }: { stageLabel: (id: string) => string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [history, setHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["legacy-migration"],
    queryFn: async (): Promise<LegacyPreview> => (await fetch("/api/settings/migrate-legacy")).json(),
  });
  const data = q.data;
  if (!data || (data.total === 0 && data.migrated === 0)) return null;

  async function run(method: "POST" | "DELETE") {
    const msg = method === "POST"
      ? `Перенести ${data!.total} лідів зі старих стадій на нові?`
      : "Повернути старі стадії? Відкотяться лише ліди, які після перенесення ніхто не рухав.";
    if (!(await ask(msg))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/settings/migrate-legacy", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ history }) : undefined,
      });
      if (!res.ok) throw new Error();
      qc.setQueryData(["legacy-migration"], await res.json());
      onChanged();
    } catch {
      toastError("Не вдалося виконати, спробуй ще раз");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-start gap-2">
        <History size={15} className="text-[var(--accent)] mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Старі стадії</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Ліди, що лишилися на стадіях попередньої воронки. Зараз CRM лише показує їх на нових стадіях —
            кнопка нижче перенесе їх по-справжньому. Стара стадія запамʼятовується, тож можна відкотити.
          </p>
        </div>
      </div>
      {data.total > 0 && (
        <div className="p-3 space-y-1">
          {data.rows.map((r) => (
            <div key={r.from} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-[var(--surface-2)]/50">
              <span className="flex-1 min-w-0 truncate text-[var(--text-muted)]">{r.label}</span>
              <ArrowRight size={13} className="text-[var(--text-dim)] shrink-0" />
              <span className="flex-1 min-w-0 truncate text-[var(--text)]">
                {stageLabel(r.status)}{LEGACY_MIGRATION[r.from]?.reason ? ` · ${r.label.replace(/^Програш — /, "")}` : ""}
              </span>
              <span className="hidden sm:block w-48 shrink-0 truncate text-[11px] text-[var(--text-dim)]">
                {r.task && r.tasks > 0 ? `+ справа «${r.task.title}» (${r.tasks})` : r.note ? `+ коментар «${r.note}»` : ""}
              </span>
              <span className="w-10 text-right text-xs font-semibold text-[var(--accent)] shrink-0">{r.count}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-[var(--border)]">
        {data.total > 0 && (
          <>
            <Toggle on={history} onChange={setHistory} label="Записати в історію кожного ліда" />
            <button
              onClick={() => run("POST")}
              disabled={busy}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-black cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {busy ? "Переношу…" : `Перенести ${data.total} лідів`}
            </button>
          </>
        )}
        {data.migrated > 0 && (
          <button
            onClick={() => run("DELETE")}
            disabled={busy}
            className={`${data.total > 0 ? "" : "ml-auto"} flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50`}
          >
            <RotateCcw size={12} /> Відкотити перенесення ({data.migrated})
          </button>
        )}
      </div>
    </section>
  );
}

// ── Leads whose stage is not in the funnel (deleted stage, very old code) ──

function UnknownStagesSection({
  funnelId, unknown, targets, onMoved,
}: {
  funnelId: string;
  unknown: Record<string, number>;
  targets: Stage[];
  onMoved: () => void;
}) {
  const [target, setTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const entries = Object.entries(unknown);
  if (!entries.length) return null;

  async function move(from: string) {
    const to = target[from] ?? targets[0]?.id;
    if (!to) return;
    setBusy(from);
    try {
      const res = await fetch("/api/settings/move-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelId, from, to }),
      });
      if (!res.ok) throw new Error();
      onMoved();
    } catch {
      toastError("Не вдалося перенести");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={card} style={{ borderColor: "rgba(251,146,60,0.35)" }}>
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-start gap-2">
        <AlertTriangle size={15} className="text-orange-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Ліди без стадії у цій воронці</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Їхньої стадії немає у воронці (видалена або дуже старий код). Вибери, куди перенести.</p>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        {entries.map(([code, count]) => (
          <div key={code} className="flex flex-wrap items-center gap-2 px-2 py-1">
            <code className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">{code}</code>
            <span className="text-xs text-[var(--text-dim)]">{count} лід(ів)</span>
            <ArrowRight size={13} className="text-[var(--text-dim)]" />
            <select
              value={target[code] ?? targets[0]?.id ?? ""}
              onChange={(e) => setTarget({ ...target, [code]: e.target.value })}
              className={`${input} !w-auto cursor-pointer`}
            >
              {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button
              onClick={() => move(code)}
              disabled={busy === code}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {busy === code ? "Переношу…" : "Перенести"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Card fields of a funnel ──

// Comma-separated options; kept as local text while typing, committed on blur.
function OptionsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      value={text ?? value.join(", ")}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setText(value.join(", "))}
      onBlur={() => {
        if (text !== null) onChange(text.split(",").map((x) => x.trim()).filter(Boolean));
        setText(null);
      }}
      placeholder="Варіанти через кому: Так, Ні, Можливо"
      className={input}
    />
  );
}

function FieldsEditor({ funnel, onChange }: { funnel: Funnel; onChange: (f: Funnel) => void }) {
  const { sections, items } = funnel.fields;
  const set = (next: Partial<Funnel["fields"]>) => onChange({ ...funnel, fields: { ...funnel.fields, ...next } });
  const updateItem = (f: CardField) => set({ items: items.map((x) => (x.id === f.id ? f : x)) });
  const removed = BUILTIN_FIELDS.filter((b) => !items.some((i) => i.builtin && i.id === b.key));

  function addField(section: string) {
    set({ items: [...items, { id: newId("cf"), builtin: false, label: "", type: "text", section, options: [] }] });
  }
  function moveItem(f: CardField, dir: -1 | 1) {
    const same = items.filter((x) => x.section === f.section);
    const other = same[same.findIndex((x) => x.id === f.id) + dir];
    if (!other) return;
    const arr = [...items];
    const a = arr.findIndex((x) => x.id === f.id);
    const b = arr.findIndex((x) => x.id === other.id);
    [arr[a], arr[b]] = [arr[b], arr[a]];
    set({ items: arr });
  }
  async function deleteItem(f: CardField) {
    if (!f.builtin && f.label && !(await ask((`Видалити поле «${f.label}»? Заповнені значення в лідах сховаються.`)))) return;
    set({ items: items.filter((x) => x.id !== f.id) });
  }
  function restore(key: string) {
    const b = BUILTIN_FIELDS.find((x) => x.key === key)!;
    const section = sections.some((x) => x.id === b.section) ? b.section : CONTACT_SECTION;
    set({ items: [...items, { id: b.key, builtin: true, label: b.label, section, type: "text", options: [] }] });
  }
  function moveSection(i: number, dir: -1 | 1) {
    const arr = [...sections];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set({ sections: arr });
  }
  async function deleteSection(i: number) {
    const sec = sections[i];
    const own = items.filter((x) => x.section === sec.id);
    const target = sections[i - 1] ?? sections.find((x) => x.id !== sec.id)!;
    if (own.length && !(await ask(`Видалити блок «${sec.label}»? Його поля (${own.length}) перейдуть у блок «${target.label}».`))) return;
    set({
      sections: sections.filter((x) => x.id !== sec.id),
      items: items.map((x) => (x.section === sec.id ? { ...x, section: target.id } : x)),
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)] px-1">
        Як виглядає картка ліда в цій воронці. Назви блоків і полів можна змінювати прямо тут, поля — переставляти,
        переносити між блоками й видаляти. Видалене стандартне поле можна повернути внизу (дані ліда не зникають).
        Телефон показується завжди.
      </p>

      {sections.map((sec, si) => {
        const own = items.filter((f) => f.section === sec.id);
        return (
          <section key={sec.id} className={card}>
            <div className="px-2 py-2 border-b border-[var(--border)] flex items-center gap-1.5">
              <div className="flex flex-col">
                <button className={`${iconBtn} !p-0.5`} disabled={si === 0} onClick={() => moveSection(si, -1)} aria-label="Блок вище"><ChevronUp size={13} /></button>
                <button className={`${iconBtn} !p-0.5`} disabled={si === sections.length - 1} onClick={() => moveSection(si, 1)} aria-label="Блок нижче"><ChevronDown size={13} /></button>
              </div>
              <input
                value={sec.label}
                onChange={(e) => set({ sections: sections.map((x) => (x.id === sec.id ? { ...x, label: e.target.value } : x)) })}
                placeholder="Назва блоку"
                autoFocus={!sec.label}
                className="flex-1 min-w-0 px-2 py-1 rounded-md bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] focus:text-[var(--text)] focus:outline-none transition-colors"
                title="Натисни, щоб перейменувати блок"
              />
              <span className="text-[10px] text-[var(--text-dim)] shrink-0">{own.length + (sec.id === CONTACT_SECTION ? 1 : 0)} полів</span>
              <button
                className={`${iconBtn} hover:!text-red-400`}
                disabled={sec.id === CONTACT_SECTION}
                onClick={() => deleteSection(si)}
                title={sec.id === CONTACT_SECTION ? "Блок «Контакт» не можна видалити — у ньому телефон" : "Видалити блок"}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="p-2 space-y-1">
              {sec.id === CONTACT_SECTION && (
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--text-dim)]">
                  <span className="w-[18px]" />
                  <span className="flex-1">Телефон</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)]">завжди</span>
                </div>
              )}
              {own.map((f, i) => (
                <div key={f.id} className="px-1 py-1 rounded-lg hover:bg-[var(--surface-2)]/40 space-y-1.5">
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                    <div className="flex flex-col">
                      <button className={`${iconBtn} !p-0.5`} disabled={i === 0} onClick={() => moveItem(f, -1)} aria-label="Вище"><ChevronUp size={13} /></button>
                      <button className={`${iconBtn} !p-0.5`} disabled={i === own.length - 1} onClick={() => moveItem(f, 1)} aria-label="Нижче"><ChevronDown size={13} /></button>
                    </div>
                    <input
                      value={f.label}
                      onChange={(e) => updateItem({ ...f, label: e.target.value })}
                      placeholder="Назва поля"
                      autoFocus={!f.label}
                      className={`${input} flex-1 min-w-[140px]`}
                    />
                    {f.builtin ? (
                      <span
                        className="px-2 py-1.5 rounded-lg text-[11px] text-[var(--text-dim)] bg-[var(--surface-2)] shrink-0"
                        title={`Стандартне поле: «${BUILTIN_FIELDS.find((b) => b.key === f.id)?.label}»`}
                      >
                        стандартне
                      </span>
                    ) : (
                      <select
                        value={f.type}
                        onChange={(e) => updateItem({ ...f, type: e.target.value as CardField["type"] })}
                        className={`${input} !w-auto cursor-pointer`}
                        title="Тип поля"
                      >
                        {CUSTOM_FIELD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                    )}
                    <select
                      value={f.section}
                      onChange={(e) => updateItem({ ...f, section: e.target.value })}
                      className={`${input} !w-auto max-w-[150px] cursor-pointer`}
                      title="Перенести в інший блок"
                    >
                      {sections.map((x) => <option key={x.id} value={x.id}>{x.label || "Без назви"}</option>)}
                    </select>
                    <button className={`${iconBtn} hover:!text-red-400`} onClick={() => deleteItem(f)} title="Видалити поле з картки">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {!f.builtin && (f.type === "select" || f.type === "multi") && (
                    <div className="pl-6"><OptionsInput value={f.options} onChange={(options) => updateItem({ ...f, options })} /></div>
                  )}
                </div>
              ))}
              <button
                onClick={() => addField(sec.id)}
                className="ml-2 mt-1 mb-1 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <Plus size={13} /> Додати поле
              </button>
            </div>
          </section>
        );
      })}

      <button
        onClick={() => set({ sections: [...sections, { id: newId("sec"), label: "" }] })}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
      >
        <Plus size={14} /> Новий блок
      </button>

      {removed.length > 0 && (
        <section className={`${card} p-3`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] mb-2">Видалені стандартні поля — натисни, щоб повернути</div>
          <div className="flex flex-wrap gap-1.5">
            {removed.map((b) => (
              <button
                key={b.key}
                onClick={() => restore(b.key)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              >
                <RotateCcw size={11} /> {b.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Business processes («Передача у воронку») ──

function ruleKey(r: FieldRule): string {
  return r.mode === "copy" ? `copy:${r.from}` : r.mode;
}

function ProcessCard({
  p, source, funnels, onChange, onDelete,
}: {
  p: TransferProcess;
  source: Funnel;
  funnels: Funnel[];
  onChange: (p: TransferProcess) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(!p.name || Object.keys(p.fields).length === 0);
  const target = funnels.find((f) => f.id === p.toFunnelId) ?? funnels.find((f) => f.id !== source.id)!;
  const toStage = target.stages.find((s) => s.id === p.toStageId);
  const sourceFields = source.fields.items;
  const sectionLabel = (f: Funnel, id: string) => f.fields.sections.find((x) => x.id === id)?.label ?? "";

  function setRule(fieldId: string, rule: FieldRule) {
    onChange({ ...p, fields: { ...p.fields, [fieldId]: rule } });
  }

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
        <Workflow size={15} className="text-[var(--accent)] shrink-0" />
        <input
          value={p.name}
          onChange={(e) => onChange({ ...p, name: e.target.value })}
          placeholder="Назва бізнес-процесу"
          className={`${input} flex-1 min-w-[180px] font-medium`}
        />
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {source.name} <ArrowRight size={12} /> <b className="text-[var(--text)]">{target.name}</b>
          {toStage && <span style={{ color: toStage.color }}>· {toStage.label}</span>}
        </span>
        <button onClick={() => setOpen(!open)} className={iconBtn} title={open ? "Згорнути" : "Налаштувати"}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={async () => { if (await ask(`Видалити бізнес-процес «${p.name}»?`)) onDelete(); }}
          className={`${iconBtn} hover:!text-red-400`}
          title="Видалити"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div className="p-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--text-dim)]">Передати у воронку</span>
              <select
                value={target.id}
                onChange={(e) => {
                  const to = funnels.find((f) => f.id === e.target.value)!;
                  onChange({ ...p, toFunnelId: to.id, toStageId: to.stages.find((s) => s.kind === "active")!.id, fields: {} });
                }}
                className={`${input} cursor-pointer`}
              >
                {/* the same funnel too — e.g. «Клієнт звернувся ще раз»: a new deal for the same client */}
                {funnels.map((f) => <option key={f.id} value={f.id}>{f.id === source.id ? `${f.name} (ця ж воронка — нова угода)` : f.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--text-dim)]">На стадію</span>
              <select value={p.toStageId} onChange={(e) => onChange({ ...p, toStageId: e.target.value })} className={`${input} cursor-pointer`}>
                {target.stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--text-dim)]">Оригінал у «{source.name}»</span>
              <select
                value={p.sourceStageId ?? ""}
                onChange={(e) => onChange({ ...p, sourceStageId: e.target.value || null })}
                className={`${input} cursor-pointer`}
              >
                <option value="">Лишити на своїй стадії</option>
                {source.stages.map((s) => <option key={s.id} value={s.id}>Перевести на «{s.label}»</option>)}
              </select>
            </label>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <h3 className="text-xs font-semibold text-[var(--text)]">Як заповнити поля нової угоди</h3>
              <span className="text-[10px] text-[var(--text-dim)]">Імʼя і телефон копіюються завжди</span>
            </div>
            <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {target.fields.items.map((f) => {
                const rule = fieldRule(p, f, source);
                const canValue = !f.builtin || SIMPLE_BUILTINS.has(f.id);
                const opts = !f.builtin && (f.type === "select" || f.type === "multi") ? f.options : null;
                return (
                  <div key={f.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-2.5 py-1.5">
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm text-[var(--text)]">{f.label}</div>
                      <div className="text-[10px] text-[var(--text-dim)]">{sectionLabel(target, f.section)}{f.builtin ? " · стандартне" : ""}</div>
                    </div>
                    <select
                      value={ruleKey(rule)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRule(f.id, v === "skip" ? { mode: "skip" } : v === "value" ? { mode: "value", value: "" } : { mode: "copy", from: v.slice(5) });
                      }}
                      className={`${input} sm:!w-56 cursor-pointer`}
                    >
                      {f.builtin ? (
                        <option value={`copy:${f.id}`}>Скопіювати з ліда</option>
                      ) : (
                        <optgroup label="Скопіювати з поля">
                          {sourceFields.map((s) => <option key={s.id} value={`copy:${s.id}`}>{s.label}</option>)}
                        </optgroup>
                      )}
                      {canValue && <option value="value">Фіксоване значення…</option>}
                      <option value="skip">Не заповнювати</option>
                    </select>
                    {rule.mode === "value" && (
                      opts ? (
                        <select value={rule.value} onChange={(e) => setRule(f.id, { mode: "value", value: e.target.value })} className={`${input} sm:!w-44 cursor-pointer`}>
                          <option value="">—</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          value={rule.value}
                          onChange={(e) => setRule(f.id, { mode: "value", value: e.target.value })}
                          placeholder={!f.builtin && f.type === "bool" ? "Так" : "Значення"}
                          className={`${input} sm:!w-44`}
                        />
                      )
                    )}
                  </div>
                );
              })}
              {!target.fields.items.length && <div className="px-3 py-2 text-xs text-[var(--text-dim)]">У воронці «{target.name}» немає полів картки</div>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ProcessesEditor({ draft, funnel, onChange }: { draft: CrmSettings; funnel: Funnel; onChange: (p: TransferProcess[]) => void }) {
  const mine = draft.processes.filter((p) => p.fromFunnelId === funnel.id);
  const others = draft.funnels.filter((f) => f.id !== funnel.id);
  const replace = (next: TransferProcess) => onChange(draft.processes.map((x) => (x.id === next.id ? next : x)));

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)] px-1">
        Бізнес-процес «Передача у воронку» створює <b className="text-[var(--text)]">копію угоди</b> в іншій воронці. Оригінал лишається
        у «{funnel.name}», а обидві картки посилаються одна на одну. Запускається з картки ліда → «Передати».
      </p>
      {!others.length ? (
        <div className={`${card} p-4 text-sm text-[var(--text-muted)]`}>Спочатку створи ще одну воронку — передавати поки нікуди.</div>
      ) : (
        <>
          {mine.map((p) => (
            <ProcessCard
              key={p.id}
              p={p}
              source={funnel}
              funnels={draft.funnels}
              onChange={replace}
              onDelete={() => onChange(draft.processes.filter((x) => x.id !== p.id))}
            />
          ))}
          <button
            onClick={() => onChange([...draft.processes, newProcess(funnel, others[0])])}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            <Plus size={14} /> Новий бізнес-процес з «{funnel.name}»
          </button>
        </>
      )}
    </div>
  );
}

// ── Page ──

// ── Tasks: responsible people + automatic tasks per stage ──

function WhenEditor({ when, onChange, first }: { when: AutoWhen; onChange: (w: AutoWhen) => void; first: boolean }) {
  const small = "px-2 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)]";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={when.mode}
        onChange={(e) => {
          const m = e.target.value as AutoWhen["mode"];
          onChange(m === "hours" ? { mode: "hours", hours: 3 } : { mode: m, days: 1, time: "13:00" });
        }}
        className={`${small} cursor-pointer`}
      >
        <option value="hours">через … годин</option>
        <option value="workdays">через … робочих днів о …</option>
        <option value="meeting">на «Дату і час КП»</option>
      </select>
      {when.mode === "hours" ? (
        <>
          <input type="number" min={0} step={0.5} value={when.hours}
            onChange={(e) => onChange({ mode: "hours", hours: Math.max(0, parseFloat(e.target.value) || 0) })}
            className={`${small} w-20`} />
          <span className="text-xs text-[var(--text-dim)]">год {first ? "після переходу на стадію" : "після попередньої"}</span>
        </>
      ) : (
        <>
          {when.mode === "meeting" && <span className="text-xs text-[var(--text-dim)]">якщо дата не вказана —</span>}
          <input type="number" min={0} step={1} value={when.days}
            onChange={(e) => onChange({ ...when, days: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) })}
            className={`${small} w-16`} />
          <span className="text-xs text-[var(--text-dim)]">роб. дн. о</span>
          <input type="time" value={when.time} onChange={(e) => onChange({ ...when, time: e.target.value || "13:00" })} className={small} />
        </>
      )}
    </div>
  );
}

// who can get a task + the business processes of the funnel — for the step editor
const StepCtx = createContext<{ people: string[]; processes: TransferProcess[] }>({ people: [], processes: [] });

function StepEditor({
  step, index, first, onChange, onDelete, askable,
}: { step: AutoStep; index?: number; first: boolean; onChange: (s: AutoStep) => void; onDelete?: () => void; askable?: boolean }) {
  const { people, processes } = useContext(StepCtx);
  return (
    <div className="space-y-1.5">
    <div className="flex flex-col lg:flex-row lg:items-center gap-1.5 px-2 py-2 rounded-lg bg-[var(--surface-2)]/40 border border-white/[0.04]">
      {index !== undefined && <span className="w-5 text-xs text-[var(--text-dim)] shrink-0">{index + 1}.</span>}
      <input value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })} className={`${input} lg:max-w-[260px]`} placeholder="Назва справи" />
      <select value={step.priority} onChange={(e) => onChange({ ...step, priority: e.target.value as TaskPriority })}
        className={`${input} !w-auto cursor-pointer`} style={{ color: PRIORITY_META[step.priority]?.color }}>
        {TASK_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <WhenEditor when={step.when} first={first} onChange={(when) => onChange({ ...step, when })} />
      {askable && (
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer whitespace-nowrap" title="Після цієї задачі показати питання правила">
          <input type="checkbox" checked={step.ask} onChange={(e) => onChange({ ...step, ask: e.target.checked })} className="accent-[var(--accent)] cursor-pointer" />
          питати
        </label>
      )}
      <select value={step.assignee ?? ""} onChange={(e) => onChange({ ...step, assignee: e.target.value || undefined })}
        className={`${input} !w-auto cursor-pointer`} title="Відповідальний за цю справу">
        <option value="">Відповідальний: як завжди</option>
        {people.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {onDelete && (
        <button onClick={onDelete} className={`${iconBtn} lg:ml-auto`} title="Прибрати крок"><Trash2 size={13} /></button>
      )}
    </div>
    {index !== undefined && processes.length > 0 && (
      <div className="flex flex-col lg:flex-row lg:items-center gap-1.5 pl-2 lg:pl-7">
        <select value={step.process ?? ""} onChange={(e) => onChange({ ...step, process: e.target.value || undefined, ...(e.target.value ? {} : { processAsk: undefined }) })}
          className={`${input} !w-auto cursor-pointer`} title="Коли справу виконано — запустити бізнес-процес">
          <option value="">Після виконання: нічого не передавати</option>
          {processes.map((p) => <option key={p.id} value={p.id}>Після виконання → {p.name}</option>)}
        </select>
        {step.process && (
          <input value={step.processAsk ?? ""} onChange={(e) => onChange({ ...step, processAsk: e.target.value || undefined })}
            className={`${input} lg:max-w-[420px]`} placeholder="Спитати перед передачею (порожньо — передати одразу)" />
        )}
      </div>
    )}
    </div>
  );
}

function RuleCard({
  rule, funnel, onChange, onDelete,
}: { rule: AutoRule; funnel: Funnel; onChange: (r: AutoRule) => void; onDelete: () => void }) {
  const stages = funnel.stages.filter((s) => s.kind !== "loss"); // working stages + win («завершити роботу»)
  const lbl = "text-[11px] text-[var(--text-muted)]";
  return (
    <div className={`rounded-lg border ${rule.enabled ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-60"} p-3 space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle on={rule.enabled} onChange={(enabled) => onChange({ ...rule, enabled })} label={rule.enabled ? "Увімкнено" : "Вимкнено"} />
        <select
          value={rule.funnelId === "*" ? "*" : "one"}
          onChange={(e) => onChange({ ...rule, funnelId: e.target.value === "*" ? "*" : funnel.id })}
          className={`${input} !w-auto cursor-pointer`}
        >
          <option value="one">Тільки у воронці «{funnel.name}»</option>
          <option value="*">У всіх воронках (стадія з такою ж назвою)</option>
        </select>
        <button onClick={onDelete} className={`${iconBtn} ml-auto`} title="Видалити правило"><Trash2 size={14} /></button>
      </div>

      <div className="space-y-1.5">
        <div className={lbl}>Створити справи (кожна наступна рахується від попередньої, вихідні пропускаються):</div>
        {rule.steps.map((st, i) => (
          <StepEditor
            key={st.id}
            step={st}
            index={i}
            first={i === 0}
            onChange={(next) => onChange({ ...rule, steps: rule.steps.map((x) => (x.id === st.id ? next : x)) })}
            onDelete={rule.steps.length > 1 ? () => onChange({ ...rule, steps: rule.steps.filter((x) => x.id !== st.id) }) : undefined}
            askable={!!rule.question.trim()}
          />
        ))}
        <button onClick={() => onChange({ ...rule, steps: [...rule.steps, newStep()] })}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer px-1">
          <Plus size={12} /> Додати крок
        </button>
      </div>

      <div className="space-y-2 pt-1 border-t border-white/[0.05]">
        <div className={`${lbl} pt-2`}>Коли справу позначили виконаною — запитати:</div>
        <input value={rule.question} onChange={(e) => onChange({ ...rule, question: e.target.value })} className={input}
          placeholder="Напр. «Клієнт оплатив?» (порожньо — нічого не питати)" />
        <Toggle
          on={rule.offerNext}
          onChange={(offerNext) => onChange({ ...rule, offerNext })}
          label={rule.question.trim() ? "На «Так» пропонувати наступну стадію" : "Коли всі задачі стадії виконано — запропонувати перекинути на наступну стадію"}
        />
        {!rule.question.trim() && rule.offerNext && (
          <label className="flex flex-wrap items-center gap-2">
            <span className={lbl}>Наступна стадія:</span>
            <select value={rule.yesStageId} onChange={(e) => onChange({ ...rule, yesStageId: e.target.value })} className={`${input} !w-auto cursor-pointer`}>
              <option value="">Наступна по воронці</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        )}
        {rule.question.trim() && (
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={lbl}>Текст кнопки «Так»</span>
              <input value={rule.yesLabel} onChange={(e) => onChange({ ...rule, yesLabel: e.target.value })} className={input} placeholder="Так" />
            </label>
            <label className="space-y-1">
              <span className={lbl}>Текст кнопки «Ні»</span>
              <input value={rule.noLabel} onChange={(e) => onChange({ ...rule, noLabel: e.target.value })} className={input} placeholder="Ні" />
            </label>
            <label className="space-y-1">
              <span className={lbl}>«Так» → запропонувати стадію</span>
              <select value={rule.yesStageId} onChange={(e) => onChange({ ...rule, yesStageId: e.target.value })} className={`${input} cursor-pointer`}>
                <option value="">{rule.offerNext ? "Наступна по воронці" : "Вибрати вручну"}</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className={lbl}>«Ні», а запланованих кроків більше немає →</span>
              <select value={rule.onNo} onChange={(e) => onChange({ ...rule, onNo: e.target.value as AutoNo })} className={`${input} cursor-pointer`}>
                <option value="nothing">Нічого не робити</option>
                <option value="repeat">Створити ще одну справу</option>
                <option value="loss">Справа «перекинути в програш»</option>
              </select>
            </label>
          </div>
        )}
        {rule.question.trim() && rule.onNo !== "nothing" && (
          <div className="space-y-1.5">
            <div className={lbl}>{rule.onNo === "repeat" ? "Яку справу створити (рахується від моменту відповіді; «{n}» у назві = номер кола):" : "Справа перед програшем (після неї CRM запропонує перевести лід у програш):"}</div>
            <StepEditor step={rule.repeat} first={false} onChange={(repeat) => onChange({ ...rule, repeat })} />
            {rule.onNo === "loss" && (
              <label className="flex flex-wrap items-center gap-2">
                <span className={lbl}>Причина програшу:</span>
                <select value={rule.lossReason} onChange={(e) => onChange({ ...rule, lossReason: e.target.value })} className={`${input} !w-auto cursor-pointer`}>
                  <option value="">— вибрати при закритті —</option>
                  {funnel.loss.reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <Toggle on={rule.calendar} onChange={(calendar) => onChange({ ...rule, calendar })} label="Кнопка «Додати в календар» у цих справах" />
      </div>
    </div>
  );
}

const TPL_COLORS = ["#22c55e", "#38bdf8", "#a78bfa", "#c084fc", "#eab308", "#f97316", "#818cf8", "#ef4444", "#2dd4bf", "#f472b6", "#C98C0A", "#94a3b8"];

// quick buttons of the «Нова справа» popup: label, task title, icon, colour, priority; order by arrows
function TaskTemplatesEditor({ list, onChange }: { list: TaskTemplate[]; onChange: (l: TaskTemplate[]) => void }) {
  const [iconFor, setIconFor] = useState<string | null>(null);
  const upd = (id: string, p: Partial<TaskTemplate>) => onChange(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return; const a = [...list]; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  const add = () => onChange([...list, { id: `tt_${Math.random().toString(36).slice(2, 8)}`, label: "Нова кнопка", title: "Нова справа", icon: "check", color: TPL_COLORS[list.length % TPL_COLORS.length], priority: "MEDIUM" }]);
  return (
    <section className={`${card} p-3 sm:p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Кнопки «Нова справа»</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Шаблони зверху попапу справи. Натиск підставляє назву справи і пріоритет. «Своя справа» є завжди.</p>
        </div>
        <button onClick={() => onChange(defaultTaskTemplates())} className="shrink-0 flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer"><RotateCcw size={11} /> Стандартні</button>
      </div>
      <div className="space-y-1.5">
        {list.map((t, i) => {
          const Icon = (TASK_ICONS[t.icon] ?? TASK_ICONS.check).icon;
          return (
            <div key={t.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 p-2 space-y-2">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <button onClick={() => setIconFor(iconFor === t.id ? null : t.id)} title="Іконка і колір"
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 cursor-pointer" style={{ background: `${t.color}22`, color: t.color, boxShadow: iconFor === t.id ? `inset 0 0 0 1px ${t.color}` : undefined }}>
                  <Icon size={16} />
                </button>
                <input value={t.label} onChange={(e) => upd(t.id, { label: e.target.value })} placeholder="Текст кнопки" className={`${input} sm:!w-44`} />
                <input value={t.title} onChange={(e) => upd(t.id, { title: e.target.value })} placeholder="Назва справи" className={`${input} flex-1 min-w-[140px]`} />
                <select value={t.priority} onChange={(e) => upd(t.id, { priority: e.target.value as TaskPriority })} className={`${input} !w-auto cursor-pointer`} style={{ color: PRIORITY_META[t.priority]?.color }}>
                  {TASK_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <div className="flex items-center">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} title="Вище"><ChevronUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className={iconBtn} title="Нижче"><ChevronDown size={14} /></button>
                  <button onClick={() => onChange(list.filter((x) => x.id !== t.id))} className={`${iconBtn} hover:!text-red-400`} title="Видалити"><Trash2 size={14} /></button>
                </div>
              </div>
              {iconFor === t.id && (
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                  {Object.entries(TASK_ICONS).map(([k, v]) => {
                    const I = v.icon;
                    return (
                      <button key={k} onClick={() => upd(t.id, { icon: k })} title={v.label}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border cursor-pointer"
                        style={t.icon === k ? { borderColor: t.color, color: t.color, background: `${t.color}1a` } : { borderColor: "var(--border)", color: "var(--text-muted)" }}><I size={14} /></button>
                    );
                  })}
                  <span className="w-px h-6 bg-[var(--border)] mx-1" />
                  {TPL_COLORS.map((c) => (
                    <button key={c} onClick={() => upd(t.id, { color: c })} className="w-6 h-6 rounded-full cursor-pointer" title={c}
                      style={{ background: c, boxShadow: t.color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : undefined }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={add} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"><Plus size={12} /> Додати кнопку</button>
    </section>
  );
}

function TasksEditor({ draft, funnel, onChange }: { draft: CrmSettings; funnel: Funnel; onChange: (t: TaskSettings) => void }) {
  const t = draft.tasks;
  const [name, setName] = useState("");
  const setRules = (rules: AutoRule[]) => onChange({ ...t, rules });
  const replace = (r: AutoRule) => setRules(t.rules.map((x) => (x.id === r.id ? r : x)));
  const stages = funnel.stages.filter((s) => s.kind === "active");

  function addPerson() {
    const n = name.trim();
    if (!n || t.assignees.includes(n)) return;
    onChange({ ...t, assignees: [...t.assignees, n], defaultAssignee: t.defaultAssignee || n });
    setName("");
  }

  return (
    <div className="space-y-4">
      <TaskTemplatesEditor list={t.templates} onChange={(templates) => onChange({ ...t, templates })} />

      <section className={`${card} p-3 sm:p-4 space-y-3`}>
        <h2 className="text-sm font-semibold text-[var(--text)]">Відповідальні</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.assignees.map((p) => (
            <span key={p} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
              {p}
              <button
                onClick={() => {
                  const assignees = t.assignees.filter((x) => x !== p);
                  onChange({ ...t, assignees, defaultAssignee: t.defaultAssignee === p ? assignees[0] ?? "" : t.defaultAssignee });
                }}
                className="p-0.5 rounded text-[var(--text-dim)] hover:text-red-400 cursor-pointer"
                title="Прибрати"
              ><XCircle size={13} /></button>
            </span>
          ))}
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }}
            placeholder="Імʼя" className={`${input} !w-40`} />
          <button onClick={addPerson} disabled={!name.trim()} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer disabled:opacity-40">
            <Plus size={12} /> Додати
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Автозадачі отримує:
            <select value={t.defaultAssignee} onChange={(e) => onChange({ ...t, defaultAssignee: e.target.value })} className={`${input} !w-auto cursor-pointer`}>
              <option value="">Нікого</option>
              {t.assignees.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Часовий пояс (для «о 13:00»):
            <select value={t.timezone} onChange={(e) => onChange({ ...t, timezone: e.target.value })} className={`${input} !w-auto cursor-pointer`}>
              {TIMEZONES.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-[var(--text-dim)]">Якщо в ліда вже були справи з відповідальним — автозадачі підуть тій самій людині.</p>
      </section>

      <section className={`${card} p-3 sm:p-4 space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Автозадачі по стадіях · «{funnel.name}»</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Коли лід потрапляє на стадію — CRM сама створює справи. Коли лід іде зі стадії, її невиконані автозадачі прибираються.
            </p>
          </div>
          <button
            onClick={async () => { if (await ask("Повернути стандартні автозадачі? Твої правила буде замінено.")) setRules(defaultRules()); }}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0"
          >
            <RotateCcw size={12} /> Стандартні
          </button>
        </div>
        {stages.map((st) => {
          const rules = t.rules.filter((r) => ruleStageIn(draft.funnels, r.funnelId, r.stageId, funnel)?.id === st.id);
          return (
            <div key={st.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ color: st.color, background: `${st.color}1a` }}>{st.label}</span>
                {!rules.length && <span className="text-[11px] text-[var(--text-dim)]">без автозадач</span>}
                <button onClick={() => setRules([...t.rules, newRule(funnel.id, st.id)])}
                  className="ml-auto flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer">
                  <Plus size={12} /> {rules.length ? "Ще правило" : "Додати автозадачі"}
                </button>
              </div>
              <StepCtx.Provider value={{ people: t.assignees, processes: draft.processes.filter((p) => p.fromFunnelId === funnel.id) }}>
                {rules.map((r) => (
                  <RuleCard key={r.id} rule={r} funnel={funnel} onChange={replace} onDelete={() => setRules(t.rules.filter((x) => x.id !== r.id))} />
                ))}
              </StepCtx.Provider>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ── Access: roles (pages + per-funnel permissions) and team members ──

interface TeamUser { id: string; email: string; name: string; roleId: string | null; active: boolean; createdAt: string }

const PERM_PRESETS: { key: string; label: string; perm: FunnelPerm }[] = [
  { key: "none", label: "Немає доступу", perm: NO_PERM },
  { key: "view", label: "Лише перегляд", perm: { view: true, create: false, edit: false, delete: false } },
  { key: "work", label: "Робота без видалення", perm: { view: true, create: true, edit: true, delete: false } },
  { key: "full", label: "Повний доступ", perm: FULL_PERM },
];

function RoleCard({ role, funnels, users, onChange, onDelete }: {
  role: Role; funnels: Funnel[]; users: number; onChange: (r: Role) => void; onDelete: () => void;
}) {
  const setPerm = (fid: string, perm: FunnelPerm) => {
    const next = { ...role.funnels };
    const p = normPerm(perm);
    if (p.view) next[fid] = p; else delete next[fid];
    onChange({ ...role, funnels: next });
  };
  return (
    <div className="rounded-xl border border-[var(--border)] p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2">
        <input value={role.name} onChange={(e) => onChange({ ...role, name: e.target.value })} className={`${input} sm:max-w-xs font-semibold`} placeholder="Назва ролі" />
        <span className="text-[11px] text-[var(--text-dim)] whitespace-nowrap">{users} корист.</span>
        <button onClick={onDelete} className={`${iconBtn} ml-auto`} title={users ? "Спершу зміни роль у користувачів" : "Видалити роль"} disabled={users > 0}><Trash2 size={14} /></button>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Що бачить</div>
        <div className="space-y-2">
          {PAGE_GROUPS.map((g) => {
            const all = g.pages.every((p) => role.pages.includes(p.key));
            const some = g.pages.some((p) => role.pages.includes(p.key));
            return (
              <div key={g.label} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
                <button type="button" title={all ? "Зняти всі" : "Вибрати всі"}
                  onClick={() => onChange({ ...role, pages: all ? role.pages.filter((x) => !g.pages.some((p) => p.key === x)) : [...new Set([...role.pages, ...g.pages.map((p) => p.key)])] })}
                  className={`sm:w-24 shrink-0 sm:pt-1.5 text-left text-xs font-semibold cursor-pointer hover:text-[var(--text)] ${some ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                  {g.label}
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {g.pages.map((p) => {
                    const on = role.pages.includes(p.key);
                    return (
                      <button key={p.key} type="button"
                        onClick={() => onChange({ ...role, pages: on ? role.pages.filter((x) => x !== p.key) : [...role.pages, p.key] })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${on ? "text-black border-[var(--accent)]" : "text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]"}`}
                        style={on ? { background: "var(--accent)" } : undefined}>
                        {on && <Check size={12} strokeWidth={3} />}{p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Сповіщення (дзвіночок)</div>
        <div className="flex flex-wrap gap-1.5">
          {NOTIFY.map((n) => {
            const on = role.notify.includes(n.key);
            return (
              <button key={n.key} type="button" title={n.hint}
                onClick={() => onChange({ ...role, notify: on ? role.notify.filter((x) => x !== n.key) : [...role.notify, n.key] })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${on ? "text-[#93c5fd] border-[#3b82f6]/60 bg-[#3b82f6]/15" : "text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]"}`}>
                {on && <Check size={12} strokeWidth={3} />}{n.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Воронки</div>
        <div className="rounded-lg border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] text-[var(--text-muted)]">
                <th className="text-left font-medium px-3 py-2">Воронка</th>
                {FUNNEL_ACTIONS.map((a) => <th key={a.key} className="font-medium px-2 py-2 text-center whitespace-nowrap">{a.label}</th>)}
                <th className="font-medium px-3 py-2 text-left">Швидко</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((f) => {
                const p = role.funnels[f.id] ?? NO_PERM;
                const preset = PERM_PRESETS.find((x) => FUNNEL_ACTIONS.every((a) => x.perm[a.key] === p[a.key]))?.key ?? "";
                return (
                  <tr key={f.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text)] whitespace-nowrap">{f.name}</td>
                    {FUNNEL_ACTIONS.map((a) => (
                      <td key={a.key} className="px-2 py-2 text-center">
                        <input type="checkbox" checked={p[a.key]} className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                          onChange={(e) => setPerm(f.id, a.key === "view" && !e.target.checked ? NO_PERM : { ...p, [a.key]: e.target.checked })} />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <select value={preset} onChange={(e) => { const x = PERM_PRESETS.find((y) => y.key === e.target.value); if (x) setPerm(f.id, x.perm); }}
                        className={`${input} !w-auto !py-1 text-xs cursor-pointer`}>
                        {!preset && <option value="">Своє</option>}
                        {PERM_PRESETS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--text-dim)] mt-1.5">Редагування = змінювати поля, стадії, справи й коментарі. Нова воронка за замовчуванням закрита для всіх ролей.</p>
      </div>
    </div>
  );
}

function UsersSection({ roles }: { roles: Role[] }) {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["team-users"],
    queryFn: async (): Promise<TeamUser[]> => { const r = await fetch("/api/users"); if (!r.ok) throw new Error(); return r.json(); },
  });
  const [form, setForm] = useState({ name: "", email: "", password: "", roleId: roles[0]?.id ?? "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["team-users"] });

  async function add() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Не вдалося додати"); return; }
      setForm({ name: "", email: "", password: "", roleId: form.roleId });
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function update(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) toastError((await res.json().catch(() => ({}))).error ?? "Не вдалося зберегти");
    refresh();
  }
  async function remove(u: TeamUser) {
    if (!(await ask(`Видалити користувача ${u.name}? Він більше не зможе увійти.`))) return;
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section className={`${card} p-3 sm:p-4 space-y-3`}>
      <div>
        <h2 className="text-sm font-semibold text-[var(--text)]">Користувачі</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">Кожен входить у CRM зі своїм email і паролем. Що він бачить — визначає роль. Зміни ролі діють одразу.</p>
      </div>
      <div className="space-y-1.5">
        {(users.data ?? []).map((u) => (
          <div key={u.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] ${u.active ? "" : "opacity-50"}`}>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-[var(--text)] truncate">{u.name}</div>
              <div className="text-[11px] text-[var(--text-dim)] truncate">{u.email}</div>
            </div>
            <select value={u.roleId ?? ""} onChange={(e) => update(u.id, { roleId: e.target.value })} className={`${input} !w-auto cursor-pointer`}>
              <option value="">Без ролі (нічого не бачить)</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Toggle on={u.active} onChange={(active) => update(u.id, { active })} label={u.active ? "Активний" : "Вимкнений"} />
            <button onClick={async () => { const p = await askText({ title: `Новий пароль для ${u.name}`, text: "Людина входитиме з цим паролем. Старий перестане працювати.", label: "Пароль", secret: true, min: 6, confirmLabel: "Змінити пароль" }); if (p) update(u.id, { password: p }); }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Змінити пароль</button>
            <button onClick={() => remove(u)} className={iconBtn} title="Видалити"><Trash2 size={13} /></button>
          </div>
        ))}
        {users.data && !users.data.length && <p className="text-sm text-[var(--text-dim)]">Поки що в CRM працюєш лише ти.</p>}
      </div>
      <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 pt-1">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Імʼя" className={input} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email" type="email" className={input} />
        <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Пароль (від 6 символів)" type="text" className={input} />
        <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className={`${input} cursor-pointer`}>
          <option value="">Без ролі</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button onClick={add} disabled={busy || !form.email || !form.password}
          className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-black cursor-pointer disabled:opacity-40" style={{ background: "var(--accent)" }}>
          <Plus size={13} /> Додати
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-[11px] text-[var(--text-dim)]">Роль спершу збережи кнопкою «Зберегти» внизу — тоді її можна видати користувачу.</p>
    </section>
  );
}

function AccessEditor({ draft, saved, onChange }: { draft: CrmSettings; saved: CrmSettings; onChange: (a: AccessSettings) => void }) {
  const roles = draft.access.roles;
  const users = useQuery({ queryKey: ["team-users"], queryFn: async (): Promise<TeamUser[]> => (await fetch("/api/users")).json() });
  const count = (id: string) => (users.data ?? []).filter((u) => u.roleId === id).length;
  const setRoles = (next: Role[]) => onChange({ ...draft.access, roles: next });
  return (
    <div className="space-y-4">
      <section className={`${card} p-3 sm:p-4 space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Ролі</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Роль = які вкладки видно і що можна робити в кожній воронці. Ти як власник завжди маєш повний доступ.</p>
          </div>
          <button onClick={() => setRoles([...roles, { id: newRoleId(), name: `Роль ${roles.length + 1}`, pages: ["crm", "tasks"], funnels: {}, notify: DEFAULT_NOTIFY }])}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer shrink-0">
            <Plus size={13} /> Нова роль
          </button>
        </div>
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} funnels={draft.funnels} users={count(r.id)}
            onChange={(next) => setRoles(roles.map((x) => (x.id === r.id ? next : x)))}
            onDelete={() => setRoles(roles.filter((x) => x.id !== r.id))} />
        ))}
        {!roles.length && <p className="text-sm text-[var(--text-dim)]">Ролей ще немає.</p>}
      </section>
      <UsersSection roles={saved.access.roles} />
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { settings, loaded, save, saving } = useCrmSettings();
  const [draft, setDraft] = useState<CrmSettings | null>(null);
  const [funnelId, setFunnelId] = useState<string>("");
  const [deleting, setDeleting] = useState<{ stage: Stage; count: number; target: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [tab, setTab] = useState<"stages" | "fields" | "close" | "processes" | "tasks" | "access">("stages");
  const { access: me } = useAccess();
  const [transfer, setTransfer] = useState<{ funnelId: string; status: string } | null>(null);

  const stats = useQuery({
    queryKey: ["crm-settings-stats"],
    queryFn: async (): Promise<Stats> => (await fetch("/api/settings/stats")).json(),
  });

  // Start editing from the saved settings once they are loaded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise local draft from loaded settings
    if (loaded && !draft) setDraft(clone(settings));
  }, [loaded, settings, draft]);

  if (!draft) {
    return <div className="p-6 text-sm text-[var(--text-muted)]">Завантаження…</div>;
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const funnel = draft.funnels.find((f) => f.id === funnelId) ?? draft.funnels[0];
  const fStats = stats.data?.[funnel.id];
  const active = funnel.stages.filter((s) => s.kind === "active");
  const win = funnel.stages.find((s) => s.kind === "win")!;
  const loss = funnel.stages.find((s) => s.kind === "loss")!;

  const problems: string[] = [];
  for (const f of draft.funnels) {
    if (!f.name.trim()) problems.push("У воронки немає назви");
    if (!f.stages.some((s) => s.kind === "active")) problems.push(`«${f.name}»: потрібна хоча б одна стадія`);
    if (f.stages.some((s) => !s.label.trim())) problems.push(`«${f.name}»: є стадія без назви`);
    if ([...f.win.reasons, ...f.loss.reasons].some((r) => !r.label.trim())) problems.push(`«${f.name}»: є порожня причина`);
    if (f.fields.items.some((x) => !x.label.trim())) problems.push(`«${f.name}»: є поле без назви`);
    if (f.fields.sections.some((x) => !x.label.trim())) problems.push(`«${f.name}»: є блок без назви`);
    if (f.fields.items.some((x) => !x.builtin && (x.type === "select" || x.type === "multi") && !x.options.length)) problems.push(`«${f.name}»: у списку немає варіантів`);
  }
  for (const p of draft.processes) {
    if (!p.name.trim()) problems.push("Є бізнес-процес без назви");
  }

  function updateFunnel(next: Funnel) {
    setDraft((d) => d && { ...d, funnels: d.funnels.map((f) => (f.id === next.id ? next : f)) });
  }
  function setActive(nextActive: Stage[]) {
    updateFunnel({ ...funnel, stages: [...nextActive, win, loss] });
  }
  function updateStage(next: Stage) {
    updateFunnel({ ...funnel, stages: funnel.stages.map((s) => (s.id === next.id ? next : s)) });
  }
  function move(i: number, dir: -1 | 1) {
    const arr = [...active];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setActive(arr);
  }
  function addStage() {
    setActive([...active, { id: newId("s"), label: "", color: STAGE_COLORS[active.length % STAGE_COLORS.length], kind: "active", isDeal: false, skip: false }]);
  }
  function requestDelete(stage: Stage) {
    const count = fStats?.stages[stage.id] ?? 0;
    if (count === 0) {
      setActive(active.filter((s) => s.id !== stage.id));
      return;
    }
    const target = active.find((s) => s.id !== stage.id)?.id ?? "";
    setDeleting({ stage, count, target });
  }

  // Stage has leads: move them on the server, then remove the stage and save right away.
  async function confirmDelete() {
    if (!deleting) return;
    setMoving(true);
    try {
      const res = await fetch("/api/settings/move-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelId: funnel.id, from: deleting.stage.id, to: deleting.target }),
      });
      if (!res.ok) throw new Error();
      const next: CrmSettings = {
        ...draft!,
        funnels: draft!.funnels.map((f) =>
          f.id === funnel.id ? { ...f, stages: f.stages.filter((s) => s.id !== deleting.stage.id) } : f),
      };
      setDraft(next);
      save(next);
      qc.invalidateQueries({ queryKey: ["crm-settings-stats"] });
      setDeleting(null);
    } catch {
      toastError("Не вдалося перенести ліди");
    } finally {
      setMoving(false);
    }
  }

  function addFunnel() {
    const f = newFunnel(`Воронка ${draft!.funnels.length + 1}`);
    setDraft({ ...draft!, funnels: [...draft!.funnels, f] });
    setFunnelId(f.id);
  }
  async function deleteFunnel() {
    if (!(await ask(`Видалити воронку «${funnel.name}»?`))) return;
    const funnels = draft!.funnels.filter((f) => f.id !== funnel.id);
    const processes = draft!.processes.filter((p) => p.fromFunnelId !== funnel.id && p.toFunnelId !== funnel.id);
    setDraft({ ...draft!, funnels, processes });
    setFunnelId(funnels[0].id);
  }

  const funnelLeads = fStats?.total ?? 0;
  const isFirst = draft.funnels[0].id === funnel.id;

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-5xl pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Налаштування CRM</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Воронки, стадії, поля картки, виграш/програш, бізнес-процеси, задачі, доступи</p>
        </div>
      </div>

      {/* Funnels */}
      <section className={`${card} p-3 sm:p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={15} className="text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text)]">Воронки</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {draft.funnels.map((f) => {
            const on = f.id === funnel.id;
            return (
              <button
                key={f.id}
                onClick={() => setFunnelId(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors cursor-pointer ${on ? "text-black font-semibold" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                style={on ? { background: "var(--accent)", borderColor: "var(--accent)" } : { background: "var(--surface-2)", borderColor: "var(--border)" }}
              >
                {f.name || "Без назви"}
                <span className={`ml-1.5 text-[10px] ${on ? "text-black/60" : "text-[var(--text-dim)]"}`}>{stats.data?.[f.id]?.total ?? 0}</span>
              </button>
            );
          })}
          <button
            onClick={addFunnel}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            <Plus size={14} /> Нова воронка
          </button>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            value={funnel.name}
            onChange={(e) => updateFunnel({ ...funnel, name: e.target.value })}
            className={`${input} sm:max-w-xs`}
            placeholder="Назва воронки"
          />
          <button
            onClick={deleteFunnel}
            disabled={draft.funnels.length === 1 || funnelLeads > 0 || isFirst}
            title={
              isFirst ? "Першу воронку не можна видалити: у неї потрапляють ліди без воронки"
                : funnelLeads > 0 ? `У воронці ${funnelLeads} лідів — спочатку перенеси їх` : "Видалити воронку"
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[var(--text-muted)] disabled:hover:border-[var(--border)]"
          >
            <Trash2 size={13} /> Видалити воронку
          </button>
          <div className="sm:ml-auto px-3 py-1.5 rounded-lg border border-[var(--border)]" title="Блок «Оплати» в картці угоди: графік платежів, «Внести оплату», оплачено / залишилось / наступний платіж">
            <Toggle on={funnel.payments} onChange={(payments) => updateFunnel({ ...funnel, payments })} label="Оплати в угодах" />
          </div>
          {/* bell: where new deals of this funnel show up */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border)]" title="Як нові угоди цієї воронки (і передані сюди) показуються в дзвіночку сповіщень">
            <Bell size={13} className="text-[var(--text-dim)] shrink-0" />
            {funnel.payments ? <span className="text-xs text-[var(--text-muted)] px-1 py-0.5">Сповіщення: вкладка «Проєкти»</span> : (
              <>
                <select value={funnel.notify.mode} onChange={(e) => updateFunnel({ ...funnel, notify: { ...funnel.notify, mode: e.target.value as "leads" | "tab" | "off", label: funnel.notify.label || funnel.name } })}
                  className="bg-transparent text-xs text-[var(--text)] outline-none cursor-pointer py-0.5">
                  <option value="tab">Сповіщення: окрема вкладка</option>
                  <option value="leads">Сповіщення: у вкладці «Ліди»</option>
                  <option value="off">Сповіщення: не показувати</option>
                </select>
                {funnel.notify.mode === "tab" && (
                  <input value={funnel.notify.label} onChange={(e) => updateFunnel({ ...funnel, notify: { ...funnel.notify, label: e.target.value } })}
                    placeholder="Назва вкладки" className="w-28 px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                )}
              </>
            )}
          </div>
          {draft.funnels.length > 1 && funnelLeads > 0 && (
            <button
              onClick={() => {
                const to = draft.funnels.find((f) => f.id !== funnel.id)!;
                setTransfer({ funnelId: to.id, status: to.stages[0].id });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            >
              <ArrowRightLeft size={13} /> Перенести всіх лідів ({funnelLeads})
            </button>
          )}
        </div>
      </section>

      {me?.owner && <SourceRename />}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto no-scrollbar">
        {([
          { key: "stages", label: "Стадії", icon: <Layers size={13} /> },
          { key: "fields", label: "Поля картки", icon: <ListPlus size={13} /> },
          { key: "close", label: "Виграш і програш", icon: <Flag size={13} /> },
          { key: "processes", label: "Бізнес-процеси", icon: <Workflow size={13} /> },
          { key: "tasks", label: "Задачі", icon: <ListChecks size={13} /> },
          // users & roles — only the owner
          ...(me?.owner ? [{ key: "access", label: "Доступи", icon: <KeyRound size={13} /> }] as const : []),
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${tab === t.key ? "border-[var(--accent)] text-[var(--text)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "fields" && <FieldsEditor funnel={funnel} onChange={updateFunnel} />}

      {tab === "access" && me?.owner && <AccessEditor draft={draft} saved={settings} onChange={(access) => setDraft((d) => d && { ...d, access })} />}

      {tab === "tasks" && <TasksEditor draft={draft} funnel={funnel} onChange={(tasks) => setDraft((d) => d && { ...d, tasks })} />}

      {tab === "processes" && (
        <ProcessesEditor draft={draft} funnel={funnel} onChange={(processes) => setDraft((d) => d && { ...d, processes })} />
      )}

      {tab === "stages" && (<>

      {/* Stages */}
      <section className={card}>
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">Стадії воронки «{funnel.name}»</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Порядок стадій = порядок у смужці та в канбані. Познач <span className="text-[var(--accent)]">«Угода»</span> —
            такі ліди показуються на вкладці «Угоди». Якщо лід перескакує вперед, він вважається таким, що пройшов усі
            проміжні <b className="text-[var(--text)]">«Етап»</b>-стадії; <span className="text-orange-400">«Обхід»</span> (як НДЗ) рахується,
            лише коли лід реально переведено на неї.
          </p>
        </div>
        <div className="p-2 space-y-1">
          {active.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 sm:gap-2 px-1.5 py-1 rounded-lg hover:bg-[var(--surface-2)]/50">
              <div className="flex flex-col">
                <button className={`${iconBtn} !p-0.5`} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Вище"><ChevronUp size={13} /></button>
                <button className={`${iconBtn} !p-0.5`} disabled={i === active.length - 1} onClick={() => move(i, 1)} aria-label="Нижче"><ChevronDown size={13} /></button>
              </div>
              <span className="w-5 text-[10px] text-[var(--text-dim)] text-right shrink-0">{i + 1}</span>
              <ColorPicker value={s.color} onChange={(color) => updateStage({ ...s, color })} />
              <input
                value={s.label}
                onChange={(e) => updateStage({ ...s, label: e.target.value })}
                className={input}
                placeholder="Назва стадії"
                autoFocus={!s.label}
              />
              <input
                value={s.hint ?? ""}
                onChange={(e) => updateStage({ ...s, hint: e.target.value })}
                className={`${input} hidden md:block text-[var(--text-muted)]`}
                placeholder="Що робимо на стадії (підказка)"
                title="Показується при наведенні на стадію в картці угоди"
              />
              <button
                type="button"
                onClick={() => updateStage({ ...s, isDeal: !s.isDeal })}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer shrink-0"
                style={s.isDeal
                  ? { color: s.color, borderColor: `${s.color}60`, background: `${s.color}18` }
                  : { color: "var(--text-dim)", borderColor: "var(--border)", background: "transparent" }}
                title="Чи вважається ця стадія угодою в роботі"
              >
                <Briefcase size={11} /> {s.isDeal ? "Угода" : "Лід"}
              </button>
              <button
                type="button"
                onClick={() => updateStage({ ...s, skip: !s.skip })}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer shrink-0"
                style={s.skip
                  ? { color: "#fb923c", borderColor: "rgba(251,146,60,0.45)", background: "rgba(251,146,60,0.12)" }
                  : { color: "var(--text-dim)", borderColor: "var(--border)", background: "transparent" }}
                title={s.skip
                  ? "Обхідна стадія (як НДЗ): рахується, лише коли лід реально переведено на неї. При стрибку через неї не зараховується."
                  : "Звичайна стадія: при стрибку вперед через неї лід вважається таким, що її пройшов. Натисни, щоб зробити обхідною (як НДЗ)."}
              >
                <CornerDownRight size={11} /> {s.skip ? "Обхід" : "Етап"}
              </button>
              <span className="w-8 text-[11px] text-[var(--text-dim)] text-right shrink-0" title="Лідів на стадії">
                {fStats?.stages[s.id] ?? 0}
              </span>
              <button
                className={`${iconBtn} hover:!text-red-400`}
                disabled={active.length === 1}
                onClick={() => requestDelete(s)}
                aria-label="Видалити стадію"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={addStage}
            className="ml-2 mt-1 mb-1 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <Plus size={13} /> Додати стадію
          </button>
        </div>
      </section>

      </>)}

      {/* Win / Loss */}
      {tab === "close" && (
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CloseBlock
          kind="win" stage={win} rules={funnel.win}
          onStage={updateStage} onRules={(r) => updateFunnel({ ...funnel, win: r })}
        />
        <CloseBlock
          kind="loss" stage={loss} rules={funnel.loss}
          onStage={updateStage} onRules={(r) => updateFunnel({ ...funnel, loss: r })}
        />
      </section>
      )}

      {tab === "stages" && (<>
      <UnknownStagesSection
        funnelId={funnel.id}
        unknown={fStats?.unknown ?? {}}
        targets={active}
        onMoved={() => qc.invalidateQueries({ queryKey: ["crm-settings-stats"] })}
      />

      {isFirst && (
        <LegacyStagesSection
          stageLabel={(id) => funnel.stages.find((s) => s.id === id)?.label ?? id}
          onChanged={() => qc.invalidateQueries({ queryKey: ["crm-settings-stats"] })}
        />
      )}

      {isFirst && (
        <button
          onClick={async () => {
            if (!(await ask("Повернути стандартні стадії та причини для цієї воронки? Назви й кольори скинуться."))) return;
            updateFunnel({ ...defaultFunnel(), id: funnel.id, name: funnel.name });
          }}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          <RotateCcw size={12} /> Скинути до стандартних
        </button>
      )}
      </>)}

      {/* Save bar */}
      {(dirty || saving) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[var(--border)] shadow-2xl max-w-[calc(100vw-32px)]"
          style={{ background: "rgba(14,14,14,0.97)", backdropFilter: "blur(20px)" }}>
          <span className="text-xs text-[var(--text-muted)] truncate">
            {problems.length ? <span className="text-red-400">{problems[0]}</span> : "Є незбережені зміни"}
          </span>
          <button
            onClick={() => setDraft(clone(settings))}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0"
          >
            Скасувати
          </button>
          <button
            onClick={() => save(draft)}
            disabled={saving || problems.length > 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-black cursor-pointer disabled:opacity-50 shrink-0"
            style={{ background: "var(--accent)" }}
          >
            <Save size={13} /> {saving ? "Зберігаю…" : "Зберегти"}
          </button>
        </div>
      )}

      {/* Move all leads of this funnel to another one */}
      <Modal open={!!transfer} onClose={() => setTransfer(null)} title="Перенести лідів у іншу воронку">
        {transfer && (() => {
          const to = settings.funnels.find((f) => f.id === transfer.funnelId);
          return (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                Усі <b className="text-[var(--text)]">{funnelLeads}</b> лідів воронки «{funnel.name}» перейдуть у вибрану воронку та стадію.
              </p>
              {!to && <p className="text-xs text-orange-400">Спочатку збережи нову воронку.</p>}
              <select
                value={transfer.funnelId}
                onChange={(e) => {
                  const f = draft.funnels.find((x) => x.id === e.target.value)!;
                  setTransfer({ funnelId: f.id, status: f.stages[0].id });
                }}
                className={`${input} cursor-pointer`}
              >
                {draft.funnels.filter((f) => f.id !== funnel.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select value={transfer.status} onChange={(e) => setTransfer({ ...transfer, status: e.target.value })} className={`${input} cursor-pointer`}>
                {(draft.funnels.find((f) => f.id === transfer.funnelId)?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTransfer(null)} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
                <button
                  disabled={moving || !to}
                  onClick={async () => {
                    setMoving(true);
                    try {
                      const res = await fetch("/api/leads/transfer", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fromFunnelId: funnel.id, funnelId: transfer.funnelId, status: transfer.status }),
                      });
                      if (!res.ok) throw new Error();
                      setTransfer(null);
                      qc.invalidateQueries({ queryKey: ["crm-settings-stats"] });
                      qc.invalidateQueries({ queryKey: ["leads"] });
                    } catch {
                      toastError("Не вдалося перенести");
                    } finally {
                      setMoving(false);
                    }
                  }}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg text-black cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {moving ? "Переношу…" : "Перенести"}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Delete stage that has leads */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Видалити стадію?">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              На стадії «{deleting.stage.label}» зараз <b className="text-[var(--text)]">{deleting.count}</b> лідів.
              Куди їх перенести?
            </p>
            <select
              value={deleting.target}
              onChange={(e) => setDeleting({ ...deleting, target: e.target.value })}
              className={`${input} cursor-pointer`}
            >
              {active.filter((s) => s.id !== deleting.stage.id).map((s) => (
                <option key={s.id} value={s.id}>{s.label || "Без назви"}</option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--text-dim)]">
              Ліди перенесуться одразу, а налаштування збережуться разом з іншими змінами.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                Скасувати
              </button>
              <button
                onClick={confirmDelete}
                disabled={moving || !deleting.target}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 cursor-pointer disabled:opacity-50"
              >
                {moving ? "Переношу…" : "Перенести і видалити"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
