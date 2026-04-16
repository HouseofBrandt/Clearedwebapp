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

---

## 2026-04-16 — Junebug Threads PR 2–5 (code-complete)

**What was done:**

Shipped PRs 2 through 5 of the Junebug Threads workspace (A4.7). All
five implementation PRs are now merged on `claude/dreamy-visvesvaraya`
behind `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED` (default false). Flag flip
is the next action per spec §8 rollout.

### PR 2 — API routes + shared completion helper (commit cc00376 + 6d9aa8d)

- `src/lib/junebug/completion.ts` — `runJunebugCompletion()` focused
  helper, handles PII tokenize → Claude streaming → detokenize per-delta.
  Per spec §15's push-back trigger, this is a parallel helper (not an
  extraction of /api/ai/chat) since the chat route pulls in Full Fetch,
  tool use, and browser diagnostics that Junebug doesn't need.
  TODO(refactor) filed in comments.
- `src/lib/junebug/thread-access.ts` — `requireJunebugSession()` +
  `requireOwnedThread()`. Another user's thread ID returns 404 (not
  403) — spec §6 don't-leak-existence rule.
- `src/app/api/junebug/threads/route.ts` — GET list with Postgres FTS
  (`ts_rank_cd` ordering) + cursor pagination; POST create.
- `src/app/api/junebug/threads/[id]/route.ts` — GET detail (paginated
  message history), PATCH (title/pinned/archived/caseId, flips
  `titleAutoGenerated=false` on user rename), DELETE (requires
  `X-Confirm-Delete: true` header).
- `src/app/api/junebug/threads/[id]/messages/route.ts` — POST send.
  Reserves the ASSISTANT row BEFORE streaming so the first SSE `meta`
  event can return its id; named-event SSE (`meta` / `delta` / `done` /
  `error`); persists errors onto the reserved ASSISTANT row so the
  thread never holds a dangling USER message.
- `src/app/api/junebug/threads/[id]/messages/[messageId]/regenerate/
  route.ts` — deletes target + messages after, requires client to
  re-POST the final USER turn.
- Fixed one TS error (`coerce caseId null → undefined for
  createAuditLog`) in the second commit.

### PR 3 — Core components + SSE hooks (commit 9369a2e)

Complete `src/components/junebug/` namespace, ~2,700 LOC across 14
files. Everything mounts only when the flag is on.

- **Layout:** `junebug-workspace.tsx` (two-column 280px sidebar + view,
  mobile overlay), `thread-view.tsx` (context chip → messages →
  composer), `thread-empty-state.tsx` (splash with suggestion chips).
- **Sidebar:** `thread-sidebar.tsx` (search + archived toggle + case
  scope), `thread-list-item.tsx` (title + case chip + preview + hover
  menu — pin / rename / archive / delete), `lib/group-threads.ts`
  (Pinned / Today / Yesterday / Previous 7 / Previous 30 / Older
  bucketing in local tz).
- **Messages:** `message-list.tsx` (auto-scroll stickiness,
  IntersectionObserver paginate-older with scroll-anchor preservation),
  `message-bubble.tsx` (markdown via marked + DOMPurify matching the
  existing `junebug-prose` class; error row with Retry button),
  `message-composer.tsx` (autosize textarea, Enter/Shift+Enter,
  attachment chips).
- **Context chip:** `thread-context-chip.tsx` — accountability surface
  per spec §7.6. Three states (ok / warn / info) reflecting whether
  the last turn loaded live case data, whether the context load failed
  (A4.1 guardrail fired), or whether the thread is general / hasn't
  sent a turn yet.
- **Hooks:** `use-threads.ts` (list + mutators + 30 s visibility-gated
  poll), `use-thread.ts` (detail + backward cursor pagination + a
  functional `appendToMessage` used by the stream handler to avoid
  stale-closure bugs), `use-send-message.ts` (SSE parser for the
  named-event format + queued sends per §7.9).

### PR 4 — Title generation + rolling summary + chip polish (commit f4635ce)

Polish layer per spec §6.5.1, §6.5.2, §7.6. All server-side work is
fire-and-forget so the stream isn't held up.

- `src/lib/junebug/title-generator.ts` — `generateAndSaveThreadTitle()`
  runs Haiku on a tokenized copy of the first user message, asks for
  a 3-7 word title, cleans + detokenizes, PATCHes the thread. Never
  throws — any failure falls back to a word-bounded 60-char excerpt
  so the sidebar row never sits on "New conversation" (spec §13
  permanent fallback).
- `src/lib/junebug/summarize.ts` — `shouldRegenerateSummary(count)`
  returns true at 40 and every +20 past that;
  `loadThreadHistoryForCompletion()` returns last 20 + separate
  `summary` when applicable (otherwise last 60);
  `generateAndSaveRollingSummary()` transcribes every non-errored
  message except the last 20 and asks Haiku for a 200-300 word
  synopsis to store in `JunebugThread.summary`. No new schema column
  — regenerate-from-scratch keeps the invariant simple.
- `src/app/api/junebug/threads/[id]/messages/route.ts` wired: summary
  prepends to the system prompt, title gen fires on first user
  message, summary regen fires after stream `done` on turn-count
  triggers.
- `src/components/junebug/thread-context-chip.tsx` polished: three
  distinct states; "ready to start" reading for a case thread with
  zero turns; expanded panel reflects the same trichotomy.

### PR 5 — Routing + nav + cleanup cron (commit 6d930a7)

Wires the workspace into the app. Still flag-gated.

- `src/app/(dashboard)/junebug/page.tsx` — splash (optional
  `?case=<id>` pre-scope).
- `src/app/(dashboard)/junebug/[threadId]/page.tsx` — thread
  deep-link; ownership checks stay in the API per spec §6.3.
- `src/components/layout/navigation.ts` — new "Junebug" MAIN item
  with `flagGate: "junebugThreads"`; `getVisibleNavItems` filters.
- `src/components/cases/case-junebug.tsx` — when flag is on, the
  inline chat widget becomes a compact "Ask Junebug about this case"
  link row that opens `/junebug?case=<id>`. Legacy inline chat stays
  when flag is off (hooks rules preserved by splitting at the
  component boundary).
- `src/app/(dashboard)/layout.tsx` — `<ChatPanel />` FAB now only
  renders when flag is off (spec §8). Component still exists; PR 6
  deletes it.
- `src/app/api/cron/junebug/cleanup/route.ts` — Bearer-auth GET, finds
  `messages: { none: {} }` AND `createdAt < now - 24h`, caps at 1000
  per run, writes a `JUNEBUG_CLEANUP` AuditLog entry. Runs regardless
  of the feature flag.
- `vercel.json` — added `"/api/cron/junebug/cleanup"` at `"0 7 * * *"`
  (daily 07:00 UTC).

### Bundle-size guardrail

`/api/forms/[instanceId]/preview-pdf` bundle is unchanged across all
five PRs. New routes are either flag-gated server pages (thin
wrappers) or their own serverless functions (Junebug API routes,
cleanup cron). No new transitive imports leaked into the heavy
preview-pdf function.

**What's next (to close A4.7):**

1. Flip `NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED=true` in staging.
2. Run the §11 acceptance checklist end-to-end (persistence, sidebar
   grouping, search, streaming, context chip, cleanup cron).
3. If clean, flip on for internal users (email-domain gate), dogfood
   for one week.
4. If clean, flip for everyone.
5. Two weeks post-rollout: PR 6 — delete `src/components/assistant/
   chat-panel.tsx`, the legacy `case-junebug.tsx` inline-chat path,
   the feature flag itself, and `LegacyInlineCaseJunebug`.
