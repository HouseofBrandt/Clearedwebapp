# Cleared — Task Backlog

> Claude picks the highest-priority unfinished task, implements it, tests it, and updates PROGRESS.md.
> Tasks are ordered by priority. Work top-down.

## Format

```
## [STATUS] Task Title
Priority: P0 | P1 | P2 | P3
Scope: files/areas affected
Acceptance: what "done" looks like
```

Status values: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

---

## [TODO] Fix Vercel build warnings
Priority: P1
Scope: next.config.js, sentry configs, layout.tsx
Acceptance:
- `npm run build` produces 0 warnings (not just 0 errors)
- Sentry configs migrated to instrumentation files
- No "Invalid next.config.js options" warning
- No React Hook dependency warnings in feed-page.tsx and inbox-list.tsx

## [TODO] Design system — migrate remaining hardcoded colors in app/ routes
Priority: P1
Scope: src/app/**/*.tsx (page routes, not components)
Acceptance:
- `grep -rn "text-slate-\|bg-slate-\|border-slate-\|text-gray-[0-9]" src/app/ --include="*.tsx" | wc -l` returns 0
- All page routes use Cleared design tokens (c-gray-*, c-danger, c-warning, c-success, c-teal)

## [TODO] Skeleton loading states for all routes
Priority: P1
Scope: src/app/(dashboard)/*/loading.tsx
Acceptance:
- Every route has a loading.tsx that renders SkeletonStatCard + SkeletonCard shapes matching the page layout
- No route shows a blank page or spinner during loading
- Skeletons use the shimmer animation from globals.css

## [TODO] Case detail — Intelligence Report tab functional
Priority: P1
Scope: src/components/cases/case-intelligence-report.tsx, src/app/api/cases/[caseId]/intelligence-report/route.ts
Acceptance:
- Intelligence Report tab on case detail fetches and renders a one-page report
- Summary cards (total liability, penalties, years, compliance rate)
- Resolution roadmap with OIC/penalty/CNC/IA scoring
- Print button works (window.print with @media print CSS)
- Handles cases with no liability periods gracefully

## [TODO] SOC 2 — seed controls and verify automation dashboard
Priority: P1
Scope: src/app/api/admin/migrate-soc2-automation/route.ts, seed-controls.ts
Acceptance:
- POST /api/admin/migrate-soc2-automation creates all SOC 2 tables
- POST /api/admin/seed-compliance seeds all 50+ controls
- /admin/compliance shows the overview dashboard with TSC cards
- /admin/compliance/automation shows health check status
- Automation engine can be triggered and records results

## [TODO] Transcript Decoder — add freeze code + anomaly panels to RCC dashboard
Priority: P2
Scope: src/components/rcc/rcc-dashboard.tsx, freeze-codes.ts, anomaly-detector.ts, cross-year-linker.ts
Acceptance:
- After parsing transcripts, freeze codes are detected and displayed
- Anomalies (duplicate assessments, misapplied payments, missing credits) are flagged
- Cross-year links (overpayment transfers) are shown
- Each panel is collapsible

## [TODO] OIC Modeler — export Form 433-A/B worksheet as .xlsx
Priority: P2
Scope: src/components/oic/oic-modeler.tsx, new export API route
Acceptance:
- "Export 433-A" button generates a structured .xlsx matching IRS Form 433-A layout
- Income, expenses, assets tabs map to correct form sections
- Uses Times New Roman font per document export standard
- File downloads with proper filename (433-A_[client]_[date].xlsx)

## [TODO] Penalty Abatement — export generated letter as .docx
Priority: P2
Scope: src/components/penalty/penalty-abatement.tsx, new export route
Acceptance:
- After generating an FTA or reasonable cause letter, "Export .docx" button works
- Letter uses Times New Roman font, firm letterhead
- IRC citations and IRM references render correctly
- File downloads with proper filename

## [TODO] Audio transcription — verify Whisper integration end-to-end
Priority: P2
Scope: src/lib/audio/transcription.ts, document upload route
Acceptance:
- Upload an audio file (.mp3, .m4a, .wav) to a case
- System auto-transcribes via Whisper API (or gracefully falls back if no OPENAI_API_KEY)
- Transcript stored in document.extractedText
- Audio player renders on note/conversation attachments
- Transcripts flow into AI context assembly

## [TODO] Data subject rights portal — admin UI for GDPR/CCPA requests
Priority: P2
Scope: src/components/compliance/data-lifecycle.tsx, data-requests API
Acceptance:
- Admin can create access/correction/deletion requests
- 30-day SLA tracked with countdown
- Access requests auto-compile data package
- Deletion requests show confirmation gate

## [TODO] Client Notes — test creating notes of every type with structured fields
Priority: P2
Scope: src/components/notes/notes-panel.tsx, note-card.tsx
Acceptance:
- Create journal, call_log, irs_contact, strategy, client_interaction, research, general notes
- Each type persists and displays correctly
- IRS contact notes show structured fields (employee name, ID, department)
- Call log notes show duration, participants, disposition
- Pin/unpin works and pinned notes appear at top
- Visibility filtering works (all_practitioners, case_team_only, private)

## [TODO] Conversations — test thread lifecycle
Priority: P2
Scope: src/components/conversations/conversations-panel.tsx
Acceptance:
- Create conversation with subject, priority, tax years
- Post replies with @mentions
- Resolve and archive conversations
- Status transitions work correctly
- @mentions trigger notification records

## [TODO] Review Queue — test full approve/reject/edit workflow
Priority: P2
Scope: src/components/review/review-queue.tsx, task-review.tsx
Acceptance:
- Click "Review" on a Banjo deliverable
- View the AI output with verify/judgment flags
- Edit the output inline
- Approve → status changes, audit log created
- Reject → status changes, rejection notes saved
- Bulk approve/reject works for ADMIN/SENIOR

## [TODO] Dashboard — Junebug chat assistant responsive and helpful
Priority: P3
Scope: src/components/assistant/chat-panel.tsx, junebug-icon.tsx
Acceptance:
- Junebug FAB opens chat panel
- Can ask questions about cases
- Responses use case context from context-assembly
- Treat system works (give treat → records positive signal)
- Chat panel styling matches design system

## [TODO] Responsive design — tablet and mobile breakpoints
Priority: P3
Scope: all components
Acceptance:
- Sidebar collapses on tablet (768-1024px)
- Stat cards reflow to 2-across on tablet, 1-across on mobile
- Tables become scrollable on mobile
- Login page card centers on mobile
- No horizontal overflow on any page at 375px width

## [TODO] Dark mode for content area
Priority: P3
Scope: globals.css, all components
Acceptance:
- Toggle in settings enables dark mode
- Sidebar stays navy-950 (unchanged)
- Content area inverts: dark backgrounds, light text
- Semantic colors remain visible
- Design tokens have dark mode variants
