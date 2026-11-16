"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, CopyPlus, MessageSquareText, Pencil, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ask } from "@/components/ui/dialogs";
import { toastError } from "@/components/ui/toast";
import { FormFooter } from "@/components/ui/formKit";

interface PushTemplate {
  id: string;
  title: string | null;
  category: string | null;
  text: string;
}

const KEY = ["push-templates"];
const PALETTE = ["#C98C0A", "#38bdf8", "#22c55e", "#a855f7", "#f472b6", "#f97316", "#22d3ee", "#ef4444"];
const NONE = "__none__";
// stable colour per category name
const colorOf = (c: string | null) => {
  if (!c) return "#71717a";
  let h = 0;
  for (const ch of c.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || e.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// «Пуші»: заготовки повідомлень з категоріями — скопіював і вставив клієнту.
export default function PushesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PushTemplate[]> => send("/api/push-templates", "GET"),
  });
  const items = useMemo(() => q.data ?? [], [q.data]);
  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ item: PushTemplate | null; copyOf?: PushTemplate } | null>(null);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of items) if (t.category) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const uncategorized = items.filter((t) => !t.category).length;
  const needle = search.trim().toLowerCase();
  const shown = items.filter((t) =>
    (cat === null || (cat === NONE ? !t.category : t.category === cat)) &&
    (!needle || `${t.title ?? ""} ${t.text} ${t.category ?? ""}`.toLowerCase().includes(needle)));

  const del = useMutation({
    mutationFn: (t: PushTemplate) => send(`/api/push-templates/${t.id}`, "DELETE"),
    onMutate: (t) => qc.setQueryData<PushTemplate[]>(KEY, (old) => old?.filter((x) => x.id !== t.id)),
    onError: () => toastError("Не вдалося видалити"),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  async function copy(t: PushTemplate) {
    await copyText(t.text);
    setCopied(t.id);
    setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 1600);
  }

  const chip = (key: string | null, label: string, n: number, color?: string) => {
    const on = cat === key;
    return (
      <button key={key ?? "all"} onClick={() => setCat(key)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition-colors ${on ? "font-semibold" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
        style={on ? { color: color ?? "var(--accent)", borderColor: `${color ?? "#C98C0A"}55`, background: `${color ?? "#C98C0A"}14` } : undefined}>
        {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
        {label}<span className="text-[11px] font-normal tabular-nums opacity-70">{n}</span>
      </button>
    );
  };

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><MessageSquareText size={17} /></div>
        <h1 className="text-lg font-semibold text-[var(--text)] mr-auto">Пуші</h1>
        <div className="relative w-full sm:w-72 order-last sm:order-none">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук по заготовках"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer" aria-label="Очистити"><X size={13} /></button>}
        </div>
        <button onClick={() => setEditor({ item: null })}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 transition-[filter]" style={{ background: "var(--accent)" }}>
          <Plus size={15} /> Заготовка
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chip(null, "Усі", items.length)}
        {categories.map(([c, n]) => chip(c, c, n, colorOf(c)))}
        {uncategorized > 0 && chip(NONE, "Без категорії", uncategorized, "#71717a")}
      </div>

      {q.isLoading ? (
        <div className="py-16 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>
      ) : q.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-[var(--surface)] px-4 py-3 text-sm text-red-400">Не вдалося завантажити заготовки: {(q.error as Error).message}</div>
      ) : !shown.length ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-14 text-center text-sm text-[var(--text-muted)]">
          {items.length ? "Нічого не знайдено" : "Заготовок ще немає — натисни «+ Заготовка»"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {shown.map((t) => {
            const color = colorOf(t.category);
            const done = copied === t.id;
            return (
              <article key={t.id} className="group relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden hover:border-white/15 transition-colors">
                <div className="absolute -top-14 -right-10 w-36 h-36 rounded-full blur-3xl opacity-[0.10] pointer-events-none" style={{ background: color }} />
                <div className="relative flex items-start gap-2 px-4 pt-3.5">
                  <div className="min-w-0 flex-1">
                    {t.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider" style={{ color, background: `${color}1a` }}>
                        <Tag size={9} />{t.category}
                      </span>
                    )}
                    <h3 className="mt-1.5 text-sm font-semibold text-[var(--text)] truncate">{t.title || t.text.split("\n")[0].slice(0, 60)}</h3>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditor({ item: t })} title="Редагувати" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.06] cursor-pointer"><Pencil size={13} /></button>
                    <button onClick={() => setEditor({ item: null, copyOf: t })} title="Дублювати" className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.06] cursor-pointer"><CopyPlus size={13} /></button>
                    <button onClick={async () => { if (await ask(`Видалити заготовку «${t.title || t.text.slice(0, 30)}»?`)) del.mutate(t); }} title="Видалити"
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="relative flex-1 px-4 pt-2 pb-3 text-[13px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">{t.text}</p>
                <div className="relative flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.05]">
                  <span className="text-[10px] text-[var(--text-dim)] tabular-nums mr-auto">{t.text.length} симв.</span>
                  <button onClick={() => copy(t)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors"
                    style={done ? { color: "#4ade80", borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.12)" } : { color: "var(--accent)", borderColor: "rgba(201,140,10,0.45)", background: "rgba(201,140,10,0.10)" }}>
                    {done ? <Check size={13} /> : <Copy size={13} />}{done ? "Скопійовано" : "Скопіювати"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor && (
        <PushModal item={editor.item} copyOf={editor.copyOf} categories={categories.map(([c]) => c)} defaultCat={cat && cat !== NONE ? cat : null}
          onClose={() => setEditor(null)} onSaved={() => qc.invalidateQueries({ queryKey: KEY })} />
      )}
    </div>
  );
}

function PushModal({ item, copyOf, categories, defaultCat, onClose, onSaved }: {
  item: PushTemplate | null; copyOf?: PushTemplate; categories: string[]; defaultCat: string | null; onClose: () => void; onSaved: () => void;
}) {
  const src = item ?? copyOf;
  const [title, setTitle] = useState(item ? item.title ?? "" : copyOf ? `${copyOf.title || "Заготовка"} (копія)` : "");
  const [text, setText] = useState(src?.text ?? "");
  const [category, setCategory] = useState<string>(src?.category ?? defaultCat ?? categories[0] ?? "Пуші");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = [...new Set([...(categories.length ? categories : ["Пуші", "Клієнти"]), ...(category ? [category] : [])])];
  const catColor = colorOf(category || null);
  const label = "block text-[10px] font-medium uppercase tracking-wider text-[var(--text-dim)] mb-1.5";
  const field = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return toastError("Напиши текст заготовки");
    setBusy(true);
    try {
      await send(item ? `/api/push-templates/${item.id}` : "/api/push-templates", item ? "PATCH" : "POST", { title, text, category: category.trim() || null });
      onSaved();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? "Заготовка" : "Нова заготовка"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className={label}>Категорія</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {list.map((c) => {
              const on = c === category;
              const col = colorOf(c);
              return (
                <button key={c} type="button" onClick={() => { setCategory(c); setAdding(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${on ? "font-semibold" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  style={on ? { color: col, borderColor: `${col}66`, background: `${col}17` } : undefined}>
                  <span className="w-2 h-2 rounded-full" style={{ background: col }} />{c}
                </button>
              );
            })}
            {adding ? (
              <input autoFocus placeholder="Нова категорія" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v) setCategory(v); setAdding(false); } if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }}
                onBlur={(e) => { const v = e.target.value.trim(); if (v) setCategory(v); setAdding(false); }}
                className="w-40 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--accent)]/60 text-sm text-[var(--text)] outline-none" />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"><Plus size={13} /> Категорія</button>
            )}
          </div>
        </div>
        <div>
          <span className={label}>Назва</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="Напр. Нагадування після дзвінка" />
        </div>
        <div className="rounded-xl border bg-[var(--surface-2)] transition-colors overflow-hidden" style={{ borderColor: text.trim() ? `${catColor}55` : "var(--border)" }}>
          <div className="flex items-center gap-2 px-3 pt-2">
            <MessageSquareText size={12} style={{ color: catColor }} />
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] mr-auto">Текст повідомлення</span>
            <span className="text-[10px] text-[var(--text-dim)] tabular-nums">{text.length} симв.</span>
          </div>
          <textarea autoFocus={!item} value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="Текст, який копіюватимеш клієнту…"
            className="w-full px-3 pb-3 pt-1.5 bg-transparent text-sm text-[var(--text)] outline-none resize-y min-h-[180px] leading-relaxed placeholder:text-[var(--text-dim)]" />
        </div>
        <FormFooter onCancel={onClose} busy={busy} color={catColor}>
          {busy ? "Зберігаю…" : item ? "Зберегти" : <>Створити заготовку{category ? ` · ${category}` : ""}</>}
        </FormFooter>
      </form>
    </Modal>
  );
}
