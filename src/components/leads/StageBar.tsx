"use client";

import { useState } from "react";
import { activeStages, type ResolvedStage } from "@/lib/crmSettings";

// Bitrix-style segmented progress bar for a lead's stage.
// Filled cells = how far the lead went through the funnel. Clicking a cell moves the lead to that stage;
// the last cell («Завершити») opens the win/loss dialog.

const EMPTY = "rgba(255,255,255,0.07)";

export default function StageBar({
  resolved,
  onChange,
  onFinish,
}: {
  resolved: ResolvedStage;
  onChange?: (stageId: string) => void;
  onFinish?: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { funnel, stage, reason } = resolved;
  const stages = activeStages(funnel);
  const closed = stage.kind !== "active";
  const idx = stages.findIndex((s) => s.id === stage.id);

  const total = stages.length + 1; // + final «Завершити» cell
  const filled = closed ? total : idx + 1;
  const color = stage.color;

  const finalIdx = stages.length;
  const hoverStage = hover !== null && hover < finalIdx ? stages[hover] : null;
  const label = hoverStage
    ? hoverStage.label
    : hover === finalIdx
      ? "Завершити: виграш / програш"
      : reason ? `${stage.label} · ${reason.label}` : stage.label;

  return (
    <div className="w-[180px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-[2px]" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: total }).map((_, i) => {
          const isFinal = i === finalIdx;
          const on = i < filled;
          // While hovering a stage, preview how the bar would look after the click.
          const previewing = !!onChange && hoverStage !== null;
          const bg = previewing
            ? i <= hover! ? `${hoverStage!.color}cc` : EMPTY
            : hover === finalIdx && isFinal && onFinish
              ? "rgba(255,255,255,0.35)"
              : on ? color : EMPTY;
          const clickable = isFinal ? !!onFinish : !!onChange;
          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onMouseEnter={() => setHover(i)}
              onClick={() => {
                if (isFinal) onFinish?.();
                else if (stages[i].id !== stage.id) onChange?.(stages[i].id);
              }}
              className="flex-1 h-[6px] rounded-[2px] transition-colors duration-150 disabled:cursor-default cursor-pointer"
              style={{
                background: bg,
                boxShadow: on && !previewing && i === filled - 1 ? `0 0 6px ${color}88` : undefined,
              }}
              aria-label={isFinal ? "Завершити" : stages[i].label}
              title={isFinal ? undefined : stages[i].hint ? `${stages[i].label} — ${stages[i].hint}` : stages[i].label}
            />
          );
        })}
      </div>
      <div
        className="mt-1 text-[11px] leading-tight truncate transition-colors"
        style={{ color: hoverStage ? hoverStage.color : hover === finalIdx ? "var(--text-muted)" : color }}
      >
        {label}
      </div>
    </div>
  );
}
