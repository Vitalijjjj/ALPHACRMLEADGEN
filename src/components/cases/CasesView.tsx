"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, CopyCheck, ExternalLink, FolderPlus, Gem, Globe, Link2, MapPin, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { PrivacyButton } from "@/components/ui/Privacy";
import { Modal } from "@/components/ui/modal";
import { toast, toastError } from "@/components/ui/toast";

interface CaseRow {
  id: string; free: boolean; number: number | null; title: string; client: string; niche: string | null; geo: string | null; service: string | null;
  url: string; done: boolean; stage: string; stageColor: string; date: string;
}
interface ProjectHit { id: string; number: number; title: string; client: string; hasCase: boolean; stage: string; stageColor: string }

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Помилка ${r.status}`);
  return j;
}

const host = (u: string) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`; };
const PALETTE = ["#C98C0A", "#a78bfa", "#22d3ee", "#34d399", "#f472b6", "#fb923c", "#60a5fa", "#facc15"];
const colorOf = (s: string) => PALETTE[Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % PALETTE.length];

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ kind: "success", title: `${what} скопійовано`, duration: 1800 });
  } catch {
    toast({ kind: "error", title: "Не вдалося скопіювати" });
  }
}

// «Кейси»: links to the live sites of finished projects — copy one / all, open, filter by niche.
export default function CasesView() {
  const q = useQuery({
    queryKey: ["cases"],
    queryFn: async (): Promise<CaseRow[]> => {
      const r = await fetch("/api/cases");
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: 30_000,
  });
  const [needle, setNeedle] = useState("");
  const [niche, setNiche] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState<CaseRow | "new" | null>(null); // add / edit a hand-added case
  const [linking, setLinking] = useState<CaseRow | null>(null);
  const qc = useQueryClient();
  const router = useRouter();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["cases"] }); qc.invalidateQueries({ queryKey: ["story"] }); };
  async function remove(c: CaseRow) {
    if (!confirm(`Видалити кейс ${host(c.url)}?`)) return;
    try { await api(`/api/cases/${c.id}`, "DELETE"); refresh(); } catch (e) { toastError((e as Error).message); }
  }
  async function createProject(c: CaseRow) {
    try {
      const r = await api(`/api/cases/${c.id}`, "POST", { create: true });
      refresh();
      toast({ kind: "success", title: `Створено проєкт #${r.number}`, text: "уже в «Операційці» як завершений", duration: 3500 });
      router.push(`/leads/${r.number}`);
    } catch (e) { toastError((e as Error).message); }
  }
  const all = useMemo(() => q.data ?? [], [q.data]);
  const niches = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) if (c.niche?.trim()) m.set(c.niche.trim(), (m.get(c.niche.trim()) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const n = needle.trim().toLowerCase();
  const list = all.filter((c) => (!niche || c.niche?.trim() === niche)
    && (!n || `${c.title} ${c.client} ${c.url} ${c.niche ?? ""} ${c.geo ?? ""}`.toLowerCase().includes(n)));

  const copyOne = (c: CaseRow) => { copy(c.url, "Посилання"); setCopied(c.id); setTimeout(() => setCopied((x) => (x === c.id ? null : x)), 1600); };
  // «Сайт для барбершопу — https://…» per line: ready to paste into a chat
  const copyAll = () => copy(list.map((c) => `${c.niche ? `${c.niche} — ` : ""}${c.url}`).join("\n"), `${list.length} посилань`);

  return (
    <div className="p-3 sm:p-6 space-y-4 relative z-10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25"><Gem size={17} /></div>
        <h1 className="text-lg font-semibold text-[var(--text)] ml-1">Кейси</h1>
        <span className="text-sm text-[var(--text-dim)] tabular-nums mr-auto">{all.length}</span>
        <PrivacyButton />
        <button onClick={() => setForm("new")}
          className="h-[38px] flex items-center gap-1.5 px-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] cursor-pointer hover:border-white/20">
          <Plus size={15} />Додати кейс
        </button>
        <button onClick={copyAll} disabled={!list.length}
          className="h-[38px] flex items-center gap-1.5 px-3.5 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-default" style={{ background: "var(--accent)" }}>
          <CopyCheck size={15} />Копіювати всі{list.length !== all.length ? ` (${list.length})` : ""}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
          <input value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Пошук: назва, домен, ніша, місто…"
            className="w-full h-[38px] pl-9 pr-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </div>
        {niches.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setNiche(null)} className={`px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${!niche ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Усі ніші</button>
            {niches.map(([x, cnt]) => (
              <button key={x} onClick={() => setNiche(niche === x ? null : x)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${niche === x ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                {x}<span className="text-[var(--text-dim)] tabular-nums">{cnt}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {q.isLoading ? <div className="py-16 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>
        : !all.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 px-6 text-center">
            <Gem size={28} className="mx-auto text-[var(--accent)] opacity-70" />
            <p className="mt-3 text-sm text-[var(--text)]">Кейсів ще немає</p>
            <p className="mt-1 text-xs text-[var(--text-muted)] max-w-md mx-auto">Коли PM завершує проєкт в «Операційці», CRM просить посилання на готовий сайт — воно з&apos;явиться тут. Або натисни «Додати кейс».</p>
          </div>
        ) : !list.length ? <div className="py-12 text-center text-sm text-[var(--text-dim)]">Нічого не знайдено</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {list.map((c) => {
              const col = colorOf(c.niche || c.title);
              const h = host(c.url);
              return (
                <article key={c.id} className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-white/15 transition-colors">
                  {/* «browser» header with the domain */}
                  <div className="relative h-[92px] px-4 pt-3 overflow-hidden" style={{ background: `linear-gradient(135deg, ${col}26, transparent 70%)` }}>
                    <div className="absolute -top-10 -right-8 w-36 h-36 rounded-full blur-2xl opacity-30" style={{ background: col }} />
                    <div className="relative flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#ff5f57]/80" /><span className="w-2 h-2 rounded-full bg-[#febc2e]/80" /><span className="w-2 h-2 rounded-full bg-[#28c840]/80" />
                      <span className="ml-2 flex-1 min-w-0 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/30 border border-white/10 text-[11px] text-white/70">
                        <Globe size={10} className="shrink-0" /><span className="truncate">{h}</span>
                      </span>
                    </div>
                    <div className="relative mt-3 text-[22px] font-extrabold tracking-tight truncate" style={{ color: col }}>{h.split("/")[0]}</div>
                  </div>

                  <div className="px-4 pt-3 pb-4">
                    <div className="flex items-start gap-2">
                      {c.free ? (
                        <div className="min-w-0 flex-1">
                          <div data-private="project" className="text-sm font-semibold text-[var(--text)] truncate">{c.title || h.split("/")[0]}</div>
                          <div className="text-[11px] text-[#fbbf24]">без проєкту</div>
                        </div>
                      ) : (
                        <Link href={`/leads/${c.number}`} className="min-w-0 flex-1">
                          <div data-private="project" className="text-sm font-semibold text-[var(--text)] truncate hover:text-[var(--accent)]">{c.title}</div>
                          <div className="text-[11px] text-[var(--text-dim)] truncate">#{c.number}{c.client ? <span data-private={isPhone(c.client) ? "contacts" : "name"}> · {c.client}</span> : null}</div>
                        </Link>
                      )}
                      {c.free ? (
                        <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setForm(c)} title="Змінити" className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06] cursor-pointer"><Pencil size={13} /></button>
                          <button onClick={() => remove(c)} title="Видалити" className="p-1 rounded-md text-[var(--text-dim)] hover:text-[#f87171] hover:bg-white/[0.06] cursor-pointer"><Trash2 size={13} /></button>
                        </span>
                      ) : c.done
                        ? <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-[#4ade80] bg-[#22c55e]/12">здано {fmtDate(c.date)}</span>
                        : <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold" style={{ color: c.stageColor, background: `${c.stageColor}1f` }}>{c.stage}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {c.niche && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[var(--text-muted)]"><Tag size={10} />{c.niche}</span>}
                      {c.geo && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[var(--text-muted)]"><MapPin size={10} />{c.geo}</span>}
                      {c.service && <span className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[var(--text-muted)]">{c.service}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => copyOne(c)}
                        className={`h-9 flex items-center justify-center gap-1.5 rounded-xl border text-sm cursor-pointer transition-colors ${copied === c.id ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#4ade80]" : "border-[var(--border)] text-[var(--text)] hover:bg-white/[0.04]"}`}>
                        {copied === c.id ? <><Check size={14} />Скопійовано</> : <><Copy size={14} />Копіювати</>}
                      </button>
                      <a href={c.url} target="_blank" rel="noopener noreferrer"
                        className="h-9 flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-black hover:brightness-110" style={{ background: col }}>
                        <ExternalLink size={14} />Відкрити
                      </a>
                    </div>
                    {c.free && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button onClick={() => setLinking(c)} className="h-8 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#fbbf24]/40 text-xs text-[#fbbf24] hover:bg-[#fbbf24]/[0.06] cursor-pointer">
                          <Link2 size={13} />Зв&apos;язати з проєктом
                        </button>
                        <button onClick={() => createProject(c)} className="h-8 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.04] cursor-pointer">
                          <FolderPlus size={13} />Створити проєкт
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      {form && <CaseForm row={form === "new" ? null : form} niches={niches.map(([x]) => x)} onClose={() => setForm(null)} onSaved={refresh} />}
      {linking && <LinkModal row={linking} onClose={() => setLinking(null)} onDone={refresh} />}
    </div>
  );
}

const isPhone = (v: string) => /^[+\d\s()-]{6,}$/.test(v.trim());
const input = "w-full h-[38px] px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";

// «Додати кейс» / edit a hand-added case
function CaseForm({ row, niches, onClose, onSaved }: { row: CaseRow | null; niches: string[]; onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState(row?.url ?? "");
  const [title, setTitle] = useState(row?.title ?? "");
  const [niche, setNiche] = useState(row?.niche ?? "");
  const [geo, setGeo] = useState(row?.geo ?? "");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return toastError("Вкажи посилання");
    setBusy(true);
    try {
      const body = { url, title, niche, geo };
      if (row) await api(`/api/cases/${row.id}`, "PATCH", body); else await api("/api/cases", "POST", body);
      onSaved(); onClose();
      toast({ kind: "success", title: row ? "Кейс збережено" : "Кейс додано", duration: 1800 });
    } catch (err) { toastError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={row ? "Кейс" : "Додати кейс"} size="sm">
      <form onSubmit={save} className="space-y-3">
        <label className="block"><span className="block text-xs text-[var(--text-muted)] mb-1">Посилання на готовий сайт</span>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="site.com" className={input} /></label>
        <label className="block"><span className="block text-xs text-[var(--text-muted)] mb-1">Назва</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Сайт для барбершопу" className={input} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs text-[var(--text-muted)] mb-1">Ніша</span>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} list="case-niches" placeholder="Барбершоп" className={input} />
            <datalist id="case-niches">{niches.map((x) => <option key={x} value={x} />)}</datalist></label>
          <label className="block"><span className="block text-xs text-[var(--text-muted)] mb-1">Місто / країна</span>
            <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="Київ" className={input} /></label>
        </div>
        <p className="text-[11px] text-[var(--text-dim)]">Без проєкту кейс просто лежить у списку — потім його можна зв&apos;язати з проєктом або створити новий.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">Скасувати</button>
          <button disabled={busy} className="h-9 px-4 rounded-xl text-sm font-semibold text-black cursor-pointer hover:brightness-110 disabled:opacity-50" style={{ background: "var(--accent)" }}>{row ? "Зберегти" : "Додати"}</button>
        </div>
      </form>
    </Modal>
  );
}

// «Зв'язати з проєктом»: pick an «Операційка» deal — the link moves into it
function LinkModal({ row, onClose, onDone }: { row: CaseRow; onClose: () => void; onDone: () => void }) {
  const q = useQuery({
    queryKey: ["cases", "projects"],
    queryFn: async (): Promise<ProjectHit[]> => { const r = await fetch("/api/cases?projects=1"); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
  });
  const [needle, setNeedle] = useState("");
  const [busy, setBusy] = useState(false);
  const n = needle.trim().toLowerCase().replace(/^#/, "");
  const list = (q.data ?? []).filter((p) => !n || `${p.number} ${p.title} ${p.client}`.toLowerCase().includes(n)).slice(0, 40);
  async function pick(p: ProjectHit) {
    if (p.hasCase && !confirm(`У проєкта #${p.number} уже є посилання — замінити?`)) return;
    setBusy(true);
    try {
      await api(`/api/cases/${row.id}`, "POST", { leadId: p.id });
      onDone(); onClose();
      toast({ kind: "success", title: `Кейс зв'язано з #${p.number}`, text: p.title, duration: 2500 });
    } catch (e) { toastError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Зв'язати з проєктом" size="md">
      <div className="text-xs text-[var(--text-muted)] mb-2 truncate">{host(row.url)}</div>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
        <input autoFocus value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Номер, назва проєкту, клієнт…" className={`${input} pl-9`} />
      </div>
      <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-0.5">
        {q.isLoading ? <div className="py-8 text-center text-sm text-[var(--text-muted)]">Завантаження…</div>
          : !list.length ? <div className="py-8 text-center text-sm text-[var(--text-dim)]">Нічого не знайдено</div>
          : list.map((p) => (
            <button key={p.id} disabled={busy} onClick={() => pick(p)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/[0.05] cursor-pointer disabled:opacity-50">
              <span className="text-xs tabular-nums text-[var(--text-dim)] w-10 shrink-0">#{p.number}</span>
              <span className="min-w-0 flex-1">
                <span data-private="project" className="block text-sm text-[var(--text)] truncate">{p.title}</span>
                {p.client && <span data-private={isPhone(p.client) ? "contacts" : "name"} className="block text-[11px] text-[var(--text-dim)] truncate">{p.client}</span>}
              </span>
              {p.hasCase && <Gem size={12} className="text-[var(--accent)] shrink-0" />}
              <span className="text-[10px] shrink-0" style={{ color: p.stageColor }}>{p.stage}</span>
            </button>
          ))}
      </div>
    </Modal>
  );
}
