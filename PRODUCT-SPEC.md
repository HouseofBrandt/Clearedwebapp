# CLEARED — Complete Product Specification

> **This document is the single source of truth for what the Cleared platform must do.**
> Claude Code: read this file before building or modifying any feature. Every feature,
> workflow, and requirement described here must be implemented. If something in CLAUDE.md
> conflicts with this document, this document wins.

---

## What Is Cleared?

Cleared is an internal web application for a tax resolution firm. Licensed tax professionals (Enrolled Agents, CPAs, and attorneys) use this platform to resolve IRS tax debt for clients. The platform uses AI (Claude API) to accelerate document analysis, financial computation, and work product drafting — but every AI output is reviewed and approved by a licensed human before it reaches the client or the IRS.

**The AI is infrastructure. The licensed professional is the service provider. The client relationship is with the firm.**

---

## The Three Tiers

### Tier 1 — Internal Practitioner Platform (THIS APP)

The core application. Practitioners log in, manage cases, upload client documents, run AI-powered analysis, review and edit AI output, and produce final deliverables (working papers, letters, memos) for clients and the IRS.

**Users:** Cleared's licensed practitioners and support staff only. No public access. No client logins.

**Key principle:** No AI output leaves the platform without explicit human approval.

### Tier 2 — Client Intake Portal (FUTURE — NOT IN THIS BUILD)

A separate, public-facing web application where prospective clients answer questions about their tax situation, upload initial documents, and receive a preliminary assessment. Feeds data into the Tier 1 platform.

**Status:** Not yet built. Tier 1 must be fully functional first.

### Tier 3 — Research & Knowledge Layer (FUTURE — NOT IN THIS BUILD)

Non-client-specific research tools for staying current on IRS procedures, Tax Court decisions, and regulatory changes. Uses Perplexity API or Claude with web search for general tax research. No client PII involved.

**Status:** Not yet built. Can be added as a module within Tier 1 later.

---

## Tier 1 — Complete Feature Specification

### 1. Authentication & Access Control

#### 1.1 Login
- Email + password authentication
- No public registration — accounts are created by an admin
- Session-based with secure httpOnly cookies
- Redirect to /login if not authenticated
- "Forgot password" flow via email reset link

#### 1.2 Multi-Factor Authentication (MFA)
- TOTP-based (Google Authenticator, Authy, etc.)
- Required for all users before accessing any case data
- MFA setup flow on first login after admin creates account
- Backup recovery codes generated at MFA setup (store encrypted)
- Admin can reset a user's MFA if they lose their device

#### 1.3 Roles & Permissions

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| **Admin** | Everything. Create/deactivate users, access all cases, view all audit logs, manage system prompts, view compliance dashboard. | N/A |
| **Senior Practitioner** | Access all cases, review any practitioner's queue, approve AI output, export deliverables, view team-level reporting. | Create/deactivate users, modify system prompts. |
| **Practitioner** | Access assigned cases, upload documents, run AI analysis, review and approve AI output on their own cases, export deliverables. | Access other practitioners' cases (unless reassigned), view compliance dashboard. |
| **Support Staff** | Upload documents, view case status, manage client contact info, run document processing. | Run AI analysis, approve AI output, export final deliverables. |

#### 1.4 User Management (Admin Only)
- Create new user: name, email, role, license type (EA/CPA/Attorney/None), license number
- Deactivate user (soft delete — never hard delete, preserving audit trail)
- Reset user password, reset user MFA
- View user activity log

---

### 2. Case Management

#### 2.1 Case Creation
- **Case number:** Auto-generated as CLR-YYYY-MM-NNNN (sequential within month)
- **Required fields:** Client name(s), filing status (Single, MFJ, MFS, HOH, QSS), case type (see 2.3), assigned practitioner
- **Optional fields:** Client phone, client email, client address, total estimated liability, notes, referral source
- **Client name encryption:** Client names are encrypted at rest in the database. They are displayed in the UI for authorized users but never stored in plaintext.

#### 2.2 Case Status Lifecycle

```
INTAKE → ANALYSIS → REVIEW → ACTIVE → RESOLVED → CLOSED
                       ↑         |
                       └─────────┘  (can return to REVIEW if new issues arise)
```

- **INTAKE:** Case created, collecting documents. No AI analysis run yet.
- **ANALYSIS:** AI analysis has been triggered. Documents are being processed.
- **REVIEW:** AI output is in the review queue waiting for practitioner approval.
- **ACTIVE:** Working papers and strategy approved. Case is being actively worked (correspondence with IRS, negotiations, etc.).
- **RESOLVED:** IRS has accepted the resolution (OIC accepted, IA established, penalties abated, etc.).
- **CLOSED:** Case is complete. Final billing done. All deliverables archived.

#### 2.3 Case Types

**Structured Playbook Cases** (produce templated working papers):
- **OIC** — Offer in Compromise
- **IA** — Installment Agreement
- **PENALTY** — Penalty Abatement
- **INNOCENT_SPOUSE** — Innocent Spouse Relief (IRC § 6015)
- **CNC** — Currently Not Collectible

**Analytical Cases** (produce strategy memos and custom analysis):
- **TFRP** — Trust Fund Recovery Penalty (§ 6672)
- **ERC** — Employee Retention Credit issues
- **UNFILED** — Unfiled tax returns (including SFR correction)
- **AUDIT** — IRS audit defense
- **CDP** — Collection Due Process hearing
- **AMENDED** — Amended return preparation and analysis
- **VOLUNTARY_DISCLOSURE** — Voluntary disclosure (offshore, ERC, crypto)

**General:**
- **OTHER** — Anything that doesn't fit above. Uses general case analysis mode.

A single case can involve multiple types. For example, an OIC case might also need penalty abatement analysis. The system supports running multiple AI analysis tasks per case.

#### 2.4 Case Detail View

The case detail page has these tabs:

**Overview Tab:**
- Case info (number, client, type, status, assigned practitioner, dates)
- Liability summary table (tax year, type, assessment, penalties, interest, balance, CSED)
- Case notes (rich text, editable by practitioner)
- Activity timeline (creation, document uploads, AI analyses, review actions, status changes)

**Documents Tab:**
- List of all uploaded documents with metadata (filename, type, category, upload date, uploaded by)
- Drag-and-drop upload zone for new documents
- Document viewer: displays PDFs inline, images inline, extracted text in side panel
- Document category assignment (dropdown: IRS Notice, Bank Statement, Tax Return, Pay Stub, Mortgage Statement, Insurance, Medical Records, Meeting Notes, Utility Bill, Vehicle Loan, Student Loan, Retirement Account, Other)

**Analysis Tab:**
- List of all AI tasks run for this case (task type, status, date, model used, flag counts)
- "New Analysis" button — opens analysis type selector
- For completed analyses: click to open in the review workspace

**Deliverables Tab:**
- List of all approved, finalized outputs (working papers, letters, memos)
- Export buttons (download as .xlsx, .docx, .pdf)
- Status: Draft (not yet approved) vs. Final (approved by practitioner)

---

### 3. Document Processing Pipeline

#### 3.1 Supported File Types
- **PDF** — text extraction via pdf-parse; OCR via Tesseract.js for scanned PDFs
- **Images (JPG, PNG, TIFF)** — OCR via Tesseract.js
- **DOCX** — text extraction via mammoth
- **XLSX/CSV** — data extraction via SheetJS
- **TXT** — direct read

#### 3.2 Processing Flow
1. User uploads file → stored in secure file storage (local /uploads in dev, S3 in production)
2. System detects file type and runs appropriate text extraction
3. Extracted text is stored on the Document record in the database
4. For scanned PDFs and images, OCR runs automatically; an "OCR Confidence" indicator shows quality
5. User can manually correct OCR errors in the extracted text panel
6. Extracted text is available for AI analysis

#### 3.3 IRS Transcript Parser (Specialized)
IRS Account Transcripts have a predictable, structured format. The system includes a specialized parser that:
- Identifies transaction codes (TC 150, 170, 276, 196, 300, 420, 520, 806, 846, etc.)
- Extracts assessment dates, CSED dates, notice dates
- Computes total liability by tax period
- Flags key events (levy issued, lien filed, return filed, payment posted)
- Outputs structured data that populates the liability summary table on the case overview

---

### 4. AI Pipeline

#### 4.1 PII Tokenization (MANDATORY — runs before every API call)

All client data is tokenized before being sent to the Claude API. Real PII never leaves Cleared's infrastructure.

**Tier 1 — ALWAYS STRIP (replace with deterministic token):**
- Social Security Numbers: `\d{3}-\d{2}-\d{4}` → `[SSN-{6-char-hash}]`
- EINs: `\d{2}-\d{7}` → `[EIN-{hash}]`
- Full names (matched from case record + NER patterns) → `[NAME-{hash}]`
- Dates of birth → `[DOB-{hash}]`
- Street addresses → `[ADDR-{hash}]`
- Bank account numbers → `[BANK-{hash}]`
- Routing numbers → `[RTN-{hash}]`

**Tier 2 — MASK (replace with generic descriptor):**
- Employer names → `[EMPLOYER-1]`, `[EMPLOYER-2]`
- Specific property addresses → `[PROPERTY-1]`, `[PROPERTY-2]`
- IRS notice numbers → `[NOTICE-1]`

**Tier 3 — PASS THROUGH (analytical data, no PII risk):**
- Tax years, filing statuses, income amounts, liability figures
- Tax form numbers, penalty types, IRS procedure types
- Dollar amounts, dates (other than DOB), tax periods

**Token mapping:** Stored encrypted (AES-256) per case. Used to de-tokenize AI output for practitioner review. Mapping is deterministic within a session so the AI can cross-reference data points consistently.

**Pre-flight validation:** Before every API call, the system scans the tokenized payload for any remaining SSN/EIN patterns. If found, the call is BLOCKED and the practitioner is alerted.

**Practitioner preview:** Before the API call executes, the practitioner sees the tokenized version of the input and can confirm or manually redact additional data.

#### 4.2 Claude API Integration

**Provider:** Anthropic (api.anthropic.com)
**Models:**
- `claude-sonnet-4-6` — primary model for all standard tasks (working papers, penalty letters, IA analysis)
- `claude-opus-4-6` — reserved for complex analytical work (TFRP memos, multi-issue case analysis, novel legal questions). Practitioner can select model before running analysis.

**Configuration:**
- Temperature: 0.1 for structured/analytical tasks, 0.3 for narrative drafting
- Max tokens: 8,192 standard, 16,384 for complex drafting tasks
- Timeout: 60 seconds
- Retry: exponential backoff on 429/500/503, up to 3 retries

**API key:** Stored in environment variable `ANTHROPIC_API_KEY`. Never hardcoded. Never exposed to frontend.

**Data handling:** Under Anthropic's commercial API terms, inputs and outputs are NOT used for model training. A Data Processing Agreement (DPA) should be executed with Anthropic before processing real client data.

#### 4.3 System Prompts

All system prompts are stored as versioned text files in `src/lib/ai/prompts/`. The naming convention is `{type}_v{version}.txt`.

**Core system prompt** (prepended to every API call):
- Defines AI role: analytical assistant for licensed tax practitioners
- Establishes constraints: not a tax advisor, output requires human review
- Explains tokenization: treat `[TOKEN-HASH]` as placeholders
- Requires specific citations: IRC sections, IRM references, Treasury Regulations
- Defines flag system: `[VERIFY: description]` for uncertain citations, `[PRACTITIONER JUDGMENT: description]` for strategic decisions, `[MISSING: description]` for data gaps
- Sets output format standards

**Task-specific prompts:**
- `case_router_v1.txt` — classifies case type and identifies issues from documents
- `oic_analysis_v1.txt` — OIC working paper generation (JSON output)
- `ia_analysis_v1.txt` — installment agreement analysis
- `penalty_abatement_v1.txt` — penalty analysis + draft letter
- `innocent_spouse_v1.txt` — IRC § 6015 analysis
- `cnc_analysis_v1.txt` — CNC determination
- `tfrp_analysis_v1.txt` — § 6672 responsible person analysis
- `erc_analysis_v1.txt` — ERC credit analysis
- `case_memo_v1.txt` — general case strategy memorandum
- `unfiled_returns_v1.txt` — unfiled return analysis and preparation checklist

**Prompt versioning:** Changes require review by a licensed practitioner, testing against standardized test cases, and documentation in a change log.

#### 4.4 AI Task Workflow

```
Practitioner selects analysis type
    ↓
System collects all document extracted text for the case
    ↓
PII Tokenizer strips/masks all PII
    ↓
Practitioner sees tokenized preview → confirms or edits
    ↓
System sends tokenized data + system prompt + task prompt to Claude API
    ↓
API returns structured response
    ↓
System validates response (parseable JSON for playbooks, text for memos)
    ↓
System de-tokenizes the response using the case's token map
    ↓
Output enters the review queue with status READY_FOR_REVIEW
    ↓
Everything is logged to the audit trail
```

#### 4.5 Case Router

The case router is a special AI task that runs when a practitioner clicks "Analyze Case" for the first time. It:
1. Takes all uploaded document text (tokenized)
2. Sends it to Claude with the case_router prompt
3. Returns: recommended case type(s), identified tax periods, estimated total liability, key issues spotted, recommended playbooks to run, missing documents needed
4. Practitioner reviews the classification and confirms or overrides

---

### 5. Playbook Mode — Structured Output

Playbook mode is for case types with a predictable analytical structure. The AI extracts data from source documents, performs calculations, and returns structured JSON that the system renders into editable working papers.

#### 5.1 OIC Working Papers

**Input:** All case documents (bank statements, tax returns, IRS transcripts, pay stubs, mortgage statements, insurance docs, utility bills, retirement account statements, client intake notes)

**AI task:** Extract all relevant financial data and return a JSON object matching the 7-tab working paper structure.

**Output tabs:**

1. **Summary** — RCP calculation: net personal asset equity + net business asset equity + future remaining income (12x monthly net for lump sum, 24x for periodic) = offer amount. Shows total tax liability for comparison. Formulas auto-calculate from detail tabs.

2. **TP Info** — Taxpayer names, dependents (names, ages, DOB, income, residency), employment info, self-employment details (business name, EIN, address, employees, payroll), and the full 433-A questionnaire (lawsuits, bankruptcy, IRS litigation, trust beneficiary, life insurance, safe deposit box, asset transfers).

3. **Income & Expenses — Personal** — All income sources (wages, Social Security, pensions, other income, interest, dividends, distributions from entities, child support, alimony). All expense categories (food/clothing/misc, housing & utilities, vehicle payments, vehicle operation, public transportation, health insurance, out-of-pocket health, court-ordered payments, child care, life insurance, current taxes, secured debts). Monthly and annual columns.

4. **Assets & Debts — Personal** — Cash on hand, bank accounts (institution, type, balance), retirement accounts (type, custodian, balance), life insurance (company, cash value, loan balance, net), real estate (description, purchase date, FMV, 20% quick-sale reduction, loan balance, net equity), vehicles (year/make/model, mileage, FMV, 20% reduction, loan balance, net equity), digital assets, safe deposit box contents, other assets.

5. **Business Information** — Business name, EIN, entity type, return type, officers/partners, accounts receivable, notes receivable, and the full 433-B questionnaire (bankruptcy, affiliations, related party debts, litigation, asset transfers, foreign operations, third-party funds, lines of credit).

6. **Income & Expenses — Business** — Gross receipts, rental income, interest, dividends, other income. Expenses: materials, inventory, wages, rent, supplies, utilities, vehicle costs, insurance, current taxes, other expenses (with itemized detail).

7. **Assets & Debts — Business** — Cash on hand, business bank accounts, accounts receivable, equipment (FMV, 20% reduction, loan balance, net equity), business vehicles, real estate, intangible assets/goodwill (flagged for practitioner judgment), lines of credit, other assets.

**AI flags in output:**
- `[VERIFY: ...]` — yellow highlight in rendered spreadsheet. AI is uncertain about a value or citation.
- `[MISSING: ...]` — red highlight. Source documents don't contain this data; practitioner needs to get it from the client.
- `[PRACTITIONER JUDGMENT: ...]` — orange highlight. Strategic decision required (e.g., whether to include A/R, how to handle dissipated assets, retirement account discount arguments).

**Rendering:** The JSON output renders as an interactive spreadsheet in the browser (Handsontable or AG Grid). All cells are editable. The Summary tab has live formulas that recalculate when detail values change. Flag cells are color-coded.

#### 5.2 Installment Agreement Analysis

Same financial data extraction as OIC. Different calculations:
- Determines streamlined IA eligibility ($50,000 or $100,000 threshold)
- Computes minimum monthly payment from Collection Information Statement
- Calculates total payoff amount over the IA term (with accruing interest)
- Identifies CSED dates and computes whether the balance will be fully paid before CSED expiration
- Recommends IA type (streamlined, non-streamlined, partial pay)

**Output:** Working paper spreadsheet (similar to OIC but with IA-specific summary) + recommended IA terms.

#### 5.3 Penalty Abatement

**Input:** IRS transcripts, compliance history, client narrative about circumstances.

**AI task:** Analyze penalty type, amount, and period. Evaluate First Time Abatement (FTA) eligibility per IRM 20.1.1.3.6.1. Evaluate reasonable cause per IRM 20.1. Draft the abatement request letter.

**Output:**
- Structured analysis card (penalty type, amount, period, recommended theory, FTA eligibility, supporting citations)
- Draft penalty abatement letter (rendered in TipTap rich text editor for editing)
- Supporting documentation checklist (what to include with the request)

#### 5.4 Innocent Spouse Relief

**Input:** Joint tax returns, financial records, client narrative.

**AI task:** Analyze eligibility under § 6015(b) (traditional), § 6015(c) (separation of liability), and § 6015(f) (equitable relief). Apply Rev. Proc. 2013-34 factors for equitable relief.

**Output:** Structured analysis with factor-by-factor scoring + draft Form 8857 narrative.

#### 5.5 Currently Not Collectible (CNC)

Same financial data as OIC. AI determines whether the taxpayer meets CNC criteria (expenses equal or exceed income, no significant asset equity). Produces a hardship determination memo and recommended 433-A presentation strategy.

---

### 6. Case Analysis Mode — Narrative Output

For non-playbook cases where the resolution path itself needs to be determined. The AI reads the facts, identifies legal issues, and produces a strategic memorandum.

#### 6.1 General Case Analysis

**When used:** TFRP, ERC, unfiled returns, audit defense, CDP, voluntary disclosure, or any case type marked OTHER.

**Input:** All case documents + practitioner's case notes describing the situation.

**AI task:** Identify all legal and procedural issues. For each issue: state the applicable law (IRC section, regulation, IRM provision), analyze how the facts apply, assess the strength of the client's position, and recommend a course of action.

**Output:**
- Case strategy memorandum (rendered in TipTap)
- Issue list with risk assessment (high/medium/low)
- Recommended next steps
- Missing documents / information checklist
- Timeline of critical deadlines (CSED dates, appeal periods, filing deadlines)

#### 6.2 TFRP Analysis (§ 6672)

**Hybrid mode:** Structured liability computation + analytical memo.

**Structured output:** Quarterly trust fund tax liability worksheet (Form 941 data by quarter, trust fund portion separated from employer portion, assessment dates, CSED dates).

**Narrative output:** Responsible person analysis — who had authority to direct payment of taxes? Was the failure "willful"? Defenses (reliance on accountant, delegation, embezzlement by third party). Form 4180 interview preparation strategy.

#### 6.3 ERC Analysis

**Narrative output:** Analysis of whether the ERC credits were legitimately claimed. If not: liability computation (credits claimed + interest + potential penalties), strategic options (voluntary disclosure program, amended returns, contest IRS position), promoter liability analysis, reasonable cause arguments for penalties.

#### 6.4 Unfiled Returns

**Hybrid mode:** Return preparation checklist (structured) + reasonable cause analysis (narrative).

**Structured output:** List of unfiled periods, SFR assessment amounts vs. estimated actual liability, source documents needed per period, estimated refund or additional tax due per period.

**Narrative output:** If penalties are at issue, reasonable cause analysis tied to the specific facts (medical incapacity, reliance on professional, disaster, etc.). For medical cases: timeline mapping medical events to filing deadlines.

---

### 7. Review Workflow

The review workflow is the compliance backbone. No AI output reaches a client or the IRS without passing through this system.

#### 7.1 Review Queue

**Located at:** /review

**Shows:** All AI tasks with status READY_FOR_REVIEW across all cases (filtered by practitioner assignment for regular practitioners, all cases for senior practitioners and admins).

**Columns:** Task ID, Case Number, Client Name, Task Type, Model Used, Verify Flag Count, Judgment Flag Count, Priority, Age (time since generated).

**Sorting:** Default sort by priority (highest first), then by age (oldest first).

**Priority calculation:**
- **Critical:** CSED within 90 days, or levy notice deadline approaching
- **High:** CSED within 12 months, or client-requested deadline
- **Normal:** All other tasks
- **Low:** Research tasks, non-urgent analysis

**Filters:** By case type, by task type, by assigned practitioner, by priority, by date range.

#### 7.2 Review Workspace

**Full-screen view with two panels:**

**Left panel — Source documents:**
- Scrollable list of all documents for the case
- Click to view: PDF renders inline, images display, extracted text shown
- Can switch between documents while reviewing

**Right panel — AI output:**
- For working papers: interactive spreadsheet editor (Handsontable/AG Grid)
- For memos and letters: TipTap rich text editor
- For structured analysis: card-based read view with editable fields

**Top bar:**
- Case info (number, client, type)
- Flag summary: "[3 VERIFY flags] [1 JUDGMENT flag] [2 MISSING items]" — clickable, jumps to the relevant cell or section
- Model and prompt version used

**Bottom bar — Review actions:**

| Action | What It Does | When to Use |
|--------|-------------|-------------|
| **Approve** | Marks output as final. Records practitioner ID, timestamp. Output can now be exported. | AI output is correct as-is. |
| **Edit & Approve** | Saves practitioner's edits. Records both original AI output and edited version. Marks as final. | Output needs corrections but is fundamentally sound. **This is the expected default path for most tasks.** |
| **Reject & Re-prompt** | Opens a notes field. Practitioner writes what's wrong. A new AI task is created with the correction notes appended to the prompt. Original output is preserved in audit log. | Output has fundamental problems that require re-analysis. |
| **Reject & Manual** | Marks task as rejected. Practitioner completes the work outside the system. Logged for quality tracking. | AI cannot handle this specific situation. |

#### 7.3 Review Quality Controls

- **No export without review:** Working papers, letters, and memos cannot be exported or downloaded until the associated AI task has been approved (Approve or Edit & Approve).
- **Review time tracking:** The system records when the practitioner opens the review workspace and when they take a review action. If review is completed in under 60 seconds for a complex task (working papers, case memos), a soft warning appears: "This review was completed very quickly. Are you sure you've reviewed all flagged items?"
- **Flag resolution tracking:** Verify and Judgment flags must be individually acknowledged (clicked/dismissed) before approval. This ensures the practitioner has seen every flagged item.

#### 7.4 Weekly Compliance Report

**Available to:** Admin and Senior Practitioner roles.

**Contents:**
- Total AI tasks generated, reviewed, approved, rejected this week
- Average review time by task type
- Verify flag rate (what % of tasks had verify flags)
- Judgment flag resolution (how often practitioners changed flagged values)
- Tasks reviewed in under 60 seconds (potential rubber-stamping)
- Tasks rejected & sent to manual (AI capability gaps)
- Practitioner-level breakdown of all above metrics

---

### 8. Output Generation & Export

#### 8.1 Working Papers → Excel (.xlsx)

When a practitioner approves OIC or IA working papers, the system can export to Excel:
- 7-tab structure matching the in-browser spreadsheet
- Formulas intact (Summary tab calculations work in Excel)
- Professional formatting (headers, borders, color-coded cells)
- Flag cells highlighted with comments explaining the flag
- Generated using ExcelJS or openpyxl

#### 8.2 Letters & Memos → Word (.docx)

When a practitioner approves a letter or memo in TipTap:
- AI markdown response is parsed to an AST (using `marked`), then each node is rendered as proper Word elements
- Headings → Word heading styles (H1: navy 16pt, H2: blue accent 13pt, H3: dark gray 11pt)
- **bold**, *italic*, `code` → proper Word inline formatting
- Markdown tables → real Word tables with navy header row, alternating row shading, borders
- Blockquotes → shaded callout boxes (light blue background, left blue border)
- Bullet and numbered lists → proper Word list formatting
- `---` → styled horizontal rule (thin blue accent line)
- [VERIFY] → yellow highlighted bold red text; [PRACTITIONER JUDGMENT] → orange highlighted text; [MISSING] → red highlighted text
- [ ] checkboxes → Word checkbox characters (☐/☑)
- Cover block: "CLEARED" header, case number, client name, date, "DRAFT — Requires Practitioner Review" stamp
- Header on every page: "Cleared — [Case Number]"
- Footer on every page: "Confidential — Page X"
- Cleared color scheme: navy #1B2A4A headers, #2E75B6 accent
- Generated using the `docx` npm package with `marked` for markdown AST parsing

**Font requirement:** All exported documents (.docx, .pdf) must use Times New Roman as the only font. This applies to headings, body text, tables, headers, footers, and all other elements. This is a firm-wide standard.

#### 8.3 Case Summary → PDF

One-page case summary showing case info, liability table, resolution status, and key dates. Useful for internal reporting and client communication.

---

### 9. Audit & Logging

#### 9.1 What Gets Logged

Every AI interaction creates an audit record:
- Request ID (UUID), timestamp
- Practitioner ID, case ID, matter reference
- Task type, model used, temperature, prompt version
- Tokenized input (full prompt as sent to API)
- Tokenized output (full response from API)
- Verify flag count, judgment flag count
- Review action taken, review timestamps
- Edited output (if modified by practitioner)

#### 9.2 Retention

- All audit logs retained for 7 years (IRS record retention alignment)
- Token mapping tables retained until case is closed, then purged
- Source documents retained for 7 years after case closure

#### 9.3 Log Security

- Logs encrypted at rest (AES-256)
- Tokenized prompts/responses stored separately from token mapping tables
- Access restricted by role (practitioners see their own task history; admins see everything)
- Append-only storage with integrity verification

---

### 10. Security Requirements

#### 10.1 Encryption
- All data in transit: TLS 1.3 (HTTPS)
- Client names in database: encrypted at rest
- Token mapping tables: encrypted with separate key from main database
- File storage: encrypted at rest (S3 server-side encryption or equivalent)

#### 10.2 Access Control
- Authentication: email/password + TOTP MFA (mandatory)
- Authorization: role-based (see section 1.3)
- API key: stored in environment variable or secrets manager, never in code
- Session timeout: 30 minutes of inactivity

#### 10.3 Data Handling
- PII never sent to Claude API (tokenization boundary is absolute)
- No client data in application logs (only tokenized versions)
- API calls logged with tokenized payloads only
- File uploads stored outside the web-accessible directory

---

### 11. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14+ (App Router), React, TypeScript, Tailwind CSS | Server components by default |
| UI Components | shadcn/ui | Consistent, accessible component library |
| Rich Text Editor | TipTap | For memos, letters, narratives |
| Spreadsheet Editor | Handsontable or AG Grid Community | For working papers |
| Database | PostgreSQL via Prisma ORM | All models defined in Prisma schema |
| Authentication | NextAuth.js | Credentials provider + TOTP MFA |
| File Storage | Local filesystem (dev) / S3 (production) | Encrypted at rest |
| AI | Anthropic Claude API (@anthropic-ai/sdk) | Sonnet 4.6 primary, Opus 4.6 for complex tasks |
| Document Processing | pdf-parse, Tesseract.js, mammoth, SheetJS | OCR + text extraction |
| Excel Generation | ExcelJS | Working paper export |
| Word Generation | docx (npm) | Letter and memo export |
| Input Validation | zod | All API route inputs validated |
| Deployment | Vercel (app) + Supabase or Neon (database) + S3 (files) | Can also self-host |

---

### 12. Pages & Routes

```
/login                          — Login page
/login/mfa                      — MFA verification
/dashboard                      — Home dashboard (case summary, review queue count, recent activity)
/cases                          — Case list (table with search, filter, sort)
/cases/new                      — New case form
/cases/[id]                     — Case detail (tabbed: Overview, Documents, Analysis, Deliverables)
/cases/[id]/analysis/new        — New analysis: select type, configure, preview tokenized input, confirm
/cases/[id]/analysis/[taskId]   — View completed analysis output
/review                         — Review queue (list of pending tasks)
/review/[taskId]                — Review workspace (split view: documents + output editor)
/settings                       — User settings (profile, password change, MFA management)
/settings/users                 — User management (admin only)
/settings/compliance            — Compliance dashboard (admin + senior)
/settings/prompts               — System prompt management (admin only)
```

---

### 13. Database Models (Prisma Schema)

```
User
  id, email, name, passwordHash, role, licenseType, licenseNumber,
  mfaEnabled, mfaSecret, recoveryCodesHash, active, createdAt, updatedAt

Case
  id, caseNumber, clientName (encrypted), clientEmail, clientPhone,
  clientAddress (encrypted), filingStatus, caseType, status,
  totalLiability, assignedPractitionerId, notes, createdAt, updatedAt

Document
  id, caseId, fileName, filePath, fileSize, fileType, documentCategory,
  extractedText, ocrConfidence, uploadedById, uploadedAt

AITask
  id, caseId, taskType, status, tokenizedInput, tokenizedOutput,
  detokenizedOutput (encrypted), modelUsed, temperature, maxTokens,
  systemPromptVersion, taskPromptVersion, verifyFlagCount,
  judgmentFlagCount, missingFlagCount, requestId (UUID),
  createdById, createdAt, completedAt

ReviewAction
  id, aiTaskId, practitionerId, action, editedOutput (encrypted),
  reviewNotes, flagsAcknowledged, reviewStartedAt, reviewCompletedAt,
  createdAt

TokenMap
  id, caseId, tokenMap (encrypted JSON), createdAt, expiresAt

AuditLog
  id, userId, caseId, aiTaskId, action, metadata (JSON), ipAddress,
  timestamp

LiabilityPeriod
  id, caseId, taxYear, formType, originalAssessment, penalties,
  interest, totalBalance, assessmentDate, csedDate, status
```

---

### 14. Non-Functional Requirements

- **Performance:** Pages load in under 2 seconds. AI analysis tasks show real-time progress (streaming response if possible).
- **Reliability:** Graceful error handling on all API calls. Failed AI calls preserve input for retry without re-tokenization.
- **Accessibility:** WCAG 2.1 AA compliance. Keyboard navigable. Screen reader compatible.
- **Mobile:** Responsive design. Review queue and case list usable on tablet. Full review workspace is desktop-only (spreadsheet editing requires full screen).
- **Browser Support:** Chrome, Firefox, Safari, Edge (latest 2 versions).

---

### 15. What's NOT in Tier 1 (Explicitly Out of Scope)

- Client-facing portal (Tier 2)
- Public registration or client logins
- Billing and invoicing
- IRS e-filing or direct IRS system integration
- Email integration (sending letters directly to IRS from the platform)
- Real-time collaboration (multiple practitioners editing simultaneously)
- Custom report builder
- Integration with practice management software (Clio, PracticePanther, etc.)

These may be added later but are NOT part of the initial build.

---

## How to Use This Document

**For Claude Code:**
1. Read this file at the start of every session
2. Cross-reference with CLAUDE.md for technical implementation details
3. If a feature described here is not yet built, build it
4. If a feature is built but doesn't match this spec, fix it
5. When in doubt about a requirement, this document is authoritative

**For the development team:**
1. Each numbered section maps roughly to a build phase
2. Sections 1-2 are foundation (auth, cases)
3. Sections 3-4 are the AI pipeline (documents, tokenization, API)
4. Sections 5-6 are the analysis modes (playbooks, case analysis)
5. Section 7 is the review workflow
6. Sections 8-14 are supporting infrastructure

**For compliance review:**
This document, combined with the Tier 1 Technical Specification, demonstrates that Cleared has implemented firm-level procedures for AI use consistent with Circular 230 § 10.36, ABA Model Rules 1.1, 1.6, and 5.3, and IRS Publication 4557 data security requirements.
