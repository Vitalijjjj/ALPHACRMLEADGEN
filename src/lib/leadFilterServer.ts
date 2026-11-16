import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { statusMatchValues } from "@/lib/leadOptions";
import type { FilterQuery } from "@/lib/leadFilter";

const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });

// Ids of leads whose phone contains these digits, ignoring spaces/dashes/brackets in the stored value
// (old leads may have phones like "+38 067 123 45 67").
async function phoneDigitIds(digits: string): Promise<string[]> {
  if (digits.length < 3) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Lead"
    WHERE regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') LIKE ${"%" + digits + "%"}`;
  return rows.map((r) => r.id);
}

// Free-text search over every text field of a lead (+ phone by digits).
export async function searchWhere(search: string): Promise<Prisma.LeadWhereInput | null> {
  const s = search.trim();
  if (!s) return null;
  // «#5» → exactly lead number 5
  const byNumber = /^#\d{1,9}$/.test(s) ? parseInt(s.slice(1), 10) : null;
  if (byNumber) return { number: byNumber };
  const digits = s.replace(/\D/g, "");
  const ids = digits.length >= 3 && digits.length >= s.replace(/\s/g, "").length - 1 ? await phoneDigitIds(digits) : [];
  return {
    OR: [
      { name: ci(s) },
      { projectName: ci(s) },
      { payer: ci(s) },
      { phone: ci(s) },
      { instagram: ci(s.replace(/^@/, "")) },
      { telegram: ci(s.replace(/^@/, "")) },
      { email: ci(s) },
      { niche: ci(s) },
      { geo: ci(s) },
      { comment: ci(s) },
      { source: ci(s) },
      { sourceDetail: ci(s) },
      { service: ci(s) },
      { messenger: ci(s) },
      ...(ids.length ? [{ id: { in: ids } }] : []),
      ...(/^\d{1,9}$/.test(s) ? [{ number: parseInt(s, 10) }] : []),
    ],
  };
}

const WON_VALUES = statusMatchValues("WON");
const LOST_VALUES = statusMatchValues("LOST");
const CLOSED_STATUSES = [...WON_VALUES, ...LOST_VALUES];

// Text fields: filter key → Lead column (contains, case-insensitive).
const TEXT_COLUMNS: Record<string, "name" | "email" | "niche" | "geo" | "comment" | "sourceDetail" | "siteStructure" | "languages" | "projectDeadline"> = {
  name: "name", email: "email", niche: "niche", geo: "geo", comment: "comment",
  campaign: "sourceDetail", siteStructure: "siteStructure", languages: "languages", projectDeadline: "projectDeadline",
};
// Multi-select fields with exact values: filter key → Lead column.
const MULTI_COLUMNS: Record<string, "service" | "messenger" | "paymentSystem" | "pushStage" | "calendarStatus"> = {
  services: "service", messengers: "messenger", paymentSystems: "paymentSystem", pushStages: "pushStage", calendarStatuses: "calendarStatus",
};
// Date fields: filter key → Lead column ("closed" is special, see below).
const DATE_COLUMNS: Record<string, "createdAt" | "updatedAt" | "pushAt" | "calendarAt" | "remindAt"> = {
  created: "createdAt", updated: "updatedAt", pushAt: "pushAt", calendarAt: "calendarAt", remindAt: "remindAt",
};

const toDates = (r: { gte?: string; lte?: string }) => ({
  ...(r.gte ? { gte: new Date(r.gte) } : {}),
  ...(r.lte ? { lte: new Date(r.lte) } : {}),
});

// Filter panel → list of Prisma conditions (all must match).
export async function buildFilterWhere(q: FilterQuery): Promise<Prisma.LeadWhereInput[]> {
  const and: Prisma.LeadWhereInput[] = [];

  if (Array.isArray(q.statuses)) and.push({ status: { in: q.statuses.flatMap(statusMatchValues) } });

  for (const [key, raw] of Object.entries(q.text ?? {})) {
    const v = String(raw).trim();
    if (!v) continue;
    if (TEXT_COLUMNS[key]) and.push({ [TEXT_COLUMNS[key]]: ci(v) });
    else if (key === "telegram") and.push({ telegram: ci(v.replace(/^@/, "")) });
    else if (key === "instagram") and.push({ instagram: ci(v.replace(/^@/, "")) });
    else if (key === "tags") and.push({ tags: { has: v } });
    else if (key === "phone") {
      const ids = await phoneDigitIds(v.replace(/\D/g, ""));
      and.push({ OR: [{ phone: ci(v) }, ...(ids.length ? [{ id: { in: ids } }] : [])] });
    }
  }

  for (const [key, vals] of Object.entries(q.multi ?? {})) {
    if (!Array.isArray(vals) || !vals.length) continue;
    if (MULTI_COLUMNS[key]) and.push({ [MULTI_COLUMNS[key]]: { in: vals } });
    else if (key === "sources") and.push({ OR: vals.map((v) => ({ source: { equals: v, mode: "insensitive" as const } })) });
    else if (key === "usedServices") and.push({ usedServices: { hasSome: vals } });
    // Old loss leads keep the reason in the status itself (e.g. TOO_EXPENSIVE) — match both.
    else if (key === "reasons") and.push({ OR: [{ closeReason: { in: vals } }, { closeReason: null, status: { in: vals } }] });
  }

  for (const [key, val] of Object.entries(q.bool ?? {})) {
    if (key === "hasExtraLang") and.push({ hasExtraLang: !!val });
    if (key === "hasTasks") and.push(val ? { tasks: { some: {} } } : { tasks: { none: {} } });
  }

  for (const [key, r] of Object.entries(q.dates ?? {})) {
    if (!r || (!r.gte && !r.lte)) continue;
    if (DATE_COLUMNS[key]) and.push({ [DATE_COLUMNS[key]]: toDates(r) });
    // Close date: leads closed before the field existed have no closedAt → use their last update.
    else if (key === "closed") and.push({
      OR: [
        { closedAt: toDates(r) },
        { closedAt: null, status: { in: CLOSED_STATUSES }, updatedAt: toDates(r) },
      ],
    });
    // Win / loss date = close date of leads that are on the win / loss stage
    else if (key === "won" || key === "lost") {
      const statuses = key === "won" ? WON_VALUES : LOST_VALUES;
      and.push({
        status: { in: statuses },
        OR: [{ closedAt: toDates(r) }, { closedAt: null, updatedAt: toDates(r) }],
      });
    }
  }

  if (q.amount) {
    const { op, from, to } = q.amount;
    if (op === "eq" && from !== undefined) and.push({ amount: from });
    if (op === "gt" && from !== undefined) and.push({ amount: { gt: from } });
    if (op === "lt" && from !== undefined) and.push({ amount: { lt: from } });
    if (op === "range" && (from !== undefined || to !== undefined))
      and.push({ amount: { ...(from !== undefined ? { gte: from } : {}), ...(to !== undefined ? { lte: to } : {}) } });
  }

  return and;
}

export function parseFilterQuery(raw: string | null): FilterQuery | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as FilterQuery) : null;
  } catch {
    return null;
  }
}
