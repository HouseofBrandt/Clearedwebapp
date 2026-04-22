# Form Builder V2 — Spec

**Status:** In progress (partial implementation landed; see §14 and `PROGRESS.md` for status).
**Priority:** P0.

This file is the canonical spec for the form builder rebuild. The full spec (~7,000 words) was handed to engineering by the firm. It is preserved verbatim in project history; this file may be trimmed over time as work completes.

See also:
- `docs/forms.md` — architecture reference for future maintainers (schema/binding/metadata split, rendering, search).
- `PROGRESS.md` — reverse-chronological log of what has landed.
- `TASKS.md` — remaining work broken into actionable items.

---

## 1. Why this work exists

The form builder in its pre-V2 shape did less than it looked like it did:

- 7 schemas existed but only 4 had PDF files on disk (433-A, 433-A-OIC, 12153, 911). 656/843/9465 would never render.
- `FieldDef.pdfMapping` was declared on the core type but never populated — dead architecture.
- PDF fill logic duplicated across `preview-pdf/route.ts` (inline), `pdf-maps/form-433a-pdf.ts`, and a prototype AI auto-mapper.
- `generateFormPackage()` was written but never called — the case-aware packaging story wasn't reachable from the UI.
- Auto-populate did naive string-grep over document text; prefill rate hovered around 10-20% of fields on a fully-documented case.

V2 rebuilds the form builder around six commitments:

1. Every major resolution form is buildable (target: 16 forms).
2. One PDF rendering path, version-aware, data-driven (bindings as JSON fixtures).
3. The resolution engine is the hub — a case-first surface replaces the generic form picker.
4. Auto-populate uses hybrid search (embeddings + FTS + structured extraction + AI inference). Target ≥60% prefill on 433-A.
5. Form instances are case-first.
6. The renderer is correct, fast, and observable — every fill attempt logs which fields succeeded, failed, and why.

---

## 2. Architecture: three layers

**Layer 1 — Semantic schema (`FormSchema`).** What the form *is*. Field IDs, types, validation, conditionals, IRS line references, section structure. No PDF concerns. Stays in TypeScript (lives at `src/lib/forms/schemas/*.ts`).

**Layer 2 — PDF binding (`PDFBinding`).** How fields map to a specific PDF revision. Stored as JSON fixtures in `src/lib/forms/pdf-bindings/{formNumber}/{revision}.json`. Never in TypeScript. One binding per revision.

**Layer 3 — Publication metadata (`FormMetadata`).** When was this revision issued? What's the OMB number? Lives at `src/lib/forms/metadata/*.ts`.

See `src/lib/forms/types.ts` for the canonical type definitions and `docs/forms.md` for the architecture walkthrough.

---

## 3. PDF renderer

Lives at `src/lib/forms/pdf-renderer/`. Strategies per binding:

- `acroform` — PDF has a real AcroForm. Fill via `setTextField/check/uncheck`. Preferred.
- `coordinate` — XFA-based PDFs where AcroForm is stripped on load. Use `page.drawText` at coordinates. Used for 433-A specifically.
- `hybrid` — AcroForm text + coordinate checkboxes.

Every `fillPDF()` call returns a complete `FillResult` with `filled/skipped/failed` counts. No silent failures.

Value transforms (`ssn-format`, `currency-no-symbol`, `date-mmddyyyy`, etc.) are applied before fill. Flattening is on by default.

See `src/lib/forms/pdf-renderer/index.ts`.

---

## 4. Document search rebuild

Three-retriever hybrid:

- **Retriever A** — structured extraction (`DocumentExtract` table). For well-known document types (1040, W-2, 1099, bank statement, IRS notice), Claude parses on upload into structured JSON.
- **Retriever B** — embedding search over chunked documents (`DocumentChunk` table + pgvector). Chunk on write; 400-token overlapping windows.
- **Retriever C** — Postgres FTS fallback over chunk content.

Results merged by document; top K passed as context to Claude for AI field inference. Every inferred field gets a confidence score + source citation.

See `src/lib/documents/search.ts` and `src/lib/documents/extractors/`.

---

## 5. Case-first hub

`/cases/:caseId/forms` renders the resolution package for the case: required + recommended + if-applicable forms, with progress indicators, reason-for-inclusion, and a "Download package as PDF" action that produces a merged PDF with cover sheet and TOC.

---

## 6. What's in v1 (this PR series), what's deferred

**Landed or landing:**
- Schema/binding/metadata split (`types.ts`, `registry.ts`, `metadata/`, `pdf-bindings/`)
- New PDF renderer module with all three strategies
- 4 existing forms migrated to bindings (433-A, 433-A-OIC, 12153, 911)
- New form schemas: 2848, 4506-T, 14039, 12277 (schemas only — PDFs must be placed in `public/forms/` before bindings can render)
- `DocumentChunk`, `DocumentExtract`, `FormInstanceSensitive` Prisma models
- Chunking + embedding pipeline (builds on `src/lib/knowledge/` infra)
- `searchCaseDocuments()` hybrid search
- `autoPopulateV3()` with batched AI inference
- Case-first hub at `/cases/:caseId/forms`
- Package download with cover sheet + TOC
- `FORM_BUILDER_V2_ENABLED` feature flag
- Unit tests for types, bindings, renderer, search, auto-populate

**Deferred to follow-up PRs (captured in TASKS.md):**
- 8 additional form schemas (656 completions, 843 completions, 9465 completions, 433-B, 433-B-OIC, 8857, 433-F, 1040-X)
- PDF binding files for any form without a PDF on disk (IRS PDF acquisition is a manual step per form)
- Golden-PDF tests for every form
- Backfill of `DocumentChunk`/`DocumentExtract` for pre-existing documents (requires production run)
- `values` column encryption migration (destructive — requires multi-step rollout)
- Analytics dashboard at `/admin/forms-analytics`
- Internal dogfood + percentage rollout

---

## 7. Rollout

Controlled via `FORM_BUILDER_V2_ENABLED` env var. When false, the legacy form hub and renderer route remain active. When true, the case-first hub is the primary surface and the new renderer is used.

Rollback: flip the flag. Existing `FormInstance` rows remain valid; `revision` defaults to the legacy mapping.

---

*Full original spec is preserved in PR #140's body and in project history. This file tracks the operational shape of the spec as it evolves.*
