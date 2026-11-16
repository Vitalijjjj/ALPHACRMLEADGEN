"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Tags } from "lucide-react";
import { ask } from "@/components/ui/dialogs";
import { toast, toastError } from "@/components/ui/toast";
import { useLeadSources } from "@/lib/useLeadSources";

const KEY = ["lead-source-counts"];
const sel = "px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] cursor-pointer";

// Settings (owner): move every lead of one source to another — e.g. «Сайт» → «Контекст».
export default function SourceRename() {
  const qc = useQueryClient();
  const { sources } = useLeadSources();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<{ source: string; count: number }[]> => {
      const res = await fetch("/api/leads/rename-source");
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });
  const used = q.data ?? [];
  const [from, setFrom] = useState("Сайт");
  const [to, setTo] = useState("Контекст");
  const [busy, setBusy] = useState(false);
  const count = used.find((u) => u.source.toLowerCase() === from.toLowerCase())?.count ?? 0;
  const fromOptions = [...new Set([from, ...used.map((u) => u.source)])];
  const toOptions = [...new Set([to, ...sources.map((s) => s.value)])];

  async function run() {
    if (!count || from === to) return;
    if (!(await ask(`Перенести ${count} лідів з джерела «${from}» у «${to}»?`, { title: "Джерела лідів", confirmLabel: "Перенести" }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leads/rename-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      toast({ kind: "success", title: "Готово", text: `Перенесено лідів: ${data.count} → «${to}»` });
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      toastError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-wrap items-center gap-2">
      <Tags size={14} className="text-[var(--text-dim)]" />
      <span className="text-[13px] font-medium text-[var(--text)] mr-1">Джерела лідів</span>
      <select value={from} onChange={(e) => setFrom(e.target.value)} className={sel}>
        {fromOptions.map((s) => {
          const n = used.find((u) => u.source === s)?.count ?? 0;
          return <option key={s} value={s}>{s} ({n})</option>;
        })}
      </select>
      <ArrowRight size={13} className="text-[var(--text-dim)]" />
      <select value={to} onChange={(e) => setTo(e.target.value)} className={sel}>
        {toOptions.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={run} disabled={busy || !count || from === to}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? "Переношу…" : `Перенести${count ? ` (${count})` : ""}`}
      </button>
      {!q.isLoading && !count && <span className="text-xs text-[var(--text-muted)]">лідів з «{from}» немає</span>}
    </section>
  );
}
