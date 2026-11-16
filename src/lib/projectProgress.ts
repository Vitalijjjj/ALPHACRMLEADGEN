import { activeStages, getFunnel, type CrmSettings } from "@/lib/crmSettings";
import { rulesForStage } from "@/lib/taskAutomation";

// How far a project is done, %. Counted only over the WORKING stages — from «Брифінг» on
// (Новий проєкт, Передоплата and обхідні like «Не відповідає» don't count).
// Every stage weighs as many parts as it has automatic tasks (at least one): a stage with 2 tasks = 2 parts.
// Stages behind the deal are done; on the current one — its ticked tasks. «Завершення» (win) = 100%.
export interface Progress { pct: number; done: number; total: number }

export function projectProgress(
  settings: CrmSettings,
  deal: { status: string; funnelId: string | null; doneHere?: number },
): Progress | null {
  const funnel = getFunnel(settings, deal.funnelId);
  const stage = funnel.stages.find((s) => s.id === deal.status);
  if (stage?.kind === "loss") return null;
  const act = activeStages(funnel);
  const start = Math.max(0, act.findIndex((s) => /^бриф/i.test(s.label.trim())));
  const work = act.slice(start).filter((s) => !s.skip);
  const parts = (id: string) => Math.max(1, rulesForStage(settings.tasks, settings.funnels, funnel, id).reduce((n, r) => n + r.steps.length, 0));
  const total = work.reduce((n, s) => n + parts(s.id), 0);
  if (!total) return null;
  if (stage?.kind === "win") return { pct: 100, done: total, total };
  const at = act.findIndex((s) => s.id === deal.status);
  let done = 0;
  for (const s of work) {
    const i = act.findIndex((x) => x.id === s.id);
    if (i < at) done += parts(s.id);
    else if (s.id === deal.status) done += Math.min(parts(s.id), deal.doneHere ?? 0);
  }
  return { pct: Math.round((done / total) * 100), done, total };
}
