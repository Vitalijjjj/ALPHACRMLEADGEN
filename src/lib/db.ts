import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error"] : [] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Sequential lead number (#1, #2…). Existing leads get numbers by creation date; a sequence hands out
// the next ones, so a number of a deleted lead is never reused. Runs under an advisory lock so that
// two server instances starting at once do not number the same rows.
async function ensureLeadNumbers() {
  await db.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "Lead_number_seq"`);
  await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "number" INTEGER`);
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(724501)`);
    await tx.$executeRawUnsafe(`
      WITH base AS (SELECT COALESCE(MAX("number"), 0) AS m FROM "Lead"),
           ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn FROM "Lead" WHERE "number" IS NULL)
      UPDATE "Lead" l SET "number" = base.m + ranked.rn FROM ranked, base WHERE l.id = ranked.id`);
    await tx.$executeRawUnsafe(`
      SELECT setval('"Lead_number_seq"', GREATEST(
        (SELECT COALESCE(MAX("number"), 0) FROM "Lead"),
        (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM "Lead_number_seq")
      ) + 1, false)`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Lead" ALTER COLUMN "number" SET DEFAULT nextval('"Lead_number_seq"')`);
    await tx.$executeRawUnsafe(`ALTER SEQUENCE "Lead_number_seq" OWNED BY "Lead"."number"`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Lead" ALTER COLUMN "number" SET NOT NULL`);
    await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Lead_number_key" ON "Lead"("number")`);
  });
}

// Closed leads (won / lost, incl. old loss codes) without a close date get one: the moment they were moved
// to that status (from the history), otherwise their last update. Sales are counted on this date.
const CLOSED_CODES = ["WON", "LOST", "NOT_INTERESTED", "COMPETITORS", "DUPLICATE", "UNREACHABLE", "NOT_TARGET", "TOO_EXPENSIVE"];
async function backfillClosedAt() {
  const codes = CLOSED_CODES.map((c) => `'${c}'`).join(",");
  await db.$executeRawUnsafe(`
    UPDATE "Lead" l SET "closedAt" = COALESCE(
      (SELECT MAX(a."createdAt") FROM "Activity" a
        WHERE a."leadId" = l.id AND a.type = 'STATUS_CHANGE' AND a.content LIKE '%→ ' || l.status),
      l."updatedAt")
    WHERE l."closedAt" IS NULL AND l.status IN (${codes})`);
}

// Highest lead number ever handed out (to tell "deleted" from "never existed").
export async function lastLeadNumber(): Promise<number> {
  await ensureSchema();
  const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END AS n FROM "Lead_number_seq"`
  );
  return Number(rows[0]?.n ?? 0);
}

// Deploys no longer run `prisma db push`, so columns added to the Prisma model
// are provisioned lazily here (once per server instance) before Lead queries.
let ensured: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "calendarAt" TIMESTAMP(3)`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "projectName" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "payer" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "links" TEXT[] NOT NULL DEFAULT '{}'`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "calendarStatus" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "funnelId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "closeReason" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3)`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "legacyStatus" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "customFields" JSONB NOT NULL DEFAULT '{}'`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EUR'`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sourceLeadId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sourceLeadNumber" INTEGER`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "kpAt" TIMESTAMP(3)`);
      await db.$executeRawUnsafe(`ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "caseUrl" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "partnerId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)`);
      await db.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "autoRuleId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "autoKind" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "autoStage" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)`);
      // Phones are stored without spaces / brackets / dashes (copy-paste into Telegram, WhatsApp works)
      await db.$executeRawUnsafe(`UPDATE "Lead" SET "phone" = CASE WHEN btrim("phone") LIKE '+%' THEN '+' ELSE '' END || regexp_replace("phone", '\\D', '', 'g') WHERE "phone" ~ '[^0-9+]'`);
      // «Кейси» added by hand (no project yet) — linking moves the url into Lead.caseUrl
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CaseLink" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "url" TEXT NOT NULL,
        "title" TEXT,
        "niche" TEXT,
        "geo" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "roleId" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PaymentStage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "idx" INTEGER NOT NULL DEFAULT 0,
        "title" TEXT,
        "amount" DOUBLE PRECISION NOT NULL,
        "dueDate" TIMESTAMP(3),
        "paidAt" TIMESTAMP(3),
        "note" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentStage_leadId_idx" ON "PaymentStage"("leadId")`);
      // planned payments without a project + their own currency / payer
      await db.$executeRawUnsafe(`ALTER TABLE "PaymentStage" ALTER COLUMN "leadId" DROP NOT NULL`);
      await db.$executeRawUnsafe(`ALTER TABLE "PaymentStage" ADD COLUMN IF NOT EXISTS "currency" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "PaymentStage" ADD COLUMN IF NOT EXISTS "payer" TEXT`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Transaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" TIMESTAMP(3) NOT NULL,
        "kind" TEXT NOT NULL,
        "amount" DOUBLE PRECISION NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'UAH',
        "rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
        "amountUah" DOUBLE PRECISION NOT NULL,
        "accountId" TEXT NOT NULL,
        "toAccountId" TEXT,
        "leadId" TEXT REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "stageId" TEXT,
        "counterparty" TEXT,
        "comment" TEXT,
        "period" TEXT,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_date_idx" ON "Transaction"("date")`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_leadId_idx" ON "Transaction"("leadId")`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Project" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "client" TEXT,
        "value" DOUBLE PRECISION,
        "note" TEXT,
        "leadId" TEXT REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_leadId_idx" ON "Project"("leadId")`);
      await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'UAH'`);
      await db.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_projectId_idx" ON "Transaction"("projectId")`);
      await db.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "category" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "recurringId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "parentId" TEXT`);
      await db.$executeRawUnsafe(`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "adCampaignId" TEXT`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_adCampaignId_idx" ON "Transaction"("adCampaignId")`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Recurring" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "type" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT,
        "amount" DOUBLE PRECISION NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'UAH',
        "accountId" TEXT NOT NULL,
        "day" INTEGER NOT NULL DEFAULT 10,
        "category" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "note" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`ALTER TABLE "Recurring" ADD COLUMN IF NOT EXISTS "payMode" TEXT NOT NULL DEFAULT 'monthly'`);
      await db.$executeRawUnsafe(`ALTER TABLE "Recurring" ADD COLUMN IF NOT EXISTS "every" TEXT NOT NULL DEFAULT 'month'`);
      await db.$executeRawUnsafe(`ALTER TABLE "Recurring" ADD COLUMN IF NOT EXISTS "month" INTEGER`);
      await db.$executeRawUnsafe(`ALTER TABLE "Recurring" ADD COLUMN IF NOT EXISTS "uahAmount" DOUBLE PRECISION`);
      await ensureLeadNumbers();
      await backfillClosedAt();
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AdCampaign" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "trafficType" TEXT NOT NULL DEFAULT 'Таргет',
        "dailyBudget" DOUBLE PRECISION,
        "totalBudget" DOUBLE PRECISION,
        "startDate" TIMESTAMP(3),
        "endDate" TIMESTAMP(3),
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AdCampaign_name_trafficType_key" ON "AdCampaign"("name", "trafficType")`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Setting" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "value" JSONB NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    })().catch((e) => {
      ensured = null; // retry on next call
      throw e;
    });
  }
  return ensured;
}
