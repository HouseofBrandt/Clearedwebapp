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

    // Add search_vector tsvector column for full-text search
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

    // Create approximate nearest neighbor index if enough data exists
    try {
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'knowledge_chunks'
            AND indexname = 'idx_knowledge_chunks_embedding'
          ) THEN
            IF (SELECT count(*) FROM knowledge_chunks WHERE embedding IS NOT NULL) >= 50 THEN
              CREATE INDEX idx_knowledge_chunks_embedding
              ON knowledge_chunks
              USING ivfflat (embedding vector_cosine_ops)
              WITH (lists = 50);
            END IF;
          END IF;
        END $$;
      `)
    } catch (e: any) {
      // Non-fatal — searches still work without the index, just slower
      console.warn("[Knowledge] IVFFlat index creation skipped:", e.message)
    }

    _vectorReady = true
    console.log("[Knowledge] Vector and search_vector columns ready")
    return true
  } catch (error: any) {
    console.error("[Knowledge] Failed to set up vector column:", error.message)
    _vectorReady = false
    return false
  }
}
