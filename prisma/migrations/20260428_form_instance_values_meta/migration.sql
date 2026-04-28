-- Add valuesMeta JSON column to form_instances for per-field confidence/source/reviewed state.
-- Defaults to '{}' so legacy rows are valid without backfill. Treated as "no metadata" by readers.
--
-- IF EXISTS / IF NOT EXISTS: this repo bootstraps tables via `prisma db push`,
-- not migrations — preview Neon branches that haven't been pushed yet won't
-- have form_instances at migrate-deploy time. The `IF EXISTS` makes the
-- ALTER a no-op in that case; subsequent db push will create the table with
-- valuesMeta already declared in schema.prisma.
ALTER TABLE IF EXISTS "form_instances"
  ADD COLUMN IF NOT EXISTS "valuesMeta" JSONB NOT NULL DEFAULT '{}'::jsonb;
