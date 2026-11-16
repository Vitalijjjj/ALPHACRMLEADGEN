"use client";

import { useState } from "react";
import { Trophy, XCircle, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CLOSE_FIELDS, WIN_ID, LOSS_ID, closeStage, type Funnel } from "@/lib/crmSettings";
import { LEAD_SERVICES } from "@/lib/leadOptions";
import { cleanPhone } from "@/lib/leadFilter";
import { useLeadSources } from "@/lib/useLeadSources";

// Lead fields the dialog may ask for (all optional on the lead itself).
export interface ClosableLead {
  id: string;
  amount?: number | null;
  service?: string | null;
  phone?: string | null;
  niche?: string | null;
  source?: string | null;
  projectDeadline?: string | null;
  caseUrl?: string | null;
  comment?: string | null;
}

type Kind = "win" | "loss";

// «Завершити лід»: pick win/loss, a reason (from the funnel's settings) and fill mandatory fields.
export default function CloseLeadModal({
  lead,
  funnel,
  initialKind,
  onClose,
  onDone,
}: {
  lead: ClosableLead;
  funnel: Funnel;
  initialKind?: Kind;
  onClose: () => void;
  onDone: () => void;
}) {
  const { sources: leadSources } = useLeadSources();
  const [kind, setKind] = useState<Kind>(initialKind ?? "win");
  const [reason, setReason] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CLOSE_FIELDS.map((f) => {
        const v = (lead as unknown as Record<string, unknown>)[f.key];
        return [f.key, v === null || v === undefined ? "" : String(v)];
      })
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rules = kind === "win" ? funnel.win : funnel.loss;
  const stage = closeStage(funnel, kind);
  const required = CLOSE_FIELDS.filter((f) => rules.requiredFields.includes(f.key));

  function switchKind(k: Kind) {
    setKind(k);
    setReason(null);
    setError("");
  }

  async function submit() {
    if (rules.reasonRequired && rules.reasons.length > 0 && !reason) {
      setError("Вибери причину");
      return;
    }
    const missing = required.filter((f) => !fields[f.key]?.trim());
    if (missing.length) {
      setError(`Заповни: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        status: kind === "win" ? WIN_ID : LOSS_ID,
        closeReason: reason,
      };
      for (const f of required) body[f.key] = fields[f.key];
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // the server explains why (a project without its case link / payments)
        throw new Error(typeof j.error === "string" && j.error !== "DB error" ? j.error : "Не вдалося зберегти, спробуй ще раз");
      }
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors";
  const lbl = "block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide";

  return (
    <Modal open onClose={onClose} title="Завершити лід">
      <div className="space-y-4">
        {/* Win / Loss switch */}
        <div className="grid grid-cols-2 gap-2">
          {(["win", "loss"] as const).map((k) => {
            const st = closeStage(funnel, k);
            const on = kind === k;
            const Icon = k === "win" ? Trophy : XCircle;
            return (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer"
                style={on
                  ? { background: `${st.color}1f`, borderColor: st.color, color: st.color }
                  : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                <Icon size={15} />
                {st.label}
              </button>
            );
          })}
        </div>

        {/* Reasons */}
        <div>
          <label className={lbl}>
            Причина {kind === "win" ? "виграшу" : "програшу"}
            {rules.reasonRequired && rules.reasons.length > 0 && <span style={{ color: stage.color }}> *</span>}
          </label>
          {rules.reasons.length === 0 ? (
            <p className="text-xs text-[var(--text-dim)]">Причин ще немає — їх можна додати в Налаштуваннях.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {rules.reasons.map((r) => {
                const on = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setReason(on ? null : r.id); setError(""); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors cursor-pointer"
                    style={on
                      ? { background: `${stage.color}14`, borderColor: `${stage.color}88`, color: "var(--text)" }
                      : { background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                      style={on ? { background: stage.color, borderColor: stage.color } : { borderColor: "var(--border)" }}
                    >
                      {on && <Check size={9} strokeWidth={3} className="text-black" />}
                    </span>
                    {r.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Mandatory fields */}
        {required.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {required.map((f) => (
              <div key={f.key}>
                <label className={lbl}>{f.label} <span style={{ color: stage.color }}>*</span></label>
                {f.key === "service" ? (
                  <select value={fields.service} onChange={(e) => setFields({ ...fields, service: e.target.value })} className={`${field} cursor-pointer`}>
                    <option value="">—</option>
                    {LEAD_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : f.key === "source" ? (
                  <select value={fields.source} onChange={(e) => setFields({ ...fields, source: e.target.value })} className={`${field} cursor-pointer`}>
                    <option value="">—</option>
                    {leadSources.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === "number" ? "number" : "text"}
                    value={fields[f.key]}
                    onChange={(e) => setFields({ ...fields, [f.key]: f.key === "phone" ? cleanPhone(e.target.value) : e.target.value })}
                    className={field}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg text-black transition-colors cursor-pointer disabled:opacity-50"
            style={{ background: stage.color }}
          >
            {saving ? "Зберігаю…" : kind === "win" ? "Закрити як виграш" : "Закрити як програш"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
