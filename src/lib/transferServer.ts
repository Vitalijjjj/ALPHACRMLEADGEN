import { Prisma, type Lead } from "@prisma/client";
import { db } from "@/lib/db";
import { logCreation, logStatusChange } from "@/lib/stageFlowServer";
import { syncStageTasks } from "@/lib/taskAutomationServer";
import { fieldRule, SIMPLE_BUILTINS, type CrmSettings, type FieldRule, type TransferProcess } from "@/lib/crmSettings";

// Lead columns behind each built-in card field.
const BUILTIN_COLUMNS: Record<string, (keyof Lead)[]> = {
  telegram: ["telegram"], instagram: ["instagram"], email: ["email"], messenger: ["messenger"],
  amount: ["amount", "currency"], service: ["service"], niche: ["niche"], source: ["source", "sourceDetail"], geo: ["geo"],
  comment: ["comment"], siteStructure: ["siteStructure"], paymentSystem: ["paymentSystem"],
  projectDeadline: ["projectDeadline"], extraLang: ["hasExtraLang", "languages"], usedServices: ["usedServices"],
  pushStage: ["pushStage"], pushAt: ["pushAt"], pushComment: ["pushComment"], caseUrl: ["caseUrl"],
};

// Value of a source field as text (for copying into a custom field).
function sourceText(lead: Lead, fieldId: string): unknown {
  if (BUILTIN_COLUMNS[fieldId]) {
    if (fieldId === "usedServices") return lead.usedServices;
    if (fieldId === "extraLang") return lead.hasExtraLang ? lead.languages || "Так" : null;
    if (fieldId === "pushAt") return lead.pushAt?.toISOString() ?? null;
    return lead[BUILTIN_COLUMNS[fieldId][0]] ?? null;
  }
  return (lead.customFields as Record<string, unknown> | null)?.[fieldId] ?? null;
}

// Fixed value typed in the process → value for a built-in column.
function builtinValue(key: string, value: string): unknown {
  if (key === "amount") return value ? parseFloat(value) || null : null;
  if (key === "telegram" || key === "instagram") return value.replace(/^@/, "").trim() || null;
  return value || null;
}

// Fixed value / copied value → value for a custom field of the given type.
function customValue(type: string, v: unknown): unknown {
  if (v === null || v === undefined || v === "") return null;
  if (type === "number") return typeof v === "number" ? v : parseFloat(String(v)) || null;
  if (type === "bool") return v === true || /^(так|yes|true|1)$/i.test(String(v)) ? true : null;
  if (type === "multi") return Array.isArray(v) ? v : String(v).split(",").map((x) => x.trim()).filter(Boolean);
  return Array.isArray(v) ? v.join(", ") : String(v);
}

// notes the CRM writes itself (not comments of people)
const SYSTEM_NOTE = /^(Передано у воронку|Створено передачею|Перенесено у воронку|Справу повернуто|Етапи оплат з ліда|Проєкт створено з «Кейсів»|Коментарі з проєкту)/;

export type TransferResult = { id: string; number: number; target: string; existed?: boolean };

// «Передача у воронку»: a copy of the lead in the target funnel (the original stays).
// `once` — when this lead was already handed over into that funnel, return that deal instead of a second copy.
export async function runTransfer(settings: CrmSettings, process: TransferProcess, lead: Lead, opts: { once?: boolean } = {}): Promise<TransferResult> {
  const source = settings.funnels.find((f) => f.id === process.fromFunnelId)!;
  const target = settings.funnels.find((f) => f.id === process.toFunnelId)!;
  const targetStage = target.stages.find((s) => s.id === process.toStageId) ?? target.stages[0];
  if (opts.once) {
    const was = await db.lead.findFirst({ where: { sourceLeadId: lead.id, funnelId: target.id }, select: { id: true, number: true } });
    if (was) return { ...was, target: target.name, existed: true };
  }
  // Name and phone always go along.
  const data: Prisma.LeadUncheckedCreateInput = {
    name: lead.name,
    phone: lead.phone,
    funnelId: target.id,
    status: targetStage.id,
    closedAt: targetStage.kind !== "active" ? new Date() : null,
    sourceLeadId: lead.id,
    sourceLeadNumber: lead.number,
    // the client stays the same: who we invoice; a repeat inside the same funnel («Клієнт звернувся ще раз») keeps the project
    payer: lead.payer,
    // the project name goes along (Апсейл / Підписка show which project it is)
    projectName: lead.projectName,
  };
  const custom: Record<string, unknown> = {};

  for (const field of target.fields.items) {
    const rule: FieldRule = fieldRule(process, field, source);
    if (rule.mode === "skip") continue;
    if (field.builtin) {
      const cols = BUILTIN_COLUMNS[field.id];
      if (!cols) continue;
      if (rule.mode === "copy") {
        for (const c of cols) (data as Record<string, unknown>)[c] = lead[c];
      } else if (SIMPLE_BUILTINS.has(field.id)) {
        (data as Record<string, unknown>)[cols[0]] = builtinValue(field.id, rule.value);
      }
    } else {
      const v = customValue(field.type, rule.mode === "copy" ? sourceText(lead, rule.from) : rule.value);
      if (v !== null && !(Array.isArray(v) && !v.length)) custom[field.id] = v;
    }
  }
  data.customFields = custom as Prisma.InputJsonValue;

  const created = await db.$transaction(async (tx) => {
    const copy = await tx.lead.create({ data });
    await logCreation(tx, settings, copy);
    await tx.activity.create({
      data: {
        leadId: copy.id,
        type: "NOTE",
        content: `Створено передачею «${process.name}» з воронки «${source.name}» · лід #${lead.number}`,
      },
    });
    // out of a project (Підписка / Апсейл): the project's comments come along as one pinned note
    if (source.payments && !target.payments) {
      const notes = await tx.activity.findMany({ where: { leadId: lead.id, type: "NOTE" }, orderBy: { createdAt: "asc" }, select: { content: true } });
      const own = notes.map((n) => n.content.trim()).filter((c) => c && !SYSTEM_NOTE.test(c));
      if (own.length) {
        await tx.activity.create({ data: { leadId: copy.id, type: "NOTE", content: `Коментарі з проєкту #${lead.number}:\n${own.map((c) => `• ${c}`).join("\n")}` } });
      }
    }
    await tx.activity.create({
      data: {
        leadId: lead.id,
        type: "NOTE",
        content: `Передано у воронку «${target.name}» («${process.name}») · новий лід #${copy.number}`,
      },
    });
    if (process.sourceStageId && process.sourceStageId !== lead.status) {
      const st = source.stages.find((s) => s.id === process.sourceStageId)!;
      await tx.lead.update({
        where: { id: lead.id },
        data: { status: st.id, closedAt: st.kind !== "active" ? new Date() : null, ...(st.kind === "active" ? { closeReason: null } : {}) },
      });
      await logStatusChange(tx, settings, lead, st.id);
      await syncStageTasks(tx, settings, { id: lead.id, status: st.id, funnelId: lead.funnelId, kpAt: lead.kpAt });
    }
    // payment stages planned in the sales deal → the new deal's schedule (only into a funnel with payments)
    if (target.payments && target.id !== source.id) {
      const stages = await tx.paymentStage.findMany({ where: { leadId: lead.id, paidAt: null }, orderBy: [{ idx: "asc" }, { createdAt: "asc" }] });
      if (stages.length) {
        await tx.paymentStage.createMany({
          data: stages.map((st, i) => ({ leadId: copy.id, idx: i, title: st.title, amount: st.amount, dueDate: st.dueDate, note: st.note })),
        });
        await tx.activity.create({ data: { leadId: copy.id, type: "NOTE", content: `Етапи оплат з ліда #${lead.number}: ${stages.length}` } });
      }
    }
    await syncStageTasks(tx, settings, copy);
    return copy;
  });

  return { id: created.id, number: created.number, target: target.name };
}
