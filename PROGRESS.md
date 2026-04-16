# Cleared — Progress Log

> This file is append-only. Each iteration adds a dated entry below.
> Do NOT delete or overwrite previous entries.

---

## 2026-03-27 — Initial Setup

**What was done:**
- Created loop infrastructure: `scripts/claude-loop.sh`, `scripts/loop-prompt.md`, `TASKS.md`, `PROGRESS.md`
- TASKS.md populated with 18 tasks across P0-P3 priorities
- Loop script supports `--iterations`, `--duration`, `--max-cost`, `--pause` flags
- Logs written to `logs/claude-loop/` directory

**Current platform state:**
- All core features built and deployed: Dashboard, Cases, Review Queue, Calendar, Portfolio, Transcript Decoder, OIC Modeler, Penalty Abatement, SOC 2 Compliance, Switchboard, Notes, Conversations, Feed
- Design system remediation complete: Instrument Serif titles, JetBrains Mono data, tokens in Tailwind, font weights capped at 500
- Security hardening complete: PII tokenization, encryption at rest, rate limiting, audit logging
- All users can access all cases (small firm model)
- Vercel deployment passing

**Next iteration should:**
- Start with P1 tasks: fix build warnings, skeleton loading states, or Intelligence Report tab

---

## 2026-03-27 — Master Spec Integration

**What was done:**
- Integrated full Master Product Specification into loop infrastructure
- TASKS.md rewritten with complete prioritized backlog from Part A (stabilization) + Part B (form builder)
- Part A: 6 P0 tasks, 8 P1 tasks, 9 P2 tasks, 5 P3 tasks
- Part B: 11 Form Builder Phase 1 tasks (P1, blocked on Part A P0 completion)
- docs/master-spec.md created as reference
- Loop prompt updated to enforce P0-first ordering and cross-cutting engineering rules

**Task priority order:**
1. Part A P0 (6 tasks): Junebug guardrails, multiple submissions, Banjo unblock, Review reject, KB search, Inbox refresh
2. Part A P1 (8 tasks): Junebug persistence, Banjo validation, doc completeness, build warnings, skeletons, etc.
3. Part A P2 (9 tasks): Inbox bulk, export defaults, freshness, timezone, exports
4. Part B Phase 1 (11 tasks): Form schema engine, 4 form schemas, wizard UI, field renderers, validation, auto-save, PDF generation
5. Part A P3 (5 tasks): Full platform access, appeals, responsive, dark mode

**Next iteration should:**
- Start with A4.1 Junebug Live-Context Safety Guardrails (highest priority P0 task)

---

## 2026-04-16 — Pippen Phases 1–3 + Junebug Threads foundation (A4.7 PR 1)

**What was done:**

### Pippen — smarter over time

- **Phase 1 (shipped to production in PR #132):** SourceArtifact rows from the 8 harvesters are now promoted into KnowledgeDocument with `sourceType: "TAX_AUTHORITY"`, so Banjo/Junebug/Research retrieval via `searchKnowledge` returns raw IRM / Treas. Reg. / Tax Court text instead of just Pippen's daily summaries. Added `AUTHORITY_WEIGHTS` entries: `TAX_AUTHORITY: 0.95`, `PIPPEN_DAILY_LEARNINGS: 0.70`.
- **Phase 2 (feature branch):** `BaseHarvester.storeArtifact` runs `classifyIssue()` on every item; non-primary authorities that miss the tax-controversy keyword dictionary are stored with `parserStatus='SKIPPED'` (audit trail kept, promotion blocked). Surfaced `scanForGaps()` via `/api/cron/tax-authority/weekly-gaps` (Mondays 11:00 UTC) and a new admin page at `/admin/tax-authority/gaps`.
- **Phase 3 (feature branch):** Review-action feedback loop — `applyReviewFeedback` extracts citations (IRC / Treas. Reg. / IRM / Rev. Proc. / Rev. Rul. / Notice / PLR / TAM / T.C. Memo) from AI output and nudges `CanonicalAuthority.practitionerScore` and `SourceArtifact.qualityScore`. `searchKnowledge` now LEFT JOINs on the FK and multiplies score by `qualityScore`. Added `HarvestPreference` model + `/api/tax-authority/preference` endpoint for "more / less like this" signals; the harvester gate reads it to suppress (source × issueCategory) pairs at ≤ 0.1 weight.

### Junebug Threads (A4.7) — foundation

Started A4.7 per `docs/spec-junebug-threads.md`. This PR (PR 1 of 6 in spec §14) is schema + flag only — zero user-facing change, ship it dark.

- Added `JunebugThread`, `JunebugMessage`, `JunebugAttachment` models + `JunebugMessageRole` enum to `prisma/schema.prisma`.
- Added relations on `User.junebugThreads` and `Case.junebugThreads`.
- Wrote `prisma/migrations/20260416_add_junebug_threads/migration.sql` with safe `IF NOT EXISTS` guards. Includes a GIN FTS index on `junebug_messages.content` (spec §6.1.1).
- Added `src/lib/junebug/feature-flag.ts` exporting `junebugThreadsEnabled()` — reads `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED`.
- `.env.example` documents the new flag.
- Marked A4.7 as `IN_PROGRESS` in TASKS.md.

**Bundle/deploy impact:** Phase 2/3 are cron + admin side only. A4.7 PR 1 adds schema + one helper, nothing that ships in user-route bundles. `/api/forms/[instanceId]/preview-pdf` bundle unchanged across all four commits.

**Next iteration should:**
- A4.7 PR 2 — build out `/api/junebug/threads/...` routes per spec §6; ship behind the flag so routes are reachable in staging but not used by any UI yet.
- Extract `runJunebugCompletion()` from `/api/ai/chat` per spec §10.1. If the extraction would duplicate 80%+ of the chat route, ship with duplication and file a refactor task (spec §15).
