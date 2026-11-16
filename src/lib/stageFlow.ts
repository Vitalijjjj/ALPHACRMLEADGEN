// How a lead moves through the stages of a funnel (used by the server when logging, by stats and by the card).
//
// Rules:
//  • Jumping FORWARD (e.g. «Новий лід» → «Інвойс») = the lead passed every stage in between, one by one.
//  • «Обхідні» stages (stage.skip, e.g. НДЗ) are never passed automatically — only when the lead is really moved onto one.
//  • Leaving an обхідна stage continues from the stage the lead came from (Кваліфікація → НДЗ → Інвойс
//    passes Кваліфіковано … Зустріч проведена).
//  • Moving BACK, to «Програш», or to an обхідна stage passes nothing in between.
//  • «Виграш» is the end of the funnel: winning from an earlier stage passes the remaining stages too.
//  • A lead created right on a later stage is treated as having passed the earlier ones.

import { LEGACY_ACTIVE_MAP, LOSS_STATUSES } from "@/lib/leadOptions";
import { activeStages, WIN_ID, LOSS_ID, type Funnel } from "@/lib/crmSettings";

export const STATUS_CHANGE_RE = /^Статус змінено: (\S+) → (\S+)$/;
const CREATED_RE = /^Лід створено зі статусом: (\S+)$/;
const LEGACY_LOSS = new Set<string>(LOSS_STATUSES);
const LEGACY_ACTIVE: Record<string, string> = LEGACY_ACTIVE_MAP;

// Old status codes → stage ids of the current funnel.
export function canonicalStage(id: string): string {
  if (LEGACY_LOSS.has(id)) return LOSS_ID;
  return LEGACY_ACTIVE[id] ?? id;
}

// Position in the funnel: active stages 0…n-1, «Виграш» = n. Others (Програш, unknown) = null.
function position(funnel: Funnel, id: string): number | null {
  const act = activeStages(funnel);
  const i = act.findIndex((s) => s.id === id);
  if (i !== -1) return i;
  if (id === WIN_ID) return act.length;
  return null;
}

function isSkip(funnel: Funnel, id: string): boolean {
  return !!funnel.stages.find((s) => s.id === id)?.skip;
}

// Stages the lead goes through when moved from `from` to `to` (ends with `to`).
// `anchor` = last regular stage before the lead went onto an обхідна one.
export function stepPath(funnel: Funnel, fromRaw: string, toRaw: string, anchor?: string | null): string[] {
  const from = canonicalStage(fromRaw);
  const to = canonicalStage(toRaw);
  if (to === from) return [];
  if (to === LOSS_ID || isSkip(funnel, to)) return [to];
  const toPos = position(funnel, to);
  const base = isSkip(funnel, from) && anchor ? anchor : from;
  const basePos = position(funnel, base);
  if (toPos === null || basePos === null || toPos <= basePos) return [to];
  const mids = activeStages(funnel)
    .filter((s, i) => i > basePos && i < toPos && !s.skip)
    .map((s) => s.id);
  return [...mids, to];
}

export interface StageLog { content: string; createdAt: Date | string }

export interface Replay {
  visited: Set<string>;   // every stage the lead counts as having passed
  anchor: string | null;  // last regular (non-обхідна) active stage it stood on
  order: string[];        // visited stages in the order they were reached
  at: Map<string, number>; // when each stage was reached first (ms)
}

// Replays the status history of a lead under the rules above.
// createdAt — when the lead was created (the time of the stages it was created on; default = the first log).
export function replayStages(funnel: Funnel, current: string, logs: StageLog[], createdAt?: Date | string | null): Replay {
  const changes = logs
    .map((l) => ({ m: STATUS_CHANGE_RE.exec(l.content), c: CREATED_RE.exec(l.content), at: new Date(l.createdAt).getTime() }))
    .filter((x) => x.m || x.c)
    .sort((a, b) => a.at - b.at);

  const visited = new Set<string>();
  const order: string[] = [];
  const at = new Map<string, number>();
  let anchor: string | null = null;
  let t = createdAt ? new Date(createdAt).getTime() : changes[0]?.at ?? 0;
  const visit = (id: string) => {
    if (!visited.has(id)) { visited.add(id); order.push(id); at.set(id, t); }
    const st = funnel.stages.find((s) => s.id === id);
    if (st && st.kind === "active" && !st.skip) anchor = id;
  };

  const created = changes.find((x) => x.c)?.c?.[1];
  const firstChange = changes.find((x) => x.m)?.m;
  const initial = canonicalStage(created ?? firstChange?.[1] ?? current);

  // Creation: a lead created on a later stage passed the earlier ones.
  const first = activeStages(funnel)[0]?.id;
  if (first && initial !== LOSS_ID && !isSkip(funnel, initial)) {
    visit(first);
    for (const s of stepPath(funnel, first, initial)) visit(s);
  } else {
    if (first) visit(first);
    visit(initial);
  }

  let cur = initial;
  for (const x of changes) {
    if (!x.m) continue;
    t = x.at;
    const from = canonicalStage(x.m[1]);
    const to = canonicalStage(x.m[2]);
    for (const s of stepPath(funnel, from, to, anchor)) visit(s);
    cur = to;
  }
  const now = canonicalStage(current);
  if (now !== cur) for (const s of stepPath(funnel, cur, now, anchor)) visit(s);
  return { visited, anchor, order, at };
}

// Activity texts to log for a move (one «Статус змінено: A → B» per passed stage).
export function statusChangeContents(funnel: Funnel, from: string, to: string, anchor: string | null): string[] {
  const path = stepPath(funnel, from, to, anchor);
  if (!path.length) return [];
  const out: string[] = [];
  let prev = from;
  for (const s of path) {
    // the last step keeps the exact target code that was saved on the lead
    const target = s === path[path.length - 1] ? to : s;
    out.push(`Статус змінено: ${prev} → ${target}`);
    prev = target;
  }
  return out;
}
