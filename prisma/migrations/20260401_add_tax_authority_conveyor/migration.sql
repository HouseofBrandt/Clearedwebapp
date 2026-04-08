-- Migration: Tax Authority Conveyor schema additions
-- Generated: 2026-04-01

-- Enable pgvector extension for embedding columns
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "AuthorityTier" AS ENUM ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'C1', 'C2', 'D1', 'X');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AuthorityStatus" AS ENUM ('CURRENT', 'PROPOSED', 'WITHDRAWN', 'SUPERSEDED', 'ARCHIVED', 'PENDING_REVIEW');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrecedentialStatus" AS ENUM ('BINDING', 'AUTHORITATIVE', 'PRECEDENTIAL', 'NONPRECEDENTIAL', 'INFORMATIONAL', 'INTERNAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SourceRightsProfile" AS ENUM ('PUBLIC_INGEST_OK', 'PUBLIC_LINK_ONLY', 'LICENSE_REQUIRED', 'NO_AUTOMATION', 'HUMAN_SUMMARY_ONLY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChangeSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFORMATIONAL_CHANGE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'FETCHING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'COMPLETE', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PromotionLayer" AS ENUM ('RAW', 'CURATED', 'DISTILLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- 1. source_registry
CREATE TABLE IF NOT EXISTS "source_registry" (
  "id"            TEXT NOT NULL,
  "sourceId"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "endpoint"      TEXT NOT NULL,
  "altEndpoint"   TEXT,
  "format"        TEXT NOT NULL,
  "cadence"       TEXT NOT NULL,
  "rightsProfile" "SourceRightsProfile" NOT NULL,
  "defaultTier"   "AuthorityTier" NOT NULL,
  "parserKey"     TEXT NOT NULL,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "rateLimitMs"   INTEGER NOT NULL DEFAULT 1000,
  "lastFetchedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastErrorAt"   TIMESTAMP(3),
  "lastError"     TEXT,
  "fetchCount"    INTEGER NOT NULL DEFAULT 0,
  "errorCount"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "source_registry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "source_registry_sourceId_key" ON "source_registry"("sourceId");

-- 2. source_artifacts
CREATE TABLE IF NOT EXISTS "source_artifacts" (
  "id"              TEXT NOT NULL,
  "sourceId"        TEXT NOT NULL,
  "sourceUrl"       TEXT NOT NULL,
  "fetchedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "normalizedTitle" TEXT NOT NULL,
  "publicationDate" TIMESTAMP(3),
  "effectiveDate"   TIMESTAMP(3),
  "sourceHash"      TEXT NOT NULL,
  "rawContent"      BYTEA,
  "rawContentPath"  TEXT,
  "contentType"     TEXT NOT NULL,
  "parserStatus"    "IngestionStatus" NOT NULL DEFAULT 'PENDING',
  "parserError"     TEXT,
  "rightsProfile"   "SourceRightsProfile" NOT NULL,
  "authorityTier"   "AuthorityTier" NOT NULL,
  "jurisdiction"    TEXT,
  "metadata"        JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "ingestionRunId"  TEXT,

  CONSTRAINT "source_artifacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "source_artifacts_sourceId_sourceHash_idx" ON "source_artifacts"("sourceId", "sourceHash");
CREATE INDEX IF NOT EXISTS "source_artifacts_sourceId_publicationDate_idx" ON "source_artifacts"("sourceId", "publicationDate");

-- 3. ingestion_runs
CREATE TABLE IF NOT EXISTS "ingestion_runs" (
  "id"           TEXT NOT NULL,
  "sourceId"     TEXT NOT NULL,
  "status"       "IngestionStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"  TIMESTAMP(3),
  "itemsFetched" INTEGER NOT NULL DEFAULT 0,
  "itemsNew"     INTEGER NOT NULL DEFAULT 0,
  "itemsChanged" INTEGER NOT NULL DEFAULT 0,
  "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
  "itemsFailed"  INTEGER NOT NULL DEFAULT 0,
  "errorLog"     TEXT,
  "metadata"     JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ingestion_runs_sourceId_startedAt_idx" ON "ingestion_runs"("sourceId", "startedAt");

-- 4. canonical_authorities
CREATE TABLE IF NOT EXISTS "canonical_authorities" (
  "id"                 TEXT NOT NULL,
  "citationString"     TEXT NOT NULL,
  "normalizedCitation" TEXT NOT NULL,
  "title"              TEXT NOT NULL,
  "authorityTier"      "AuthorityTier" NOT NULL,
  "authorityStatus"    "AuthorityStatus" NOT NULL DEFAULT 'CURRENT',
  "precedentialStatus" "PrecedentialStatus" NOT NULL,
  "jurisdiction"       TEXT,
  "effectiveDate"      TIMESTAMP(3),
  "publicationDate"    TIMESTAMP(3),
  "lastVerifiedAt"     TIMESTAMP(3),
  "supersededById"     TEXT,
  "promotionLayer"     "PromotionLayer" NOT NULL DEFAULT 'RAW',
  "metadata"           JSONB,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "artifactId"         TEXT,

  CONSTRAINT "canonical_authorities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_authorities_citationString_key" ON "canonical_authorities"("citationString");
CREATE INDEX IF NOT EXISTS "canonical_authorities_normalizedCitation_idx" ON "canonical_authorities"("normalizedCitation");
CREATE INDEX IF NOT EXISTS "canonical_authorities_authorityTier_authorityStatus_idx" ON "canonical_authorities"("authorityTier", "authorityStatus");
CREATE INDEX IF NOT EXISTS "canonical_authorities_promotionLayer_idx" ON "canonical_authorities"("promotionLayer");

-- 5. authority_versions
CREATE TABLE IF NOT EXISTS "authority_versions" (
  "id"              TEXT NOT NULL,
  "authorityId"     TEXT NOT NULL,
  "versionNumber"   INTEGER NOT NULL,
  "contentHash"     TEXT NOT NULL,
  "content"         TEXT NOT NULL,
  "effectiveDate"   TIMESTAMP(3),
  "publicationDate" TIMESTAMP(3),
  "changeSeverity"  "ChangeSeverity" NOT NULL,
  "changeSummary"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "authority_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "authority_versions_authorityId_versionNumber_key" ON "authority_versions"("authorityId", "versionNumber");
CREATE INDEX IF NOT EXISTS "authority_versions_authorityId_effectiveDate_idx" ON "authority_versions"("authorityId", "effectiveDate");

-- 6. authority_edges
CREATE TABLE IF NOT EXISTS "authority_edges" (
  "id"           TEXT NOT NULL,
  "fromId"       TEXT NOT NULL,
  "toId"         TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "confidence"   DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "metadata"     JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "authority_edges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "authority_edges_fromId_toId_relationship_key" ON "authority_edges"("fromId", "toId", "relationship");
CREATE INDEX IF NOT EXISTS "authority_edges_fromId_relationship_idx" ON "authority_edges"("fromId", "relationship");
CREATE INDEX IF NOT EXISTS "authority_edges_toId_relationship_idx" ON "authority_edges"("toId", "relationship");

-- 7. authority_chunks (with pgvector embedding)
CREATE TABLE IF NOT EXISTS "authority_chunks" (
  "id"                 TEXT NOT NULL,
  "authorityId"        TEXT NOT NULL,
  "chunkType"          TEXT NOT NULL,
  "chunkIndex"         INTEGER NOT NULL,
  "content"            TEXT NOT NULL,
  "tokenCount"         INTEGER NOT NULL,
  "authorityTier"      "AuthorityTier" NOT NULL,
  "authorityStatus"    "AuthorityStatus" NOT NULL,
  "precedentialStatus" "PrecedentialStatus" NOT NULL,
  "publicationDate"    TIMESTAMP(3),
  "effectiveDate"      TIMESTAMP(3),
  "citationString"     TEXT NOT NULL,
  "parentCitation"     TEXT,
  "jurisdiction"       TEXT,
  "issueTags"          TEXT[],
  "sourceUrl"          TEXT,
  "contentHash"        TEXT NOT NULL,
  "superseded"         BOOLEAN NOT NULL DEFAULT false,
  "embedding"          vector(1536),
  "promotionLayer"     "PromotionLayer" NOT NULL DEFAULT 'RAW',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "authority_chunks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "authority_chunks_authorityTier_authorityStatus_superseded_idx" ON "authority_chunks"("authorityTier", "authorityStatus", "superseded");
CREATE INDEX IF NOT EXISTS "authority_chunks_chunkType_idx" ON "authority_chunks"("chunkType");
CREATE INDEX IF NOT EXISTS "authority_chunks_promotionLayer_idx" ON "authority_chunks"("promotionLayer");

-- 8. knowledge_cards
CREATE TABLE IF NOT EXISTS "knowledge_cards" (
  "id"              TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "issueArea"       TEXT NOT NULL,
  "summary"         TEXT NOT NULL,
  "controllingAuth" TEXT[],
  "persuasiveAuth"  TEXT[],
  "practicalNotes"  TEXT,
  "caveats"         TEXT,
  "lastRebuiltAt"   TIMESTAMP(3) NOT NULL,
  "benchmarkScore"  DOUBLE PRECISION,
  "authorityId"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "knowledge_cards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "knowledge_cards_issueArea_idx" ON "knowledge_cards"("issueArea");

-- 9. issue_clusters
CREATE TABLE IF NOT EXISTS "issue_clusters" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "displayName"      TEXT NOT NULL,
  "description"      TEXT,
  "issueCategory"    TEXT NOT NULL,
  "preferredSources" TEXT[],
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "issue_clusters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "issue_clusters_name_key" ON "issue_clusters"("name");

-- 10. issue_cluster_authorities
CREATE TABLE IF NOT EXISTS "issue_cluster_authorities" (
  "id"             TEXT NOT NULL,
  "clusterId"      TEXT NOT NULL,
  "authorityId"    TEXT NOT NULL,
  "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "issue_cluster_authorities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "issue_cluster_authorities_clusterId_authorityId_key" ON "issue_cluster_authorities"("clusterId", "authorityId");

-- 11. benchmark_questions
CREATE TABLE IF NOT EXISTS "benchmark_questions" (
  "id"                TEXT NOT NULL,
  "question"          TEXT NOT NULL,
  "expectedCitations" TEXT[],
  "expectedTier"      "AuthorityTier",
  "issueClusterId"    TEXT,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "benchmark_questions_pkey" PRIMARY KEY ("id")
);

-- 12. benchmark_runs
CREATE TABLE IF NOT EXISTS "benchmark_runs" (
  "id"                 TEXT NOT NULL,
  "questionId"         TEXT NOT NULL,
  "runDate"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retrievedCitations" TEXT[],
  "citationPrecision"  DOUBLE PRECISION NOT NULL,
  "citationRecall"     DOUBLE PRECISION NOT NULL,
  "topTierMatch"       BOOLEAN NOT NULL,
  "answerQuality"      DOUBLE PRECISION,
  "driftDetected"      BOOLEAN NOT NULL DEFAULT false,
  "rawResponse"        TEXT,
  "metadata"           JSONB,

  CONSTRAINT "benchmark_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "benchmark_runs_questionId_runDate_idx" ON "benchmark_runs"("questionId", "runDate");

-- 13. license_policies
CREATE TABLE IF NOT EXISTS "license_policies" (
  "id"            TEXT NOT NULL,
  "sourceDomain"  TEXT NOT NULL,
  "displayName"   TEXT NOT NULL,
  "rightsProfile" "SourceRightsProfile" NOT NULL,
  "notes"         TEXT,
  "approvedBy"    TEXT,
  "approvedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "license_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "license_policies_sourceDomain_key" ON "license_policies"("sourceDomain");

-- 14. daily_digests
CREATE TABLE IF NOT EXISTS "daily_digests" (
  "id"                 TEXT NOT NULL,
  "digestDate"         TIMESTAMP(3) NOT NULL,
  "newAuthorities"     INTEGER NOT NULL DEFAULT 0,
  "changedAuthorities" INTEGER NOT NULL DEFAULT 0,
  "supersededItems"    INTEGER NOT NULL DEFAULT 0,
  "benchmarkDrifts"    INTEGER NOT NULL DEFAULT 0,
  "knowledgeGaps"      INTEGER NOT NULL DEFAULT 0,
  "summary"            TEXT NOT NULL,
  "details"            JSONB NOT NULL,
  "publishedAt"        TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "daily_digests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_digests_digestDate_key" ON "daily_digests"("digestDate");

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

-- source_artifacts -> source_registry (sourceId)
ALTER TABLE "source_artifacts"
  DROP CONSTRAINT IF EXISTS "source_artifacts_sourceId_fkey";
ALTER TABLE "source_artifacts"
  ADD CONSTRAINT "source_artifacts_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "source_registry"("sourceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- source_artifacts -> ingestion_runs (ingestionRunId)
ALTER TABLE "source_artifacts"
  DROP CONSTRAINT IF EXISTS "source_artifacts_ingestionRunId_fkey";
ALTER TABLE "source_artifacts"
  ADD CONSTRAINT "source_artifacts_ingestionRunId_fkey"
  FOREIGN KEY ("ingestionRunId") REFERENCES "ingestion_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ingestion_runs -> source_registry (sourceId)
ALTER TABLE "ingestion_runs"
  DROP CONSTRAINT IF EXISTS "ingestion_runs_sourceId_fkey";
ALTER TABLE "ingestion_runs"
  ADD CONSTRAINT "ingestion_runs_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "source_registry"("sourceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- canonical_authorities -> canonical_authorities (supersededById, self-ref)
ALTER TABLE "canonical_authorities"
  DROP CONSTRAINT IF EXISTS "canonical_authorities_supersededById_fkey";
ALTER TABLE "canonical_authorities"
  ADD CONSTRAINT "canonical_authorities_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "canonical_authorities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- canonical_authorities -> source_artifacts (artifactId)
ALTER TABLE "canonical_authorities"
  DROP CONSTRAINT IF EXISTS "canonical_authorities_artifactId_fkey";
ALTER TABLE "canonical_authorities"
  ADD CONSTRAINT "canonical_authorities_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "source_artifacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- authority_versions -> canonical_authorities (authorityId)
ALTER TABLE "authority_versions"
  DROP CONSTRAINT IF EXISTS "authority_versions_authorityId_fkey";
ALTER TABLE "authority_versions"
  ADD CONSTRAINT "authority_versions_authorityId_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "canonical_authorities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- authority_edges -> canonical_authorities (fromId)
ALTER TABLE "authority_edges"
  DROP CONSTRAINT IF EXISTS "authority_edges_fromId_fkey";
ALTER TABLE "authority_edges"
  ADD CONSTRAINT "authority_edges_fromId_fkey"
  FOREIGN KEY ("fromId") REFERENCES "canonical_authorities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- authority_edges -> canonical_authorities (toId)
ALTER TABLE "authority_edges"
  DROP CONSTRAINT IF EXISTS "authority_edges_toId_fkey";
ALTER TABLE "authority_edges"
  ADD CONSTRAINT "authority_edges_toId_fkey"
  FOREIGN KEY ("toId") REFERENCES "canonical_authorities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- authority_chunks -> canonical_authorities (authorityId)
ALTER TABLE "authority_chunks"
  DROP CONSTRAINT IF EXISTS "authority_chunks_authorityId_fkey";
ALTER TABLE "authority_chunks"
  ADD CONSTRAINT "authority_chunks_authorityId_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "canonical_authorities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- knowledge_cards -> canonical_authorities (authorityId)
ALTER TABLE "knowledge_cards"
  DROP CONSTRAINT IF EXISTS "knowledge_cards_authorityId_fkey";
ALTER TABLE "knowledge_cards"
  ADD CONSTRAINT "knowledge_cards_authorityId_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "canonical_authorities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- issue_cluster_authorities -> issue_clusters (clusterId)
ALTER TABLE "issue_cluster_authorities"
  DROP CONSTRAINT IF EXISTS "issue_cluster_authorities_clusterId_fkey";
ALTER TABLE "issue_cluster_authorities"
  ADD CONSTRAINT "issue_cluster_authorities_clusterId_fkey"
  FOREIGN KEY ("clusterId") REFERENCES "issue_clusters"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- issue_cluster_authorities -> canonical_authorities (authorityId)
ALTER TABLE "issue_cluster_authorities"
  DROP CONSTRAINT IF EXISTS "issue_cluster_authorities_authorityId_fkey";
ALTER TABLE "issue_cluster_authorities"
  ADD CONSTRAINT "issue_cluster_authorities_authorityId_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "canonical_authorities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- benchmark_questions -> issue_clusters (issueClusterId)
ALTER TABLE "benchmark_questions"
  DROP CONSTRAINT IF EXISTS "benchmark_questions_issueClusterId_fkey";
ALTER TABLE "benchmark_questions"
  ADD CONSTRAINT "benchmark_questions_issueClusterId_fkey"
  FOREIGN KEY ("issueClusterId") REFERENCES "issue_clusters"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- benchmark_runs -> benchmark_questions (questionId)
ALTER TABLE "benchmark_runs"
  DROP CONSTRAINT IF EXISTS "benchmark_runs_questionId_fkey";
ALTER TABLE "benchmark_runs"
  ADD CONSTRAINT "benchmark_runs_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "benchmark_questions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
