-- Convert Lead.status from LeadStatus enum to plain TEXT
-- Preserves all existing values (NEW, CONTACTED, NEGOTIATION, WON, LOST)

ALTER TABLE "Lead" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW_LEAD';

DROP TYPE IF EXISTS "LeadStatus";
