import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activeStages, getFunnel, type CrmSettings } from "@/lib/crmSettings";
import { replayStages, statusChangeContents } from "@/lib/stageFlow";

type Client = typeof db | Prisma.TransactionClient;

// History of a NEW lead. Created right on a later stage (e.g. «Інвойс») → it is logged as created on the
// first stage of its funnel and then passed every stage up to it, one by one (обхідні like НДЗ are skipped),
// so the history and the stats look as if the lead went through the whole funnel.
export async function logCreation(
  client: Client,
  settings: CrmSettings,
  lead: { id: string; status: string; funnelId: string | null; createdAt: Date }
) {
  const funnel = getFunnel(settings, lead.funnelId);
  const first = activeStages(funnel)[0]?.id;
  const chain = first && first !== lead.status ? statusChangeContents(funnel, first, lead.status, null) : [];
  // only a real forward path (to «Програш» or onto an обхідна stage nothing is passed)
  const passes = chain.length > 1 || (chain.length === 1 && funnel.stages.find((s) => s.id === lead.status)?.kind === "win");
  const base = lead.createdAt.getTime();
  const contents = passes ? [`Лід створено зі статусом: ${first}`, ...chain] : [`Лід створено зі статусом: ${lead.status}`];
  await client.activity.createMany({
    data: contents.map((content, i) => ({ leadId: lead.id, type: "STATUS_CHANGE" as const, content, createdAt: new Date(base + i) })),
  });
}

// Writes the status history of a move: one «Статус змінено: A → B» per passed stage
// (Новий лід → Інвойс logs every stage in between, except обхідні like НДЗ).
export async function logStatusChange(
  client: Client,
  settings: CrmSettings,
  lead: { id: string; status: string; funnelId: string | null },
  to: string
) {
  if (lead.status === to) return;
  const funnel = getFunnel(settings, lead.funnelId);
  const logs = await client.activity.findMany({
    where: { leadId: lead.id, type: "STATUS_CHANGE" },
    select: { content: true, createdAt: true },
  });
  const { anchor } = replayStages(funnel, lead.status, logs);
  const contents = statusChangeContents(funnel, lead.status, to, anchor);
  const base = Date.now();
  // 1 ms apart so the order is kept
  await client.activity.createMany({
    data: contents.map((content, i) => ({ leadId: lead.id, type: "STATUS_CHANGE" as const, content, createdAt: new Date(base + i) })),
  });
}
