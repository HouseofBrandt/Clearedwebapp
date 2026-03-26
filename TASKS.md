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

## [TODO] A4.1 Junebug Live-Context Safety Guardrails
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

## [TODO] A4.2 Junebug Multiple Submissions Per Session
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

## [TODO] A4.3 Banjo Task Lifecycle — Unblock New Assignments
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

## [TODO] A4.4 Review Queue Reject Flow
Priority: P0
Source: Part A — Review Queue
Scope: src/app/api/review/[taskId]/route.ts, src/components/review/task-review.tsx
Acceptance:
- Reject endpoint works and item removed from queue or updated to Rejected
- Reject & Re-prompt prompts for instructions and creates follow-on task
- Inline error toast on failure
- Audit trail entries recorded
- Queue list and counts refresh immediately after mutation

## [TODO] A4.5 Knowledge Base Search — Fix Category Filter
Priority: P0
Source: Part A — KB search failure
Scope: src/app/api/knowledge/search/route.ts
Acceptance:
- KB search with category filter returns results (no Postgres operator error)
- Search failures are observable and test-covered
- Fix raw query enum/text mismatch
- Parameterized queries replace unsafe string handling

## [TODO] A4.6 Inbox Real-Time State Correctness
Priority: P0
Source: Part A — Inbox refresh
Scope: src/components/inbox/inbox-list.tsx, src/app/api/inbox/route.ts
Acceptance:
- Poll every 30 seconds (or real-time subscription)
- Manual Refresh button in Inbox UI
- Mark-as-read updates badge, row styling, and detail immediately
- New messages appear within 30 seconds without full page reload
- State survives page refresh

## ═══ P1 — Next After P0 ═══

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
