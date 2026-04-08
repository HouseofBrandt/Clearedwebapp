-- Micanopy Research Center — Schema Migration

-- Add new AITaskType enum values
ALTER TYPE "AITaskType" ADD VALUE IF NOT EXISTS 'RESEARCH_QUICK_ANSWER';
ALTER TYPE "AITaskType" ADD VALUE IF NOT EXISTS 'RESEARCH_ISSUE_BRIEF';
ALTER TYPE "AITaskType" ADD VALUE IF NOT EXISTS 'RESEARCH_MEMORANDUM';
ALTER TYPE "AITaskType" ADD VALUE IF NOT EXISTS 'RESEARCH_AUTHORITY_SURVEY';
ALTER TYPE "AITaskType" ADD VALUE IF NOT EXISTS 'RESEARCH_COUNTERARGUMENT';

-- Create enums
DO $$ BEGIN CREATE TYPE "ResearchMode" AS ENUM ('QUICK_ANSWER', 'ISSUE_BRIEF', 'RESEARCH_MEMORANDUM', 'AUTHORITY_SURVEY', 'COUNTERARGUMENT_PREP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ResearchStatus" AS ENUM ('INTAKE', 'PRESCOPING', 'RETRIEVING', 'COMPOSING', 'EVALUATING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ResearchSourceType" AS ENUM ('KB_INTERNAL', 'IRC_STATUTE', 'TREASURY_REGULATION', 'IRM_SECTION', 'REVENUE_PROCEDURE', 'REVENUE_RULING', 'TAX_COURT', 'CIRCUIT_COURT', 'SUPREME_COURT', 'PLR_CCA', 'IRS_PUBLICATION', 'TREATISE', 'WEB_GENERAL', 'FIRM_WORK_PRODUCT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create research_sessions table
CREATE TABLE IF NOT EXISTS "research_sessions" (
    "id" TEXT NOT NULL,
    "mode" "ResearchMode" NOT NULL,
    "questionText" TEXT NOT NULL,
    "factsText" TEXT,
    "proceduralPosture" TEXT,
    "intendedAudience" TEXT DEFAULT 'Internal case file',
    "knownAuthorities" TEXT,
    "specificQuestions" TEXT,
    "prescopeResult" JSONB,
    "sourcePriorities" JSONB,
    "excludedSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recencyBias" INTEGER NOT NULL DEFAULT 50,
    "caseId" TEXT,
    "caseContextSnapshot" JSONB,
    "status" "ResearchStatus" NOT NULL DEFAULT 'INTAKE',
    "retrievalStartedAt" TIMESTAMP(3),
    "compositionStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "output" TEXT,
    "outputFormat" TEXT,
    "executiveSummary" TEXT,
    "sourcesUsed" JSONB,
    "kbResultCount" INTEGER NOT NULL DEFAULT 0,
    "webResultCount" INTEGER NOT NULL DEFAULT 0,
    "primarySourceCount" INTEGER NOT NULL DEFAULT 0,
    "citationCount" INTEGER NOT NULL DEFAULT 0,
    "unverifiedCitations" INTEGER NOT NULL DEFAULT 0,
    "reasoningScore" DOUBLE PRECISION,
    "reasoningVerdict" TEXT,
    "verifyFlagCount" INTEGER NOT NULL DEFAULT 0,
    "judgmentFlagCount" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'claude-opus-4-6',
    "totalTokensUsed" INTEGER,
    "totalDurationMs" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_sessions_pkey" PRIMARY KEY ("id")
);

-- Create research_sources table
CREATE TABLE IF NOT EXISTS "research_sources" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceType" "ResearchSourceType" NOT NULL,
    "citation" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "fullText" TEXT,
    "snippet" TEXT,
    "authorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "dateOfAuthority" TIMESTAMP(3),
    "knowledgeDocId" TEXT,
    "knowledgeChunkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- Create research_reviews table
CREATE TABLE IF NOT EXISTS "research_reviews" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "action" "ReviewActionType" NOT NULL,
    "editedOutput" TEXT,
    "reviewNotes" TEXT,
    "reviewStartedAt" TIMESTAMP(3) NOT NULL,
    "reviewCompletedAt" TIMESTAMP(3),

    CONSTRAINT "research_reviews_pkey" PRIMARY KEY ("id")
);

-- Create research_preferences table
CREATE TABLE IF NOT EXISTS "research_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultMode" "ResearchMode",
    "defaultSourcePriorities" JSONB,
    "defaultExcludedSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultRecencyBias" INTEGER NOT NULL DEFAULT 50,
    "defaultAudience" TEXT,
    "templates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_preferences_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "research_sessions_caseId_idx" ON "research_sessions"("caseId");
CREATE INDEX IF NOT EXISTS "research_sessions_createdById_idx" ON "research_sessions"("createdById");
CREATE INDEX IF NOT EXISTS "research_sessions_status_idx" ON "research_sessions"("status");
CREATE INDEX IF NOT EXISTS "research_sessions_mode_idx" ON "research_sessions"("mode");
CREATE INDEX IF NOT EXISTS "research_sessions_createdAt_idx" ON "research_sessions"("createdAt");
CREATE INDEX IF NOT EXISTS "research_sources_sessionId_idx" ON "research_sources"("sessionId");
CREATE INDEX IF NOT EXISTS "research_sources_sourceType_idx" ON "research_sources"("sourceType");
CREATE INDEX IF NOT EXISTS "research_reviews_sessionId_idx" ON "research_reviews"("sessionId");
CREATE INDEX IF NOT EXISTS "research_reviews_practitionerId_idx" ON "research_reviews"("practitionerId");

-- Create unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "research_preferences_userId_key" ON "research_preferences"("userId");

-- Add foreign keys
DO $$ BEGIN ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "research_sessions" ADD CONSTRAINT "research_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "research_reviews" ADD CONSTRAINT "research_reviews_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "research_preferences" ADD CONSTRAINT "research_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
