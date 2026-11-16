import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFunnel, type CrmSettings, type TransferProcess } from "@/lib/crmSettings";
import { computeDue, nextStageIn, rulesForStage, yesStageIn, type AutoRule, type AutoStep, type TaskPrompt } from "@/lib/taskAutomation";

type Client = typeof db | Prisma.TransactionClient;

interface LeadRef {
  id: string;
  status: string;
  funnelId: string | null;
  kpAt?: Date | null;
}

// Automatic tasks go to whoever had the latest task of the lead, otherwise to the default person.
async function pickAssignee(client: Client, settings: CrmSettings, leadId: string): Promise<string | null> {
  const last = await client.task.findFirst({
    where: { leadId, assignee: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { assignee: true },
  });
  return last?.assignee ?? (settings.tasks.defaultAssignee || null);
}

function findRule(settings: CrmSettings, id: string | null): AutoRule | null {
  return id ? settings.tasks.rules.find((r) => r.id === id) ?? null : null;
}

// The step of an automatic task that runs a business process (matched by the task title inside its rule).
export function processStepOf(settings: CrmSettings, task: { autoRuleId: string | null; title: string }): { step: AutoStep; process: TransferProcess; ruleId: string } | null {
  const rule = findRule(settings, task.autoRuleId);
  const step = rule?.steps.find((s) => s.title === task.title);
  const process = step?.process ? settings.processes.find((p) => p.id === step.process) : undefined;
  return rule && step && process ? { step, process, ruleId: rule.id } : null;
}

// Called after a lead got onto a stage (moved, created, transferred):
// removes unfinished automatic tasks of other stages and creates the tasks of this stage.
export async function syncStageTasks(client: Client, settings: CrmSettings, lead: LeadRef) {
  await client.task.deleteMany({
    where: { leadId: lead.id, autoRuleId: { not: null }, status: { not: "DONE" }, NOT: { autoStage: lead.status } },
  });

  const funnel = getFunnel(settings, lead.funnelId);
  const rules = rulesForStage(settings.tasks, settings.funnels, funnel, lead.status);
  if (!rules.length) return;

  const tz = settings.tasks.timezone;
  const assignee = await pickAssignee(client, settings, lead.id);
  const created: string[] = [];
  for (const rule of rules) {
    // already has planned tasks of this rule (e.g. the stage did not really change) → leave them
    const open = await client.task.count({
      where: { leadId: lead.id, autoRuleId: rule.id, autoStage: lead.status, status: { not: "DONE" } },
    });
    if (open) continue;
    let base = new Date();
    const data = rule.steps.map((s) => {
      const due = computeDue(s.when, base, tz, lead.kpAt ?? null);
      base = due;
      return {
        title: s.title,
        priority: s.priority,
        deadline: due,
        status: "TODO" as const,
        assignee: s.assignee || assignee,
        leadId: lead.id,
        autoRuleId: rule.id,
        // "silent" = the question is not asked after this task
        autoKind: s.when.mode === "meeting" ? "meeting" : s.ask ? "step" : "silent",
        autoStage: lead.status,
      };
    });
    await client.task.createMany({ data });
    created.push(...data.map((d) => d.title));
  }
  if (created.length) {
    await client.activity.create({
      data: {
        leadId: lead.id,
        type: "TASK_CREATED",
        content: created.length === 1
          ? `Автозадача: ${created[0]}`
          : `Автозадачі (${created.length}):\n${created.map((t) => `• ${t}`).join("\n")}`,
      },
    });
  }
}

// «Дата і час КП» changed → the planned «Провести КП» tasks move to that time.
export async function syncMeetingTasks(client: Client, leadId: string, kpAt: Date | null) {
  if (!kpAt) return;
  await client.task.updateMany({
    where: { leadId, autoKind: "meeting", status: { not: "DONE" } },
    data: { deadline: kpAt },
  });
}

// What to ask after an automatic task was ticked done (only while the lead is still on that stage).
export async function promptForDoneTask(
  settings: CrmSettings,
  task: { autoRuleId: string | null; autoKind: string | null; autoStage: string | null; leadId: string | null }
): Promise<TaskPrompt | null> {
  const rule = findRule(settings, task.autoRuleId);
  if (!rule || !task.leadId) return null;
  const lead = await db.lead.findUnique({ where: { id: task.leadId }, select: { status: true, funnelId: true } });
  if (!lead || lead.status !== task.autoStage) return null;
  const funnel = getFunnel(settings, lead.funnelId);
  if (task.autoKind === "final") {
    const reason = funnel.loss.reasons.find((r) => r.id === rule.lossReason);
    return { kind: "loss", reasonId: rule.lossReason, reasonLabel: reason?.label ?? "", ruleId: rule.id };
  }
  if (rule.question.trim() && task.autoKind !== "silent") {
    return {
      kind: "question", text: rule.question, yesLabel: rule.yesLabel, noLabel: rule.noLabel,
      yesStageId: (rule.offerNext ? nextStageIn(settings.funnels, rule, funnel, lead.status) : yesStageIn(settings.funnels, rule, funnel))?.id ?? null,
      ruleId: rule.id,
    };
  }
  if (!rule.offerNext || rule.question.trim()) return null;
  // every task of this stage is done → offer the next stage
  const open = await db.task.count({
    where: { leadId: task.leadId, autoRuleId: rule.id, autoStage: lead.status, status: { not: "DONE" } },
  });
  if (open) return null;
  return { kind: "next", nextStageId: nextStageIn(settings.funnels, rule, funnel, lead.status)?.id ?? null, ruleId: rule.id };
}

// «Ні» on the question: the next planned step stays; when nothing is planned — repeat / «перекинути в програш».
export async function answerNo(settings: CrmSettings, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  const rule = findRule(settings, task?.autoRuleId ?? null);
  if (!task || !rule || !task.leadId) return { next: null, created: null };
  const lead = await db.lead.findUnique({ where: { id: task.leadId }, select: { id: true, status: true } });
  if (!lead || lead.status !== task.autoStage) return { next: null, created: null };

  const next = await db.task.findFirst({
    where: { leadId: lead.id, autoRuleId: rule.id, autoStage: lead.status, status: { not: "DONE" } },
    orderBy: { deadline: "asc" },
  });
  if (next) return { next, created: null };
  if (rule.onNo === "nothing" || task.autoKind === "final") return { next: null, created: null };

  // «{n}» in the title → round number (Круг правок №2, №3 …)
  const round = (await db.task.count({ where: { leadId: lead.id, autoRuleId: rule.id, autoStage: lead.status } })) + 1;
  const created = await db.task.create({
    data: {
      title: rule.repeat.title.replace(/\{n\}/g, String(round)),
      priority: rule.repeat.priority,
      deadline: computeDue(rule.repeat.when, new Date(), settings.tasks.timezone),
      status: "TODO",
      assignee: rule.repeat.assignee || task.assignee || (settings.tasks.defaultAssignee || null),
      leadId: lead.id,
      autoRuleId: rule.id,
      autoKind: rule.onNo === "loss" ? "final" : "repeat",
      autoStage: lead.status,
    },
  });
  await db.activity.create({ data: { leadId: lead.id, type: "TASK_CREATED", content: `Автозадача: ${created.title}` } });
  return { next: null, created };
}
