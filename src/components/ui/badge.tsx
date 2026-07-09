import { cn } from "@/lib/utils";
import { LEAD_STATUS_BADGE, LEAD_STATUS_BADGE_LABEL } from "@/lib/leadOptions";

const variants: Record<string, string> = {
  // lead statuses — single source of truth
  ...LEAD_STATUS_BADGE,
  // legacy aliases
  NEW:   "bg-amber-500/15 text-amber-400 border-amber-500/20",
  CLOSE: "bg-rose-500/15  text-rose-400  border-rose-500/20",
  LOST:  "bg-red-500/15   text-red-400   border-red-500/20",
  // task
  TODO:        "bg-zinc-500/15   text-zinc-400   border-zinc-500/20",
  IN_PROGRESS: "bg-blue-500/15   text-blue-400   border-blue-500/20",
  DONE:        "bg-green-500/15  text-green-400  border-green-500/20",
  // priority
  LOW:         "bg-zinc-500/15   text-zinc-400   border-zinc-500/20",
  MEDIUM:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  HIGH:        "bg-red-500/15    text-red-400    border-red-500/20",
  URGENT:      "bg-red-600/20    text-red-300    border-red-500/30",
  // deal
  PLANNING:    "bg-blue-500/15   text-blue-400   border-blue-500/20",
  DESIGN:      "bg-violet-500/15 text-violet-400 border-violet-500/20",
  DEVELOPMENT: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  TESTING:     "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  COMPLETED:   "bg-green-500/15  text-green-400  border-green-500/20",
};

const labels: Record<string, string> = {
  // lead statuses — single source of truth
  ...LEAD_STATUS_BADGE_LABEL,
  // legacy aliases
  NEW:   "Новий лід",
  CLOSE: "Закрити лід",
  LOST:  "Програш",
  // task
  TODO:        "Todo",
  IN_PROGRESS: "В роботі",
  DONE:        "Виконано",
  // priority
  LOW:    "Низький",
  MEDIUM: "Середній",
  HIGH:   "Високий",
  URGENT: "Терміново",
  // deal
  PLANNING:    "Планування",
  DESIGN:      "Дизайн",
  DEVELOPMENT: "Розробка",
  TESTING:     "Тестування",
  COMPLETED:   "Завершено",
};

export function Badge({ value }: { value: string }) {
  const cls = variants[value] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border", cls)}>
      {labels[value] ?? value}
    </span>
  );
}
