-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "hasExtraLang" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languages" TEXT,
ADD COLUMN     "paymentSystem" TEXT,
ADD COLUMN     "projectDeadline" TEXT,
ADD COLUMN     "pushAt" TIMESTAMP(3),
ADD COLUMN     "pushSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "service" TEXT,
ADD COLUMN     "siteStructure" TEXT,
ADD COLUMN     "usedServices" TEXT[];
