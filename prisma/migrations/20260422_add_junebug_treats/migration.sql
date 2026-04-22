-- Junebug reinforcement signal — "good girl" treats on assistant messages.
-- Feeds into the self-learning retrospective that nudges future turns
-- toward patterns the practitioner rewards.
--
-- Safe-to-rerun (IF NOT EXISTS everywhere) for the same reason the
-- other A4.7 migrations are: idempotent deploy.

CREATE TABLE IF NOT EXISTS "junebug_treats" (
  "id"        TEXT        NOT NULL,
  "messageId" TEXT        NOT NULL,
  "userId"    TEXT        NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "junebug_treats_pkey" PRIMARY KEY ("id")
);

-- One treat per (message, user) pair. Practitioners re-clicking the
-- bone icon toggle (delete + recreate) rather than stacking.
CREATE UNIQUE INDEX IF NOT EXISTS "junebug_treats_messageId_userId_key"
  ON "junebug_treats" ("messageId", "userId");

-- Retrospective queries hit (userId, createdAt desc) to pull the
-- practitioner's recent treats for the system-prompt aggregate.
CREATE INDEX IF NOT EXISTS "junebug_treats_userId_createdAt_idx"
  ON "junebug_treats" ("userId", "createdAt");

-- Foreign keys — guarded with DO blocks so re-runs don't error on
-- duplicate-constraint exceptions. Same pattern as 20260416_add_junebug_threads.
DO $$ BEGIN
  ALTER TABLE "junebug_treats"
    ADD CONSTRAINT "junebug_treats_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "junebug_messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "junebug_treats"
    ADD CONSTRAINT "junebug_treats_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
