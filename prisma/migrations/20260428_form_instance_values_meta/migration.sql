-- Add valuesMeta JSON column to form_instances for per-field confidence/source/reviewed state.
-- Defaults to '{}' so legacy rows are valid without backfill. Treated as "no metadata" by readers.
ALTER TABLE "form_instances"
  ADD COLUMN IF NOT EXISTS "valuesMeta" JSONB NOT NULL DEFAULT '{}'::jsonb;
