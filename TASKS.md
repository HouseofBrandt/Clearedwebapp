# Cleared — Task Backlog

> Claude picks the highest-priority unfinished task, implements it, tests it, and updates PROGRESS.md.
> Tasks are ordered by priority. Work top-down within each priority level.
> Source: Master Product Specification (docs/master-spec.md)

## Format
```
## [STATUS] Task Title
Priority: P0 | P1 | P2 | P3
Source: Part A (stabilization) or Part B (form builder)
Scope: files/areas affected
Acceptance: what "done" looks like
```

Status values: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

---

# PART A: PLATFORM STABILIZATION

## ═══ P0 — Must Fix Now ═══

## [DONE] A4.1 Junebug Live-Context Safety Guardrails
Priority: P0
Source: Part A — Junebug chat reliability
Scope: src/components/assistant/chat-panel.tsx, src/app/api/assistant/chat/route.ts, src/lib/switchboard/context-packet.ts
Acceptance:
- Backend adds `context_available` flag to every Junebug request
- Case-scoped chats inject live case context on open and every turn
- If context_available = false, Junebug uses constrained fallback: "I do not currently have live case data..."
- Junebug never fabricates case counts, filenames, deadlines, or status when context is missing
- Missing-context events logged with userId, caseId, route, timestamp
- Tests: context present → live data; context absent → refusal; partial → only available fields

## [DONE] A4.2 Junebug Multiple Submissions Per Session
Priority: P0
Source: Part A — Junebug submission reliability
Scope: src/components/assistant/chat-panel.tsx
Acceptance:
- Remove single-submission lockout
- User can submit 3+ bug reports/feature requests in one chat session
- Each gets a unique ID
- Retry-safe (idempotent)
- Success state shown after each, with report ID
- Conversation continues after submission (no forced reset)

## [DONE] A4.3 Banjo Task Lifecycle — Unblock New Assignments
Priority: P0
Source: Part A — Banjo stuck tasks
Scope: src/app/api/banjo/*, src/components/cases/case-detail.tsx (Banjo tab)
Acceptance:
- New Assignment CTA always renders when user has permission
- Pending review does NOT block new assignment creation
- Stuck tasks (timeout exceeded) expose cancel/clear options
- Export failures move task to terminal error state
- Locking is task-specific, not case-global
- Clear reason codes when creation is blocked

## [DONE] A4.4 Review Queue Reject Flow
Priority: P0
Source: Part A — Review Queue
Scope: src/app/api/review/[taskId]/route.ts, src/components/review/task-review.tsx
Acceptance:
- Reject endpoint works and item removed from queue or updated to Rejected
- Reject & Re-prompt prompts for instructions and creates follow-on task
- Inline error toast on failure
- Audit trail entries recorded
- Queue list and counts refresh immediately after mutation

## [DONE] A4.5 Knowledge Base Search — Fix Category Filter
Priority: P0
Source: Part A — KB search failure
Scope: src/app/api/knowledge/search/route.ts
Acceptance:
- KB search with category filter returns results (no Postgres operator error)
- Search failures are observable and test-covered
- Fix raw query enum/text mismatch
- Parameterized queries replace unsafe string handling

## [DONE] A4.6 Inbox Real-Time State Correctness
Priority: P0
Source: Part A — Inbox refresh
Scope: src/components/inbox/inbox-list.tsx, src/app/api/inbox/route.ts
Acceptance:
- Poll every 30 seconds (or real-time subscription)
- Manual Refresh button in Inbox UI
- Mark-as-read updates badge, row styling, and detail immediately
- New messages appear within 30 seconds without full page reload
- State survives page refresh

## [DONE] A4.7 Junebug Threads — Persistent Multi-Thread Workspace
Priority: P0
Source: Part A — Junebug persistence + Claude.ai interaction pattern
Spec: docs/spec-junebug-threads.md (header marks the document as
  historical now that the work has shipped)
Status notes (2026-04-22): rollout + bifurcation + cleanup completed
  on claude/eloquent-zhukovsky-609606.
    PRs 1–5 (schema, API, components, rolling summary, cron)
      — landed previously on claude/dreamy-visvesvaraya.
    PR 1 — §11 audit: fixed rolling-summary skip on error-polluted
      threads and the "New conversation" title-fallback latency.
    PR 2 — staged rollout gate (junebugThreadsEnabledForEmail +
      NEXT_PUBLIC_JUNEBUG_BETA_EMAIL_DOMAINS).
    PR 3 — dashboard bifurcation: new DashboardSplit +
      DashboardJunebugPane; JunebugWorkspace got an `embedded` mode.
    PR 4 — legacy cleanup: deleted chat-panel.tsx + feature-flag.ts,
      stripped gate code across 15 call sites, added a one-shot
      sessionStorage migration, removed both env vars from
      .env.example and RUNBOOK.md.
Scope:
  - prisma/schema.prisma (+ migration): JunebugThread, JunebugMessage,
    JunebugMessageRole enum, JunebugAttachment; GIN index on
    JunebugMessage.content for FTS; relations on User + Case
  - src/app/api/junebug/threads/route.ts (GET list, POST create)
  - src/app/api/junebug/threads/[id]/route.ts (GET, PATCH, DELETE)
  - src/app/api/junebug/threads/[id]/messages/route.ts (POST send, SSE stream)
  - src/app/api/junebug/threads/[id]/messages/[messageId]/regenerate/route.ts
  - src/app/api/cron/junebug/cleanup/route.ts (nightly empty-thread purge)
  - src/lib/junebug/completion.ts (extract runJunebugCompletion() from
    /api/ai/chat; both routes call it; if extraction balloons beyond a
    reasonable size, ship with duplication and file a refactor task —
    per spec §15)
  - src/components/junebug/** (workspace, sidebar, thread list item,
    thread view, context chip, message list/bubble/composer, hooks)
  - src/app/(dashboard)/junebug/page.tsx + /junebug/[threadId]/page.tsx
  - Sidebar nav item "Junebug" replacing the current FAB
  - Case detail: "Ask Junebug" button → /junebug?case={caseId}
  - .env + vercel.json: NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED flag
Acceptance: every checkbox in spec §11 passes in staging. In particular:
  - Messages persist across browser sessions; thread list grouped into
    Pinned / Today / Yesterday / Previous 7 / Previous 30 / Older
    (practitioner's local TZ per A6.5)
  - Thread titles auto-generated via Haiku within ~5s of first user
    message; inline editable (titleAutoGenerated flips to false on edit)
  - Pin / archive / delete with confirmation; search across message
    content (Postgres FTS with ts_rank_cd)
  - Context chip at top of each thread shows what Junebug has access to
    (case number, doc count, KB hits) — non-negotiable per spec §7.6
  - Streaming assistant response persists chunk-by-chunk; dangling user
    messages never left without a reply (failed completions persist an
    ASSISTANT error message + Retry button that hits regenerate endpoint)
  - Long threads (>40 messages) use rolling Haiku summary in
    JunebugThread.summary — prompt token count stays under 40k
  - AuditLog entry per message with threadId, messageId, model, tokens,
    caseId, contextAvailable — matches existing /api/ai/chat discipline
  - No PII in logs; all routes require session auth; another user's
    threadId returns 404 (not 403); DELETE requires X-Confirm-Delete
  - Feature flag off → zero user-facing change, zero new code paths
Rollout (per spec §8):
  1. Merge with flag false. Schema deploys; tables empty.
  2. Flag true in staging; run acceptance checklist.
  3. Flag true for internal users only.
  4. Flag true for everyone. Legacy chat-panel.tsx + FAB deletion is a
     follow-up PR 2 weeks after.
Known trade-off to resolve in implementation: background streaming when
  user switches threads. Default to simpler behavior (abort + save
  partial + Retry) unless a clean path to the Map-keyed persistent
  stream surfaces. Spec §13.
Push-back triggers: if runJunebugCompletion() extraction would duplicate
  80%+ of /api/ai/chat, ship with duplication + separate refactor task.
  If Postgres FTS tokenization is bad for tax jargon, add weighted
  searchVector column or defer search to v2.

## ═══ P1 — Next After P0 ═══

## [TODO] A4.8 Dashboard Bifurcation — Junebug Takes Half the Home Page
Priority: P1
Source: Part A — dashboard redesign; called out in docs/spec-junebug-threads.md §1 as the initiative A4.7 was foundational for.
Blocks-on: A4.7 Junebug Threads flag fully rolled out (flag: true for everyone, PR 6 legacy cleanup done).
Scope:
  - src/app/(dashboard)/dashboard/page.tsx — switch to a two-pane
    layout. Left: existing daily-brief / feed / action queue. Right:
    embedded JunebugWorkspace (or a thinner ThreadView when a thread
    is active). Responsive: mobile stacks vertically with Junebug
    below the feed.
  - Consider a top-level ThreadSidebar collapse toggle for the
    split view so practitioners can give the feed full width when
    they want.
  - Probably a new wrapper component: DashboardJunebugPane that
    composes JunebugWorkspace with the dashboard's density (tighter
    padding, maybe a condensed ThreadSidebar variant).
  - Decide: sidebar nav's /junebug entry stays (dedicated workspace)
    and the dashboard right-pane is a second surface that shares the
    same threads? Or does /junebug redirect to the dashboard pane
    when flag is on? Recommend the former — two surfaces, one data
    store, so case-detail's "Ask Junebug" link still makes sense.
Acceptance:
  - On /dashboard, the right 50% (desktop) or below-the-fold
    (mobile) renders the Junebug workspace with the same persistence
    as /junebug
  - New threads created on /dashboard appear in /junebug and vice
    versa (same DB rows)
  - Context chip visible in the dashboard pane (spec §7.6)
  - The feed + action queue on the left stays fully functional
  - No regression in preview-pdf bundle size (dashboard-side
    imports of JunebugWorkspace are already client-side, should
    be neutral)
  - Flag-gated: when NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED is false,
    the dashboard stays single-pane (current layout)
Push-back trigger: if the two-pane layout pushes the dashboard
  below Core Web Vitals thresholds (LCP, CLS), defer in favor of
  a slot-based opt-in ("Pin Junebug to my dashboard" toggle) rather
  than force the split on everyone.

## [TODO] A5.1 Junebug Chat Persistence + Screenshots + Uploads
Priority: P1
Source: Part A — Junebug enhancements
Scope: src/components/assistant/chat-panel.tsx
Acceptance:
- Chat history persists across panel close/reopen in same session
- Previously sent bug reports visible in chat
- Screenshot capture offered during bug reporting
- Image and document uploads supported in chat
- Attachments stored with chat/report record

## [TODO] A5.2 Banjo Pre-Export Validation
Priority: P1
Source: Part A — Banjo quality
Scope: src/app/api/banjo/[assignmentId]/export-zip/route.ts
Acceptance:
- Validation layer checks required fields, schema validity, output completeness before export
- User-readable validation errors with field-level detail
- Export blocked if validation fails
- Validation failure separate from system processing failure

## [TODO] A5.3 Document Completeness Baseline + 0% Bug Fix
Priority: P1
Source: Part A — Document tracking
Scope: src/lib/case-intelligence/doc-completeness.ts
Acceptance:
- Completeness computed against dynamic required-document checklist (by case type, filing status)
- Progress % reflects checklist matches, not raw upload count
- Cases with uploaded+categorized docs show non-zero progress
- Checklist shows: missing, received, stale/expired, not applicable

## [TODO] A5.5 Numbered List Rendering Fix
Priority: P1
Source: Part A — Chat formatting
Scope: src/components/feed/formatted-text.tsx or markdown renderer
Acceptance:
- Ordered lists render as 1, 2, 3 (not repeated 1)
- Both chat and feed correctly render numbered lists

## [TODO] A5.6 Home Feed Tagging + Notifications
Priority: P1
Source: Part A — Feed behavior
Scope: src/components/feed/feed-card.tsx, notification system
Acceptance:
- Tags persist and display correctly in feed
- Tagged users receive a notification
- Tagged user can navigate back to source feed item

## [TODO] Fix Vercel Build Warnings
Priority: P1
Source: Part A — Build quality
Scope: next.config.js, sentry configs, feed-page.tsx, inbox-list.tsx
Acceptance:
- `npm run build` produces 0 warnings
- React Hook dependency warnings fixed
- No "Invalid next.config.js options" warning

## [TODO] Skeleton Loading States for All Routes
Priority: P1
Source: Design system
Scope: src/app/(dashboard)/*/loading.tsx
Acceptance:
- Every route has loading.tsx with SkeletonStatCard + SkeletonCard shapes
- Skeletons use shimmer animation
- No blank pages or spinners

## [TODO] Case Intelligence Report Tab Functional
Priority: P1
Source: Platform spec
Scope: src/components/cases/case-intelligence-report.tsx
Acceptance:
- Intelligence Report tab fetches and renders one-page report
- Summary cards, resolution roadmap with scoring
- Print button works
- Handles empty data gracefully

## [TODO] SOC 2 — Seed Controls and Verify Automation
Priority: P1
Source: SOC 2 spec
Scope: seed-controls.ts, migrate-soc2-automation route
Acceptance:
- Migration creates all tables
- Seed populates 50+ controls
- Overview dashboard shows TSC cards
- Automation engine can be triggered

## ═══ P2 — Planned Enhancements ═══

## [TODO] A6.1 Inbox Bulk Actions
Priority: P2
Source: Part A
Acceptance: Multi-select, bulk archive/delete/read/unread/export, keyboard shortcuts

## [TODO] A6.2 Export Filtering Defaults
Priority: P2
Source: Part A
Acceptance: Default excludes resolved items, "Include resolved" opt-in control

## [TODO] A6.3 Document Freshness Rules
Priority: P2
Source: Part A
Acceptance: Expiration by doc type (bank=90d, pay stubs=60d, etc.), UI states: current/expiring/expired/unknown

## [TODO] A6.4 Banjo Delete Previous Assignments
Priority: P2
Source: Part A
Acceptance: Delete/archive old assignments with confirmation, audit record, permission-gated

## [TODO] A6.5 Platform Timezone — Central Time Default
Priority: P2
Source: Part A
Acceptance: Default America/Chicago, respect DST, apply to all timestamps, per-user override in settings

## [TODO] OIC Modeler — Export Form 433-A/B as .xlsx
Priority: P2
Source: Platform spec
Acceptance: Export button generates structured .xlsx, Times New Roman font, proper filename

## [TODO] Penalty Abatement — Export Letter as .docx
Priority: P2
Source: Platform spec
Acceptance: Export generates .docx with Times New Roman, firm letterhead, IRC/IRM citations

## [TODO] Audio Transcription — Verify Whisper End-to-End
Priority: P2
Source: Platform spec
Acceptance: Audio upload → Whisper transcription → stored in extractedText → flows into AI context

## [TODO] Transcript Decoder — Freeze Code + Anomaly Panels
Priority: P2
Source: Platform spec
Acceptance: Detected freeze codes, anomalies, and cross-year links shown in collapsible panels

## [TODO] Client Notes — Test All Note Types with Structured Fields
Priority: P2
Source: Platform spec
Acceptance: All 7 types persist, IRS contact structured fields, pin/unpin, visibility filtering

## [TODO] Conversations — Test Thread Lifecycle
Priority: P2
Source: Platform spec
Acceptance: Create, reply, @mention, resolve, archive — full lifecycle

## [TODO] Review Queue — Full Approve/Reject/Edit Workflow Test
Priority: P2
Source: Platform spec
Acceptance: Review, edit, approve, reject, bulk operations all functional

## ═══ P3 — Larger Initiatives ═══

## [TODO] A7.1 Full Junebug Platform Data Access
Priority: P3
Source: Part A
Acceptance: Junebug can read all platform data (cases, docs, deadlines, reviews) in real-time

## [TODO] A7.5 SOC 2 DOCX Audit Export
Priority: P3
Source: Part A
Acceptance: Generate comprehensive SOC 2 audit report as .docx

## [TODO] A7.6 IRS Appeals Packet Generator
Priority: P3
Source: Part A
Acceptance: Generate appeals packet with cover letter, supporting docs, timeline

## [TODO] Responsive Design — Tablet and Mobile Breakpoints
Priority: P3
Source: Design system
Acceptance: Sidebar collapses, stat cards reflow, tables scroll, no overflow at 375px

## [TODO] Dark Mode for Content Area
Priority: P3
Source: Design system
Acceptance: Toggle in settings, sidebar unchanged, content inverts, semantic colors visible

---

# PART B: INTELLIGENT IRS FORM BUILDER

> These tasks are Phase 1 of the Form Builder (B5-B6 of the master spec).
> Do not start Part B until Part A P0 items are all DONE.

## ═══ Phase 1: Foundation ═══

## [TODO] B1.1 Form Schema Engine — TypeScript Types
Priority: P1 (after Part A P0)
Source: Part B Section 5.1
Acceptance: FormSchema, Section, Field, FieldType, ValidationRule, ConditionalLogic, PDFMapping types defined

## [TODO] B1.2 Form 433-A Schema (JSON)
Priority: P1
Source: Part B Section 5.6.1
Acceptance: All 6 sections, all fields, validation rules, conditional logic in JSON

## [TODO] B1.3 Form 433-A (OIC) Schema
Priority: P1
Source: Part B Section 5.6.2
Acceptance: Extends 433-A with OIC-specific sections, RCP computation fields

## [TODO] B1.4 Form 12153 Schema
Priority: P1
Source: Part B Section 5.6.3
Acceptance: CDP/equivalent hearing fields, 30-day deadline tracker fields

## [TODO] B1.5 Form 911 Schema
Priority: P1
Source: Part B Section 5.6.4
Acceptance: Taxpayer Advocate fields, hardship category selection, narrative prompts

## [TODO] B1.6 Three-Panel Form Wizard Layout
Priority: P1
Source: Part B Section 5.2.1
Acceptance: Left sidebar navigator, center form panel, right PDF preview placeholder

## [TODO] B1.7 Section Navigator Component
Priority: P1
Source: Part B Section 5.2.2
Acceptance: Completion state indicators (empty/in-progress/complete/error), click-to-navigate

## [TODO] B1.8 Field Renderer Components (14 types)
Priority: P1
Source: Part B Section 5.1.2
Acceptance: All field types render and accept input correctly

## [TODO] B1.9 Validation Engine (3 tiers)
Priority: P1
Source: Part B Section 5.5
Acceptance: Field-level, section-level, cross-section validation with error presentation

## [TODO] B1.10 Auto-Save and Session Persistence
Priority: P1
Source: Part B Section 5.2.3
Acceptance: Debounced 500ms auto-save, "All changes saved" indicator, session recovery

## [TODO] B1.11 PDF Generation — Form 433-A
Priority: P1
Source: Part B Section 5.3
Acceptance: Draft mode (watermark), final mode (clean), field overlay at mapped coordinates

## ═══ Phase 2: Resolution Engine + In-Form Assistant ═══

## [TODO] B15.1 Resolution Path Configuration
Priority: P1 (after Phase 1)
Source: Addendum B15.3
Acceptance:
- Resolution paths defined: OIC, IA, CNC, CDP, Penalty Abatement, Innocent Spouse, TAS, Lien Relief
- Each path maps to base form set (per B15.3 table)
- Resolution path stored on Case model
- Case setup wizard allows path selection

## [TODO] B15.2 Case Characteristic Detection + Modifiers
Priority: P1
Source: Addendum B15.4
Acceptance:
- Boolean characteristics auto-detected from case data (business liabilities, self-employed, married, identity theft, etc.)
- Unknown characteristics presented as yes/no questions
- Each modifier adds/removes forms from the package per B15.4 table

## [TODO] B15.3 Form Dependency Engine
Priority: P1
Source: Addendum B15.5
Acceptance:
- 656 requires 433-A (OIC), 656-B requires 433-B (OIC)
- Separate 656 per entity type enforced
- 12153 recommends 433-A + collection alternative forms
- 2848 always first, 4506-T always recommended
- Warnings on removing required forms

## [TODO] B15.4 Form Package UX — Resolution Dashboard
Priority: P1
Source: Addendum B15.6
Acceptance:
- Resolution dashboard on case detail showing path, status, form checklist
- Per-form completion status (not started / in progress / complete / submitted)
- Package readiness percentage
- Submit Package action validates all required forms
- Data flows between related forms (433-A → 656, etc.)

## [TODO] B15.5 Resolution Path Recommendation (Phase 3)
Priority: P2
Source: Addendum B15.7
Acceptance:
- After 433-A completion, system recommends optimal path based on RCP analysis
- Reasoning shown: "RCP is $X against balance of $Y, OIC viable"
- Accept recommendation auto-generates form package

## [TODO] B16.1 Junebug In-Form Context Injection
Priority: P1 (after Phase 1)
Source: Addendum B16.3
Acceptance:
- Every Junebug request from form builder includes: active form, field schema, current values, client context, case documents, form package status, IRS instructions, ALE standards
- Context auto-updates as user navigates fields/sections
- Missing context disclosed per A4.1 guardrails

## [TODO] B16.2 Field-Level Help (Passive)
Priority: P1
Source: Addendum B16.4.1
Acceptance:
- Every form field has help icon (?)
- Clicking opens Junebug pre-primed with field context
- Response cites IRS instructions + includes client-specific data if available

## [TODO] B16.3 Contextual Questions (Active)
Priority: P1
Source: Addendum B16.4.2
Acceptance:
- Freeform questions in Junebug panel with full form context
- Can answer field-specific, documentation, IRS procedure, and cross-form questions
- Citations to IRS instructions and IRM sections

## [TODO] B16.4 Validation Explanation
Priority: P1
Source: Addendum B16.4.3
Acceptance:
- Clicking validation error opens Junebug with error context
- Explains what's wrong, why it matters, and how to fix it
- References specific field values and IRS computation rules

## [TODO] B16.5 Proactive Suggestions
Priority: P2
Source: Addendum B16.4.5
Acceptance:
- Detects incomplete sections with available data and offers to populate
- Flags values outside IRS norms with ALE comparison
- Identifies missing supporting documentation
- Deadline awareness for time-sensitive forms

## [TODO] B16.6 IRS Instructions Knowledge Base
Priority: P1
Source: Addendum B16.5
Acceptance:
- Form instructions chunked per-field and indexed
- IRM relevant sections indexed by topic
- ALE standards loaded and queryable by geography
- Retrieval < 500ms for field-level queries
- Update schedule: instructions quarterly, ALE on IRS release, IRM monthly

## [TODO] B16.7 Junebug Panel Integration in Form Builder
Priority: P1
Source: Addendum B16.6
Acceptance:
- FAB in bottom-right of center panel
- Panel slides from right (300px), overlays PDF preview
- Context breadcrumb at top: "Form 433-A > Section 3 > Line 14"
- Scoped mode (default) vs General mode toggle
- Cmd/Ctrl+J keyboard shortcut
- Chat history persists for form session

## ═══ Phase 3-4: Additional Forms (27 total) ═══

## [TODO] B17.1 Phase 2 Forms — OIC + Installment Package
Priority: P2
Source: Addendum B17
Acceptance: Schemas + wizard + PDF gen for: 656, 656-L, 433-B (OIC), 9465, 433-D, 433-B, 433-F

## [TODO] B17.2 Phase 3 Forms — Representation + Appeals + Liens
Priority: P2
Source: Addendum B17
Acceptance: Schemas + wizard + PDF gen for: 2848, 8821, 843, 8857, 12277, 14135, 9423, 13711

## [TODO] B17.3 Phase 4 Forms — Compliance + Identity + Transcripts + State
Priority: P3
Source: Addendum B17
Acceptance: Schemas + wizard + PDF gen for: 4506-T, 14039, 14134, 1040-X, W-7, SS-4, 12203, state forms

---

# PART C: FORM BUILDER V2 FOLLOW-UPS (as of 2026-04-22)

V2 foundation landed behind `FORM_BUILDER_V2_ENABLED` flag. The tasks below are the remaining work from docs/forms-v2-spec.md.

## ═══ V2 P0 — Ship-blockers ═══

## [TODO] V2.1 Author 433-A-OIC PDF binding
Priority: P0
Source: docs/forms-v2-spec.md §7 + PROGRESS.md 2026-04-22
Scope: src/lib/forms/pdf-bindings/433-A-OIC/2024-04.json, write a one-shot pdf-inspect script under scripts/
Acceptance:
- Node script (scripts/inspect-pdf-fields.mjs) that takes a PDF path and dumps every AcroForm field name + type
- Run against public/forms/f433aoic.pdf to enumerate fields
- Author 433-A-OIC/2024-04.json with real field names
- Update registry: add 433-A-OIC to BINDING_LOADERS, flip hasBinding to true
- Manual smoke test: fill an instance, render PDF, verify every expected field appears

## [TODO] V2.2 Acquire + bind 2848 (Power of Attorney)
Priority: P0
Scope: public/forms/f2848.pdf, src/lib/forms/pdf-bindings/2848/2021-01.json
Acceptance:
- Download f2848 from irs.gov (Rev. 1-2021)
- Run inspect script, author binding
- Fill test instance end-to-end
- 2848 is the gatekeeper for every resolution path — this is the highest-leverage missing form

## ═══ V2 P1 — Near-term follow-ups ═══

## [TODO] V2.3 Acquire + bind 4506-T, 14039, 12277
Priority: P1
Scope: public/forms/f4506t.pdf, f14039.pdf, f12277.pdf + corresponding binding JSONs
Acceptance: Same pattern as V2.1. All three schemas already shipped; only PDFs + bindings are missing.

## [TODO] V2.4 Complete form schemas 656, 843, 9465
Priority: P1
Scope: src/lib/forms/schemas/form-{656,843,9465}.ts (existing files are partial)
Acceptance:
- Review existing schemas against docs/forms-v2-spec.md §7.2/7.3/7.4
- Use fragment-library expansions (offer-calculation, reasonable-cause, installment-schedule)
- Add crossFormMappings (656 ← 433-A-OIC, 9465 ← 433-A)

## [TODO] V2.5 Binding files for 656, 843, 9465
Priority: P1
Scope: public/forms/f656.pdf, f843.pdf, f9465.pdf + binding JSONs
Acceptance: same pattern as V2.1

## [TODO] V2.6 Backfill DocumentChunk + DocumentExtract
Priority: P1
Scope: scripts/backfill-document-chunks.ts (new), runs against production Neon DB
Acceptance:
- Iterates every Document with extractedText
- Calls chunkAndEmbedDocument and extractDocumentFields
- Handles rate limits (batch, retry, progress logging)
- Idempotent — safe to re-run
- Flag DOCUMENT_CHUNKING_ENABLED can be flipped on AFTER backfill completes

## [TODO] V2.7 Encrypt FormInstance.values
Priority: P1
Scope: prisma/schema.prisma, src/lib/forms/form-store.ts, one-shot migration script
Acceptance:
- Add `valuesEncrypted String? @db.Text` column alongside `values`
- Update form-store to read/write encrypted column (fallback to plain for legacy rows)
- Write migration script to encrypt existing rows in place
- Follow-up PR drops the plain `values` column after 2 weeks of stable dual-column operation

## [TODO] V2.8 Golden-PDF tests
Priority: P1
Scope: tests/golden-pdfs/ + src/lib/forms/pdf-renderer/golden.test.ts
Acceptance:
- Known test-data set per form (synthetic — no real client PII)
- Fill each form, save output to tests/golden-pdfs/{form}.pdf
- CI test compares byte-for-byte, tolerating PDF timestamp differences
- Golden regeneration is a deliberate commit, reviewed per-diff

## ═══ V2 P2 — Medium-term ═══

## [TODO] V2.9 Form schemas 433-B, 433-B-OIC, 8857, 433-F, 1040-X
Priority: P2
Scope: src/lib/forms/schemas/
Acceptance:
- One schema per form using the fragment library
- 8857 uses FormInstanceSensitive sidecar for abuse/duress fields
- Each schema ships with a metadata file in src/lib/forms/metadata/
- Bindings deferred to V2.10

## [TODO] V2.10 Binding files for 433-B, 433-B-OIC, 8857, 433-F, 1040-X
Priority: P2
Scope: public/forms/ + binding JSONs
Acceptance: same pattern as V2.1

## [TODO] V2.11 Field highlighting in PDF preview
Priority: P2
Scope: src/components/forms/pdf-preview.tsx, uses binding coordinates
Acceptance:
- When a field is focused in the wizard, the PDF preview highlights its location
- Yellow outline overlay via pdfjsLib canvas
- Revision badge in preview header

## [TODO] V2.12 Cross-form data flow declarations
Priority: P2
Scope: crossFormMappings on every schema that has a sibling form
Acceptance:
- 656 auto-fills from 433-A-OIC completion
- 9465 auto-fills from 433-A completion
- 2848 representative info flows into 8821, 12153, 911, etc.

## [TODO] V2.13 Analytics dashboard /admin/forms-analytics
Priority: P2
Scope: src/app/(dashboard)/admin/forms-analytics/, new AuditLog queries
Acceptance:
- Per-form: time-to-start, time-to-complete, auto-populate adoption, PDF fill duration/failure rate
- Per-practitioner: forms completed per week
- Weekly admin report of binding-health (forms with >5% fill-failure)

## ═══ V2 P3 — Nice to have ═══

## [TODO] V2.14 Observability: failed-fill alerting
Priority: P3
Scope: src/lib/forms/pdf-renderer/index.ts writes AuditLog entries on failure
Acceptance: Every FillResult with failed fields creates an AuditLog row, queryable on the analytics dashboard

## [TODO] V2.15 Dogfood + rollout
Priority: P3
Acceptance:
- Enable FORM_BUILDER_V2_ENABLED for 5 internal practitioners
- Monitor metrics for 1 week
- Roll to 25% for 3 days
- Full rollout
- Delete legacy form-hub/renderer code 2 weeks after full stable

## [TODO] V2.16 Form 8821 (simpler 2848 sibling)
Priority: P3
Acceptance: Schema + binding + case-first hub integration. Structurally a subset of 2848.

## [TODO] V2.17 Form schemas deliberately out of scope
Do not pick up in follow-ups without an explicit ask:
- State tax forms (California FTB, New York DTF, etc.)
- e-Filing integration (v1 is PDF-for-signature only)
- Client portal form signing
- Mid-flight revision migration UI (instances stay on their original revision)
