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
    }
  } finally {
    await prisma.$disconnect()
  }
}

main()
