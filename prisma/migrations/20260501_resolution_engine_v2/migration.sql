-- Resolution Engine v2: practitioner-editable case characteristic overrides
-- + AI path-recommendation cache, both on case_intelligence.
--
-- Idempotent: every column uses `ADD COLUMN IF NOT EXISTS`. Safe to apply
-- against any database state.

ALTER TABLE IF EXISTS "case_intelligence"
  ADD COLUMN IF NOT EXISTS "caseCharacteristics"      JSONB;
ALTER TABLE IF EXISTS "case_intelligence"
  ADD COLUMN IF NOT EXISTS "recommendedPath"          TEXT;
ALTER TABLE IF EXISTS "case_intelligence"
  ADD COLUMN IF NOT EXISTS "pathRecommendationReason" TEXT;
ALTER TABLE IF EXISTS "case_intelligence"
  ADD COLUMN IF NOT EXISTS "pathRecommendationAt"     TIMESTAMP(3);
