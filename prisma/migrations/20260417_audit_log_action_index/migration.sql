-- Add (action, timestamp) index on audit_logs for forensic + SOC 2 queries.
--
-- The RUNBOOK.md playbooks all filter on action first then timestamp
-- (e.g. "every JUNEBUG_THREAD_DELETED in the last 30 days"). Prior
-- indexes covered caseId, timestamp alone, and (practitionerId,
-- timestamp) — none of which help these queries.
--
-- IF NOT EXISTS because this migration must be safe to re-run.
CREATE INDEX IF NOT EXISTS "audit_logs_action_timestamp_idx"
  ON "audit_logs" ("action", "timestamp");
