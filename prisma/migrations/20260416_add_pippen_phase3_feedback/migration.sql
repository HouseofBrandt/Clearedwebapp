-- Migration: Pippen Phase 3 — feedback loop
-- Generated: 2026-04-16
--
-- Additions only (no column drops, no data loss). All new columns have
-- safe defaults so existing rows pass NOT NULL constraints without
-- backfill. Safe to run against production.

-- ============================================================
-- CanonicalAuthority: per-authority review-action scoring
-- ============================================================

ALTER TABLE "canonical_authorities"
  ADD COLUMN IF NOT EXISTS "practitionerScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "lastCitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "timesCited" INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- SourceArtifact: upstream quality multiplier used by retrieval
-- ============================================================

ALTER TABLE "source_artifacts"
  ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- ============================================================
-- KnowledgeDocument: FK back to SourceArtifact so retrieval can JOIN
-- source_artifacts.qualityScore cheaply instead of regex-parsing tags
-- ============================================================

ALTER TABLE "knowledge_documents"
  ADD COLUMN IF NOT EXISTS "sourceArtifactId" TEXT;

DO $$ BEGIN
  ALTER TABLE "knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_sourceArtifactId_fkey"
    FOREIGN KEY ("sourceArtifactId") REFERENCES "source_artifacts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "knowledge_documents_sourceArtifactId_idx"
  ON "knowledge_documents"("sourceArtifactId");

-- ============================================================
-- HarvestPreference: practitioner-tunable (source × issueCategory)
-- weights populated by the "more / less like this" UI
-- ============================================================

CREATE TABLE IF NOT EXISTS "harvest_preferences" (
  "id"            TEXT NOT NULL,
  "sourceId"      TEXT NOT NULL,
  "issueCategory" TEXT NOT NULL,
  "weight"        DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "signalCount"   INTEGER NOT NULL DEFAULT 0,
  "lastSignalAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harvest_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "harvest_preferences_sourceId_issueCategory_key"
  ON "harvest_preferences"("sourceId", "issueCategory");

CREATE INDEX IF NOT EXISTS "harvest_preferences_sourceId_idx"
  ON "harvest_preferences"("sourceId");
