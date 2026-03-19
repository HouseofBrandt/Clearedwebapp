/**
 * Sets up pgvector extension and embedding column on knowledge_chunks table.
 * Runs during build after `prisma db push` to ensure the column exists.
 * Safe to run multiple times (idempotent).
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
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
  } catch (error) {
    console.error("[setup-vector] Warning:", error.message)
    // Don't fail the build — embeddings are optional, full-text search still works
  } finally {
    await prisma.$disconnect()
  }
}

main()
