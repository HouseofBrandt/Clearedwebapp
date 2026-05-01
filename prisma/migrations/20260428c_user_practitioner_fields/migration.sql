-- Add practitioner-credential and firm-address columns to users.
--
-- These power auto-fill of the representative slot on 2848, 12153, 911,
-- etc. so practitioners don't re-type their CAF / PTIN / firm address per
-- form. All columns are nullable — existing rows stay valid; the settings
-- UI prompts the user to fill them in once.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS guards every column.

ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "cafNumber"    TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "ptin"         TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "phone"        TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmName"     TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmAddress"  TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmCity"     TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmState"    TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmZip"      TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmPhone"    TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "firmFax"      TEXT;
