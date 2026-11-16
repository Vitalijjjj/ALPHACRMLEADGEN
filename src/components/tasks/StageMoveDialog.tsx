"use client";

import { useState } from "react";
import { Check, ArrowRight, ChevronDown, Flag } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { Funnel, Stage } from "@/lib/crmSettings";

// «Перекинути далі?» after the tasks of a stage are done:
// current → next stage preview, one big «Змінити стадію на …» button, other stages fold out below.
export default function StageMoveDialog({
  funnel,
  currentId,
  targetId,
  doneTitle,
  allDone,
  busy,
  onMove,
  onClose,
}: {
  funnel: Funnel;
  currentId: string;
  targetId: string | null;
  doneTitle: string;
  allDone?: boolean;
  busy: boolean;
  onMove: (stageId: string) => void;
  onClose: () => void;
}) {
  const current = funnel.stages.find((s) => s.id === currentId);
  const target = funnel.stages.find((s) => s.id === targetId && s.id !== currentId && s.kind !== "loss") ?? null;
  const [open, setOpen] = useState(!target);
  // every working stage + the win stage, in funnel order
  const list = funnel.stages.filter((s) => s.kind !== "loss" && s.id !== target?.id);
  const order = funnel.stages.filter((s) => s.kind === "active").map((s) => s.id); // stage numbers as in the funnel

  return (
    <Modal open onClose={onClose} title={allDone ? "Задачі стадії виконано" : "Змінити стадію"} size="sm">
      <div className="space-y-4">
        {/* what was done */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/[0.06]">
          <span className="w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center shrink-0">
            <Check size={12} strokeWidth={3} className="text-black" />
          </span>
          <span className="text-sm text-[var(--text)] truncate">{doneTitle}</span>
        </div>

        {target && current && (
          <>
            {/* current → next */}
            <div className="flex items-center gap-2">
              <StagePill stage={current} muted />
              <div className="flex-1 h-[2px] rounded-full relative overflow-hidden min-w-6"
                style={{ background: `linear-gradient(90deg, ${current.color}55, ${target.color})` }}>
                <span className="absolute inset-y-0 w-8 stage-flow" style={{ background: `linear-gradient(90deg, transparent, ${target.color}, transparent)` }} />
              </div>
              <StagePill stage={target} />
            </div>

            <button
              disabled={busy}
              onClick={() => onMove(target.id)}
              className="group w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-black cursor-pointer disabled:opacity-50 transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.99]"
              style={{ background: `linear-gradient(135deg, ${target.color}, ${target.color}cc)`, boxShadow: `0 8px 24px -10px ${target.color}` }}
            >
              {target.kind === "win" ? <Flag size={15} /> : null}
              {target.kind === "win" ? `Завершити роботу — «${target.label}»` : `Змінити стадію на «${target.label}»`}
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </>
        )}

        {/* other stages fold out */}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/[0.03] cursor-pointer transition-colors"
          >
            {target ? "Інша стадія" : "Вибери стадію"}
            <ChevronDown size={14} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <div className="px-1.5 pb-1.5 space-y-0.5 border-t border-[var(--border)] pt-1.5">
                {list.map((s) => {
                  const here = s.id === currentId;
                  return (
                    <button
                      key={s.id}
                      disabled={busy || here}
                      onClick={() => onMove(s.id)}
                      className="group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm cursor-pointer disabled:cursor-default transition-colors"
                      style={{ background: here ? `${s.color}14` : undefined }}
                      onMouseEnter={(e) => { if (!here) e.currentTarget.style.background = `${s.color}1f`; }}
                      onMouseLeave={(e) => { if (!here) e.currentTarget.style.background = ""; }}
                    >
                      <span className="w-5 text-[10px] text-[var(--text-dim)] tabular-nums">{s.kind === "win" ? "" : order.indexOf(s.id) + 1}</span>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}80` }} />
                      <span className="flex-1 truncate" style={{ color: here ? "var(--text-muted)" : "var(--text)" }}>{s.label}</span>
                      {here
                        ? <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">зараз тут</span>
                        : <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: s.color }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <button onClick={onClose} className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
          Лишити на поточній стадії
        </button>
      </div>
    </Modal>
  );
}

function StagePill({ stage, muted }: { stage: Stage; muted?: boolean }) {
  return (
    <span
      className="max-w-[45%] truncate px-2.5 py-1 rounded-lg text-xs font-semibold border"
      style={muted
        ? { color: `${stage.color}cc`, borderColor: `${stage.color}30`, background: `${stage.color}0d` }
        : { color: stage.color, borderColor: `${stage.color}66`, background: `${stage.color}1f`, boxShadow: `0 0 16px -6px ${stage.color}` }}
    >
      {stage.label}
    </span>
  );
}
