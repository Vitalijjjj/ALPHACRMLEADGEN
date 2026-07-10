"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Plus, Pencil, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface PushTemplate {
  id: string;
  title: string | null;
  text: string;
}

const field = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-dim)]";
const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide";

export default function PushesPage() {
  const [templates, setTemplates] = useState<PushTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // null = closed; {id: null} = create; {id: string} = edit
  const [editor, setEditor] = useState<{ id: string | null; title: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/push-templates");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoadError(err.detail || err.error || `HTTP ${res.status}`);
        return;
      }
      setTemplates(await res.json());
      setLoadError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without clipboard API / insecure context
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
  }

  async function saveEditor() {
    if (!editor || !editor.text.trim()) return;
    setSaving(true);
    try {
      const isNew = editor.id === null;
      const res = await fetch(isNew ? "/api/push-templates" : `/api/push-templates/${editor.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editor.title, text: editor.text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Помилка збереження: " + (err.detail || err.error || res.status));
        return;
      }
      setEditor(null);
      fetchTemplates();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    setConfirmDeleteId(null);
    await fetch(`/api/push-templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Пуші</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Готові шаблони повідомлень — натисніть «Скопіювати» і вставте клієнту
          </p>
        </div>
        <button
          onClick={() => setEditor({ id: null, title: "", text: "" })}
          className="flex items-center gap-1.5 px-3 py-2 text-black text-sm rounded-lg transition-colors cursor-pointer font-semibold shrink-0"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={15} />
          Новий шаблон
        </button>
      </div>

      {/* Cards */}
      {loading ? (
        <p className="text-center py-10 text-sm text-[var(--text-muted)]">Завантаження...</p>
      ) : loadError ? (
        <div className="bg-[var(--surface)] border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 break-words">
          Помилка завантаження шаблонів: {loadError}
        </div>
      ) : templates.length === 0 ? (
        <p className="text-center py-10 text-sm text-[var(--text-muted)]">
          Шаблонів немає — додайте перший кнопкою «Новий шаблон»
        </p>
      ) : (
        <div className="space-y-3">
          {templates.map((t, idx) => {
            const copied = copiedId === t.id;
            return (
              <div key={t.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="text-xs font-medium text-[var(--text-muted)] truncate">
                    {t.title || `Шаблон ${idx + 1}`}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditor({ id: t.id, title: t.title ?? "", text: t.text })}
                      title="Редагувати"
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors cursor-pointer"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      title="Видалити"
                      className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--border)] transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                    <button
                      onClick={() => copy(t.text, t.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      style={
                        copied
                          ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "#22c55e" }
                          : { background: "var(--accent-subtle)", border: "1px solid var(--accent)", color: "var(--accent)" }
                      }
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Скопійовано" : "Скопіювати"}
                    </button>
                  </div>
                </div>
                <p className="px-4 py-3 text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                  {t.text}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? "Редагувати шаблон" : "Новий шаблон"}
      >
        {editor && (
          <div className="space-y-3">
            <div>
              <label className={lbl}>Назва (необовʼязково)</label>
              <input
                value={editor.title}
                onChange={(e) => setEditor((s) => s && { ...s, title: e.target.value })}
                placeholder="Напр. Нагадування після дзвінка"
                className={field}
              />
            </div>
            <div>
              <label className={lbl}>Текст повідомлення *</label>
              <textarea
                value={editor.text}
                onChange={(e) => setEditor((s) => s && { ...s, text: e.target.value })}
                rows={8}
                autoFocus
                placeholder="Текст, який буде копіюватися..."
                className={`${field} resize-y min-h-[120px]`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditor(null)}
                className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                onClick={saveEditor}
                disabled={saving || !editor.text.trim()}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg text-black transition-colors disabled:opacity-50 cursor-pointer"
                style={{ background: "var(--accent)" }}
              >
                {saving ? "Збереження..." : "Зберегти"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title="Видалити шаблон?">
        <p className="text-sm text-[var(--text-muted)] mb-5">Цю дію не можна скасувати.</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmDeleteId(null)}
            className="px-4 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            Скасувати
          </button>
          <button
            onClick={() => confirmDeleteId && deleteTemplate(confirmDeleteId)}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors cursor-pointer"
          >
            Так, видалити
          </button>
        </div>
      </Modal>
    </div>
  );
}
