-- Bootstrap form_instances on databases that pre-date the Form Builder V2 schema.
--
-- Production was originally seeded via `prisma db push` after form_instances
-- was added to schema.prisma. Preview Neon branches that were branched before
-- that point (or any DB that only ever ran `prisma migrate deploy`) lack the
-- table entirely, breaking every prisma.formInstance.* call once the wizard
-- tries to create or list a form (P2021).
--
-- All operations are idempotent so this migration is safe on any database
-- state:
--   * CREATE TABLE IF NOT EXISTS — no-op when the table is present
--   * CREATE INDEX IF NOT EXISTS — same
--   * Foreign-key constraints wrapped in DO blocks that check pg_constraint
--     before adding, so re-running against a DB where the FKs exist is a
--     no-op
--
-- This migration runs *after* 20260428_form_instance_values_meta in lexical
-- order. On a DB where form_instances already existed, the prior migration
-- already added valuesMeta — this migration's CREATE TABLE is skipped, so
-- everything stays correct. On a DB that lacked form_instances, the prior
-- migration was a no-op (ALTER TABLE IF EXISTS) and this migration creates
-- the table with valuesMeta declared inline.

CREATE TABLE IF NOT EXISTS "form_instances" (
    "id" TEXT NOT NULL,
    "formNumber" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'unknown',
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "values" JSONB NOT NULL DEFAULT '{}',
    "valuesMeta" JSONB NOT NULL DEFAULT '{}',
    "completedSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "form_instances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "form_instances_caseId_idx" ON "form_instances"("caseId");
CREATE INDEX IF NOT EXISTS "form_instances_createdById_idx" ON "form_instances"("createdById");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'form_instances_caseId_fkey'
    ) THEN
        ALTER TABLE "form_instances"
            ADD CONSTRAINT "form_instances_caseId_fkey"
            FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'form_instances_createdById_fkey'
    ) THEN
        ALTER TABLE "form_instances"
            ADD CONSTRAINT "form_instances_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    END IF;
END $$;
