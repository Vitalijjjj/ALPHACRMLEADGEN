import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error"] : [] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Deploys no longer run `prisma db push`, so columns added to the Prisma model
// are provisioned lazily here (once per server instance) before Lead queries.
let ensured: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "calendarAt" TIMESTAMP(3)`);
      await db.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "calendarStatus" TEXT`);
    })().catch((e) => {
      ensured = null; // retry on next call
      throw e;
    });
  }
  return ensured;
}
