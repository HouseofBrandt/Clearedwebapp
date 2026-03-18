# CLEARED — AI-Powered Tax Resolution Platform

## Project Overview

Cleared is an internal web application for a tax resolution firm. Licensed practitioners (Enrolled Agents, CPAs, attorneys) use this platform to:

1. Upload client source documents (IRS notices, bank statements, tax returns, meeting notes)
2. Have AI analyze documents and generate structured working papers, memos, and letters
3. Review, edit, and approve all AI-generated output before it reaches the client

**The AI is a tool, not the service provider.** Every piece of AI output must be reviewed by a licensed professional. No AI output ever goes directly to a client or the IRS.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Component Library**: shadcn/ui
- **Database**: PostgreSQL via Prisma ORM
- **Authentication**: NextAuth.js with email/password + MFA (employees only, no public registration)
- **File Storage**: Local filesystem in development, S3-compatible in production
- **AI Integration**: Anthropic Claude API (claude-sonnet-4-6 primary, claude-opus-4-6 for complex analysis)
- **Document Processing**: pdf-parse for PDFs, Tesseract.js for OCR, mammoth for .docx
- **Spreadsheet Generation**: ExcelJS for .xlsx output
- **Document Generation**: docx (npm) for .docx output, marked for markdown AST parsing
- **Rich Text Editor**: TipTap for in-browser editing of memos and letters
- **Spreadsheet Editor**: Handsontable (or AG Grid Community) for in-browser spreadsheet editing

## Document Export Standard

All exported documents (.docx, .pdf) must use **Times New Roman** as the only font. This applies to headings, body text, tables, headers, footers, and all other elements. This is a firm-wide standard for all Cleared documents.

## Architecture Principles

1. **PII never leaves our infrastructure.** Client data is tokenized before any API call. Real names, SSNs, EINs, addresses, and account numbers are replaced with deterministic tokens. Only tokenized data is sent to the Claude API.

2. **Every AI interaction is logged.** Request ID, timestamp, practitioner, matter ID, tokenized input/output, model used, system prompt version, and review action are all recorded.

3. **Mandatory human review.** The UI enforces that no AI output can be exported, emailed, or marked as final without an explicit approval action by a logged-in practitioner.

4. **Session-scoped tokenization.** Token mapping tables are created per-case and stored encrypted. They are used to de-tokenize AI output for practitioner review.

## Project Structure

```
cleared/
├── CLAUDE.md                    # This file
├── package.json
├── prisma/
│   └── schema.prisma            # Database schema
├── src/
│   ├── app/                     # Next.js App Router pages
│   │   ├── (auth)/              # Login, MFA pages
│   │   ├── (dashboard)/         # Main app layout
│   │   │   ├── cases/           # Case list and detail views
│   │   │   ├── review/          # Review queue
│   │   │   └── settings/        # User and firm settings
│   │   └── api/                 # API routes
│   │       ├── auth/            # NextAuth endpoints
│   │       ├── cases/           # Case CRUD
│   │       ├── documents/       # Document upload and processing
│   │       ├── ai/              # AI analysis endpoints
│   │       └── review/          # Review queue endpoints
│   ├── components/              # Shared React components
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── cases/               # Case-specific components
│   │   ├── documents/           # Document upload and viewer
│   │   ├── editor/              # TipTap and spreadsheet editors
│   │   └── review/              # Review queue components
│   ├── lib/                     # Shared utilities
│   │   ├── ai/                  # Claude API integration
│   │   │   ├── client.ts        # API client wrapper
│   │   │   ├── prompts/         # System prompts and templates
│   │   │   ├── tokenizer.ts     # PII tokenization engine
│   │   │   └── router.ts        # Case type classification
│   │   ├── auth/                # Auth utilities
│   │   ├── db.ts                # Prisma client
│   │   └── documents/           # Document processing utilities
│   └── types/                   # TypeScript type definitions
├── public/                      # Static assets
└── uploads/                     # Local file storage (dev only)
```

## Database Schema (Key Models)

### Users (employees only)
- id, email, name, passwordHash, role (PRACTITIONER | SENIOR | ADMIN), licenseType (EA | CPA | ATTORNEY), licenseNumber, mfaEnabled, mfaSecret

### Cases (client matters)
- id, caseNumber (CLR-YYYY-MM-NNNN), clientName (encrypted at rest), status (INTAKE | ANALYSIS | REVIEW | ACTIVE | RESOLVED | CLOSED), caseType (OIC | IA | PENALTY | INNOCENT_SPOUSE | CNC | TFRP | ERC | UNFILED | AUDIT | CDP | OTHER), assignedPractitionerId, createdAt, updatedAt

### Documents (uploaded source files)
- id, caseId, fileName, filePath, fileType (PDF | IMAGE | DOCX | XLSX | TEXT), documentCategory (IRS_NOTICE | BANK_STATEMENT | TAX_RETURN | PAYROLL | MEDICAL | MEETING_NOTES | OTHER), extractedText, uploadedById, uploadedAt

### AITasks (each AI analysis request)
- id, caseId, taskType (WORKING_PAPERS | CASE_MEMO | PENALTY_LETTER | OIC_NARRATIVE | GENERAL_ANALYSIS), status (QUEUED | PROCESSING | READY_FOR_REVIEW | APPROVED | REJECTED), tokenizedInput, tokenizedOutput, detokenizedOutput (encrypted), modelUsed, temperature, systemPromptVersion, verifyFlagCount, judgmentFlagCount, requestId (UUID), createdAt

### ReviewActions (audit trail)
- id, aiTaskId, practitionerId, action (APPROVE | EDIT_APPROVE | REJECT_REPROMPT | REJECT_MANUAL), editedOutput (if modified), reviewNotes, reviewStartedAt, reviewCompletedAt

### AuditLog (comprehensive logging)
- id, aiTaskId, practitionerId, caseId, action, metadata (JSON), timestamp

### TokenMaps (PII mapping per case)
- id, caseId, tokenMap (encrypted JSON: { "[SSN-A1B2C3]": "123-45-6789", ... }), createdAt, expiresAt

## System Prompts

System prompts are stored in `src/lib/ai/prompts/` as versioned text files. The naming convention is `{type}_v{version}.txt` (e.g., `oic_analysis_v1.txt`). The active version for each prompt type is tracked in the database.

### Core system prompt (always prepended)
Sets the AI's role, constraints, output format standards, and [VERIFY]/[PRACTITIONER JUDGMENT] flagging behavior. See the Tier 1 spec document for the full prompt text.

### Playbook prompts (task-specific)
- `oic_analysis_v1.txt` — OIC eligibility analysis and working paper generation
- `ia_analysis_v1.txt` — Installment agreement analysis
- `penalty_abatement_v1.txt` — Penalty abatement analysis and letter drafting
- `innocent_spouse_v1.txt` — IRC § 6015 analysis
- `cnc_analysis_v1.txt` — Currently Not Collectible determination
- `tfrp_analysis_v1.txt` — Trust Fund Recovery Penalty / § 6672 analysis
- `case_analysis_v1.txt` — General case analysis (non-playbook cases)
- `case_router_v1.txt` — Case type classification from source documents

## PII Tokenization Rules

### Tier 1 — ALWAYS STRIP (replace with token)
- SSN: `\d{3}-\d{2}-\d{4}` → `[SSN-{hash}]`
- EIN: `\d{2}-\d{7}` → `[EIN-{hash}]`
- Full names (detected via NER or from case record) → `[NAME-{hash}]`
- Dates of birth → `[DOB-{hash}]`
- Street addresses → `[ADDR-{hash}]`
- Bank account numbers → `[BANK-{hash}]`
- Routing numbers → `[RTN-{hash}]`

### Tier 2 — MASK (replace with generic label)
- Employer names → `[EMPLOYER-1]`, `[EMPLOYER-2]`
- Property addresses → `[PROPERTY-1]`, `[PROPERTY-2]`
- IRS notice numbers → `[NOTICE-1]`

### Tier 3 — PASS THROUGH (no tokenization)
- Tax years, filing statuses, income amounts, liability figures
- Tax form numbers, IRS procedure types, penalty types
- Dollar amounts, dates (other than DOB), tax periods

## Coding Standards

- Use TypeScript strict mode everywhere
- Server components by default; client components only when interactivity is needed
- API routes use standard Next.js route handlers with proper error handling
- All database queries go through Prisma
- Environment variables for all secrets (API keys, database URL, encryption keys)
- Never log raw PII — only tokenized versions
- Use `zod` for input validation on all API routes
- Use `next-safe-action` or similar for type-safe server actions

## Build Phases

This project is built in 6 phases. Complete each phase fully and test it before moving to the next.

### Phase 1: Foundation (Auth + Database + Layout)
Set up Next.js project, Prisma schema, PostgreSQL connection, NextAuth with email/password login, MFA setup, role-based access control, and the dashboard shell layout with sidebar navigation.

### Phase 2: Case Management
Case CRUD (create, list, view, edit), document upload with drag-and-drop, document viewer (PDF preview, image display, text extraction display), and case timeline view.

### Phase 3: AI Pipeline Core
PII tokenizer implementation, Claude API client with error handling and retry logic, audit logging for all AI interactions, and the case router (classifies case type from uploaded documents).

### Phase 4: Playbook — OIC Working Papers
The OIC-specific analysis pipeline: takes uploaded documents, extracts financial data, computes RCP, generates the 7-tab working paper structure (matching the existing Excel template), and outputs as an editable spreadsheet in the browser.

### Phase 5: Review Workflow + Editors
Review queue (list of pending AI outputs), TipTap rich text editor for memos/letters, Handsontable spreadsheet editor for working papers, approve/edit/reject actions with full audit trail, and export to .docx/.xlsx.

### Phase 6: Additional Playbooks + Case Analysis
Penalty abatement, installment agreement, TFRP, and general case analysis modes. Each follows the same pattern: prompt template → API call → structured output → review.

## Important Commands

```bash
# Development
npm run dev          # Start dev server
npx prisma studio    # Database GUI
npx prisma migrate dev  # Run migrations
npx prisma generate  # Regenerate client after schema changes

# Testing
npm run test         # Run tests
npm run lint         # Lint check
npm run build        # Production build check
```
