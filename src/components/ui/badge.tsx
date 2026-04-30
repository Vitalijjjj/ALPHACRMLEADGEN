import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  // lead — active
  NEW:         "bg-amber-500/15  text-amber-400  border-amber-500/20",
  NEW_LEAD:    "bg-amber-500/15  text-amber-400  border-amber-500/20",
  CONTACTED:   "bg-cyan-500/15   text-cyan-400   border-cyan-500/20",
  MISSED_CALL: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  TARGETED:    "bg-green-500/15  text-green-400  border-green-500/20",
  PROPOSAL:    "bg-violet-500/15 text-violet-400 border-violet-500/20",
  INTERESTED:  "bg-teal-500/15   text-teal-400   border-teal-500/20",
  THINKING:    "bg-blue-500/15   text-blue-400   border-blue-500/20",
  CLOSE:       "bg-rose-500/15   text-rose-400   border-rose-500/20",
  // lead — win
  WON:         "bg-green-500/15  text-green-400  border-green-500/20",
  // lead — loss
  LOST:            "bg-red-500/15 text-red-400 border-red-500/20",
  NOT_INTERESTED:  "bg-red-500/15 text-red-400 border-red-500/20",
  DUPLICATE:       "bg-red-500/15 text-red-400 border-red-500/20",
  UNREACHABLE:     "bg-red-500/15 text-red-400 border-red-500/20",
  NOT_TARGET:      "bg-red-500/15 text-red-400 border-red-500/20",
  TOO_EXPENSIVE:   "bg-red-500/15 text-red-400 border-red-500/20",
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
  // lead — active
  NEW:         "Новий лід",
  NEW_LEAD:    "Новий лід",
  CONTACTED:   "Звʼязався",
  MISSED_CALL: "Недозвон",
  TARGETED:    "Цільовий",
  PROPOSAL:    "КП",
  INTERESTED:  "Цікаво",
  THINKING:    "Думає",
  CLOSE:       "Закрити лід",
  // lead — win/loss
  WON:            "Виграш",
  LOST:           "Програш",
  NOT_INTERESTED: "Не цікаво",
  DUPLICATE:      "Дубль",
  UNREACHABLE:    "Не змогли звʼязатись",
  NOT_TARGET:     "не ЦА",
  TOO_EXPENSIVE:  "Дорого",
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
