import { prisma } from "@/lib/db"

let _vectorReady: boolean | null = null

/**
 * Ensures pgvector extension and embedding column exist on knowledge_chunks.
 * Safe to call multiple times — no-ops after first successful run.
 */
export async function ensureVectorColumn(): Promise<boolean> {
  if (_vectorReady === true) return true

  try {
    // Enable pgvector extension (Neon supports this)
    await prisma.$executeRawUnsafe(
      `CREATE EXTENSION IF NOT EXISTS vector`
    )

    // Add embedding column if it doesn't exist
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

    _vectorReady = true
    console.log("[Knowledge] Vector column ready")
    return true
  } catch (error: any) {
    console.error("[Knowledge] Failed to set up vector column:", error.message)
    _vectorReady = false
    return false
  }
}
