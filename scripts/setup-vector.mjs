/**
 * Sets up pgvector extension, embedding column, and search_vector column
 * on the knowledge_chunks table.
 *
 * Usage:
 *   node scripts/setup-vector.mjs              — full setup (after prisma db push)
 *   node scripts/setup-vector.mjs --pre-push   — drop search_vector before prisma db push
 *
 * The search_vector column is GENERATED ALWAYS AS ... STORED, which Prisma
 * cannot manage. We drop it before `prisma db push` so Prisma doesn't try
 * to alter it, then recreate it after push.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const isPrePush = process.argv.includes("--pre-push")

async function prePush() {
  try {
    // Drop the generated search_vector column so prisma db push doesn't choke on it
    await prisma.$executeRawUnsafe(`
      ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS search_vector
    `)
    console.log("[setup-vector] Dropped search_vector column for prisma db push")
  } catch (error) {
    // Table might not exist yet on first deploy — that's fine
    console.log("[setup-vector] pre-push: nothing to drop (table may not exist yet)")
  }
}

async function bootstrapFormInstances() {
  // Defensive bootstrap for the form_instances table.
  //
  // Runs against the runtime DATABASE_URL (via Prisma client), unlike
  // `prisma migrate deploy` which uses DIRECT_DATABASE_URL. On Vercel +
  // Neon setups where those URLs point to different branches, migrations
  // can land on one branch while the runtime queries hit another. This
  // makes the form_instances table self-healing: if it's missing on the
  // branch the runtime uses, we create it here on every build.
  //
  // Every operation is idempotent (IF NOT EXISTS / DO + pg_constraint).
  // No-op when the table already exists with the right shape.
  try {
    await prisma.$executeRawUnsafe(`
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
      )
    `)
    // If the table already existed but was missing valuesMeta (the column we
    // added in 20260428_form_instance_values_meta), this catches up that case
    // when migrate deploy applied to a different DB.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "form_instances"
        ADD COLUMN IF NOT EXISTS "valuesMeta" JSONB NOT NULL DEFAULT '{}'::jsonb
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "form_instances_caseId_idx" ON "form_instances"("caseId")
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "form_instances_createdById_idx" ON "form_instances"("createdById")
    `)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'form_instances_caseId_fkey'
        ) THEN
          ALTER TABLE "form_instances"
            ADD CONSTRAINT "form_instances_caseId_fkey"
            FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'form_instances_createdById_fkey'
        ) THEN
          ALTER TABLE "form_instances"
            ADD CONSTRAINT "form_instances_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
        END IF;
      END $$
    `)
    console.log("[setup-vector] form_instances table bootstrapped (or already present)")
  } catch (error) {
    // Don't fail the build — log and continue. The runtime error will
    // surface clearly in /api/forms responses if this didn't work.
    console.error("[setup-vector] form_instances bootstrap failed:", error.message)
  }
}

async function bootstrapUserPractitionerFields() {
  // Defensive bootstrap for the new practitioner-credential / firm-address
  // columns on users. Same DB-branch-mismatch concern as form_instances:
  // the migration may run against a different branch than the runtime.
  try {
    const cols = [
      ["cafNumber",    "TEXT"],
      ["ptin",         "TEXT"],
      ["phone",        "TEXT"],
      ["jurisdiction", "TEXT"],
      ["firmName",     "TEXT"],
      ["firmAddress",  "TEXT"],
      ["firmCity",     "TEXT"],
      ["firmState",    "TEXT"],
      ["firmZip",      "TEXT"],
      ["firmPhone",    "TEXT"],
      ["firmFax",      "TEXT"],
    ]
    for (const [name, type] of cols) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${name}" ${type}`
      )
    }
    console.log("[setup-vector] users practitioner columns bootstrapped (or already present)")
  } catch (error) {
    console.error("[setup-vector] users practitioner bootstrap failed:", error.message)
  }
}

async function fullSetup() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`)
    console.log("[setup-vector] pgvector extension enabled")

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'
        ) THEN
          ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536);
        END IF;
      END $$;
    `)
    console.log("[setup-vector] embedding column ready")

    // Recreate the generated tsvector column for full-text search
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'knowledge_chunks' AND column_name = 'search_vector'
        ) THEN
          ALTER TABLE knowledge_chunks ADD COLUMN search_vector tsvector
          GENERATED ALWAYS AS (
            to_tsvector('english', content || ' ' || COALESCE("sectionHeader", ''))
          ) STORED;
          CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts
          ON knowledge_chunks USING GIN (search_vector);
        END IF;
      END $$;
    `)
    console.log("[setup-vector] search_vector column ready")
  } catch (error) {
    console.error("[setup-vector] Warning:", error.message)
    // Don't fail the build — embeddings are optional, full-text search still works
  }
}

async function main() {
  try {
    if (isPrePush) {
      await prePush()
    } else {
      await fullSetup()
      await bootstrapFormInstances()
      await bootstrapUserPractitionerFields()
    }
  } finally {
    await prisma.$disconnect()
  }
}

main()
