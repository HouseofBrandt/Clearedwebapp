# Form Builder — Architecture

**Audience:** engineers working on the form builder after V2 landed.
**See also:** `docs/forms-v2-spec.md` (full spec), `PROGRESS.md` 2026-04-22 entry, `TASKS.md` Part C.

This doc explains the V2 architecture. If you're looking for "how do I add a new form?" — skip to §6.

---

## 1. Three layers, three sources of truth

Forms are modeled in three independent layers. Each has a separate file on disk. The registry stitches them together.

### Layer 1 — `FormSchema` (semantic)

**Lives in:** `src/lib/forms/schemas/form-{number}.ts`
**Defined by:** `FormSchema` in `src/lib/forms/types.ts`
**Contains:** field IDs, types, validation rules, conditionals, section structure, IRS line references, resolution-path metadata, cross-form mappings.
**Does NOT contain:** anything about PDF rendering.

A schema is loaded by `getFormSchema(formNumber)`.

### Layer 2 — `PDFBinding` (rendering)

**Lives in:** `src/lib/forms/pdf-bindings/{formNumber}/{revision}.json`
**Defined by:** `PDFBinding` in `src/lib/forms/types.ts`
**Contains:** which PDF file to load, fill strategy (acroform/coordinate/hybrid), per-field binding (AcroForm name OR page + x/y coordinate), value transform, page dimensions for verification.

A binding is loaded by `getPDFBinding(formNumber, revision?)`. If `revision` is omitted, the registry's sync metadata provides the default.

One binding per PDF revision. When the IRS publishes a new revision, a new binding file is added; existing `FormInstance` rows stay on their original revision.

### Layer 3 — `FormMetadata` (publication)

**Lives in:** `src/lib/forms/metadata/form-{number}.ts`
**Defined by:** `FormMetadata` in `src/lib/forms/types.ts`
**Contains:** OMB number, IRS.gov URL, revision history.

Loaded by `getFormMetadata(formNumber)`. Used for admin surfaces and the revision picker.

---

## 2. The registry

`src/lib/forms/registry.ts` is the single entry point. It exposes:

- `getFormSchema(formNumber)` — async, dynamic-import, returns null for unknown forms
- `getPDFBinding(formNumber, revision?)` — async, file-reads JSON from disk
- `getFormMetadata(formNumber)` — async, dynamic-import
- `getAvailableForms()` — sync, returns the static metadata array for pickers
- `isFormRegistered(formNumber)` — sync existence check
- `hasBinding(formNumber)` — sync, true iff a PDF binding exists on disk
- `listSupportedRevisions(formNumber)` — sync

The registry also re-exports `FORM_BUILDER_V2_ENABLED` for convenience.

**Why dynamic imports:** bundle size. Webpack code-splits each `await import()` into a separate chunk, so a route that loads one form doesn't pull in the other ten. The 435MB function-size failure that killed Tier 3 (commits e86203f, 9fb5794) was caused by eager-importing all schemas. Don't revert this.

---

## 3. The PDF renderer

`src/lib/forms/pdf-renderer/` is self-contained. The only public entrypoint is `fillPDF(params): Promise<FillResult>` (or the safer wrapper `fillPDFOrReport`).

### Strategies

- **`acroform`** — PDF has a real AcroForm. Fill by `form.getTextField(name).setText(value)` etc. Preferred when available.
- **`coordinate`** — pdf-lib strips XFA on load, so these PDFs have no AcroForm. Draw text at explicit `(x, y)` coordinates. Used only for 433-A today.
- **`hybrid`** — AcroForm for text fields, coordinate for checkboxes/radios where the AcroForm is unreliable.

### Value transforms

Defined in `pdf-renderer/value-transforms.ts`:

- `ssn-format`, `ein-format`, `phone-format`
- `currency-no-symbol`, `currency-whole-dollars`
- `date-mmddyyyy`, `date-mm-dd-yyyy`
- `uppercase`, `lowercase`
- `checkbox-x`, `yes-no`

A binding field can specify `transform: "ssn-format"` and the raw value `"123456789"` becomes `"123-45-6789"` on the PDF.

### FillResult

Every call returns:

```ts
{
  pdfBytes: Uint8Array
  filled: number        // successful fills
  skipped: number       // no value to fill
  failed: FillFailure[] // each with fieldId + reason
  strategy: "acroform" | "coordinate" | "hybrid"
  durationMs: number
  revision: string
  formNumber: string
}
```

No silent failures. The preview-pdf route surfaces these as `X-Forms-V2-Failed` response headers.

### Font choice

Times Roman (from `StandardFonts`) is used for coordinate-drawn text. Cleared's export standard is Times New Roman; StandardFonts doesn't include TNR, so Times Roman is the closest stock font. The visual difference at form-fill sizes (9pt) is negligible. Embedding a custom TNR would bloat the serverless function and isn't worth it in v1.

---

## 4. The auto-populate v3 engine

`src/lib/forms/auto-populate-v3.ts` runs in four phases:

1. **Structured** — Case, CaseIntelligence, LiabilityPeriods, sibling FormInstances. Fast, free, high confidence.
2. **DocumentExtract** — structured fields already parsed out of 1040/W-2/bank statements/notices by the extractors in `src/lib/documents/extractors/`. High-medium confidence.
3. **Search context** — per unfilled field, `searchCaseDocuments()` retrieves top-K chunks via hybrid vector + FTS.
4. **Batched AI inference** — up to 20 unfilled fields per Claude call. Each return gets a confidence score and document citations.

Gated on `AUTO_POPULATE_V3_ENABLED`. v2 (the naive-grep engine) is the default.

---

## 5. Document search

`src/lib/documents/search.ts`:

- **Retriever A (vector):** pgvector cosine against `DocumentChunk.embedding`. Embeddings via OpenAI `text-embedding-3-small` (1536 dims). Chunks are 400-token overlapping windows of `Document.extractedText`.
- **Retriever B (FTS):** Postgres `to_tsvector` with prefix-matched tokens.
- **Retriever C (extracts):** `DocumentExtract` rows from `src/lib/documents/extractors/`.

Merged by chunk ID, scored `0.7 * vector + 0.3 * text`, grouped by document, top-K returned.

The chunking pipeline lives in `src/lib/documents/chunking.ts` and reuses the knowledge-base chunker + embeddings infrastructure from `src/lib/knowledge/`.

---

## 6. Adding a new form

Four steps. The existing forms (2848, 4506-T, 14039, 12277) are good references.

### Step 1 — Author the schema

`src/lib/forms/schemas/form-{number}.ts`. Use fragments aggressively — never re-declare an address, phone, SSN, or name field.

Required exports: `FORM_{NUMBER}: FormSchema`. Required fields: `formNumber`, `formTitle`, `totalSections`, `estimatedMinutes`, `sections`.

### Step 2 — Register

In `src/lib/forms/registry.ts`:
- Add to `SCHEMA_LOADERS`
- Add to `METADATA_LOADERS`
- Add to `FORM_META` with `hasBinding: false`

### Step 3 — Write metadata

`src/lib/forms/metadata/form-{number}.ts` exports `FORM_{NUMBER}_META: FormMetadata`.

### Step 4 — Author the binding (when PDF is available)

1. Place IRS PDF at `public/forms/f{number}.pdf`.
2. Run the inspection script: `node scripts/inspect-pdf-fields.mjs public/forms/f{number}.pdf > /tmp/fields.txt` (script TBD — V2.1 in TASKS.md).
3. Author `src/lib/forms/pdf-bindings/{formNumber}/{revision}.json` using the inspected field names.
4. In registry, add to `BINDING_LOADERS` and flip `hasBinding: true` in `FORM_META`.

### Gotchas

- **Repeating groups** flatten to dot-notation in the binding: `bank_accounts.0.bank_name`, not `bank_accounts[0].bank_name`.
- **Checkbox fields** need `acroFieldType: "checkbox"` so the filler calls `check()/uncheck()`, not `setText()`.
- **XFA forms** (where AcroForm is stripped on load) need `fillStrategy: "coordinate"`. Currently only 433-A.
- **Conditional fields** reference field IDs that must exist in the same schema. The test suite in `schemas/schemas.test.ts` catches typos.

---

## 7. Feature flags

- `FORM_BUILDER_V2_ENABLED` — master switch. When off, legacy routes and hub are active; new renderer and case-first hub are hidden.
- `AUTO_POPULATE_V3_ENABLED` — gates v3 vs v2. Defaults to the master switch.
- `DOCUMENT_CHUNKING_ENABLED` — gates the chunking+embedding pipeline on document upload. Enable this AFTER backfilling existing docs.

All env vars are booleans (`true`/`1`/`yes`/`on` counts as true).

---

## 8. Security

- `FormInstance.values` is plaintext today. V2.7 in TASKS.md adds an encrypted-at-rest migration.
- `FormInstanceSensitive` is a separate table for highly-sensitive fields (Form 8857 abuse/duress). Never included in cross-form auto-populate, never surfaced to Junebug.
- PDF exports contain full PII; never stored server-side, always streamed directly. The package-download endpoint logs an AuditLog entry with field/page counts only (never values).
- Every API route under `/api/forms/` and `/api/cases/*/forms/` requires authenticated session + case access.

---

## 9. Testing

- **Unit tests** — `pdf-renderer/{value-transforms,flatten-values}.test.ts` lock in transform behavior and flatten logic.
- **Schema tests** — `schemas/schemas.test.ts` checks structural integrity of every registered schema and binding.
- **Golden PDF tests** — deferred (V2.8 in TASKS.md). The canonical regression test for PDF rendering; will land form-by-form.
- **Integration tests** — deferred (V2.11). End-to-end per resolution path.

Test runner: Vitest. Command: `npm run test`.

---

## 10. Observability

- Every `fillPDF` call returns a `FillResult` with filled/skipped/failed counts.
- The preview-pdf route exposes these as `X-Forms-V2-*` response headers for quick network-panel debugging.
- Failed fills write to `AuditLog` (planned — V2.14).
- Analytics dashboard at `/admin/forms-analytics` (planned — V2.13).

---

*End of architecture doc. Keep this current.*
