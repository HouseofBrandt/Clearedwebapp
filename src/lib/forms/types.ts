// Core form schema types for the IRS Form Builder.
//
// V2 architecture: three layers, cleanly separated.
//
//   Layer 1 — FormSchema        What the form IS (fields, validation, sections).
//                               Lives in src/lib/forms/schemas/*.ts.
//                               Has no PDF concerns.
//
//   Layer 2 — PDFBinding        HOW a form maps to a specific PDF revision.
//                               Lives in src/lib/forms/pdf-bindings/{formNumber}/{revision}.json.
//                               Versioned. A new revision is a new binding file.
//
//   Layer 3 — FormMetadata      Publication info (OMB number, revisions, IRS URL).
//                               Lives in src/lib/forms/metadata/*.ts.
//
// The wizard, validation, and conditionals only need Layer 1. The renderer
// needs Layers 1 + 2. The revision picker and admin surfaces also need Layer 3.

// ─── Layer 1: FormSchema ─────────────────────────────────────────────────────

export type FieldType =
  | "text" | "textarea" | "ssn" | "ein" | "phone" | "date"
  | "currency" | "percentage" | "yes_no" | "single_select"
  | "multi_select" | "repeating_group" | "computed" | "file_upload"

export interface ValidationRule {
  type: "required" | "min" | "max" | "pattern" | "min_length" | "max_length" | "custom"
  value?: any
  message: string
}

export interface ConditionalRule {
  field: string
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_empty" | "is_not_empty"
  value: any
  action: "show" | "hide" | "require" | "disable"
}

export interface FieldDef {
  id: string
  label: string
  type: FieldType
  placeholder?: string
  helpText?: string
  irsReference?: string
  required?: boolean
  validation?: ValidationRule[]
  conditionals?: ConditionalRule[]
  defaultValue?: any
  options?: { value: string; label: string }[]
  computeFormula?: string
  dependsOn?: string[]
  groupFields?: FieldDef[]
  minGroups?: number
  maxGroups?: number
  sensitive?: boolean // Field contains highly sensitive data (abuse/duress on 8857)
}

export interface SectionDef {
  id: string
  title: string
  description?: string
  irsInstructions?: string
  fields: FieldDef[]
  order: number
  conditionals?: ConditionalRule[]
}

export interface CrossFieldValidation {
  id: string
  description: string
  fields: string[]
  rule: string
  errorMessage: string
  severity: "error" | "warning"
}

export interface CrossFormMapping {
  // Maps a source form's field IDs onto this form's field IDs.
  // When the source form is complete in the same case, the mapped fields
  // auto-populate with high confidence.
  sourceFormNumber: string
  fieldMap: Record<string, string>
}

export interface ResolutionMetadata {
  resolutionPaths: string[]
  requirementLevel: Record<string, "required" | "recommended" | "if_applicable">
  dependsOn: string[]
  requiredBy: string[]
  dataSources: string[]
  dataTargets: string[]
}

export interface FormSchema {
  formNumber: string
  formTitle: string

  // ── Revision handling ──
  // Optional so the 7 pre-v2 schemas still typecheck without modification.
  // When absent, the registry's FORM_META.currentRevision is used.
  currentRevision?: string          // e.g. "2022-07"; the default for new instances.
  supportedRevisions?: string[]     // All revisions with a binding on disk.

  // Legacy field retained for rows that predate revision tracking. Prefer
  // currentRevision. This will be dropped after the v2 rollout.
  revisionDate?: string

  ombNumber?: string
  totalSections: number
  estimatedMinutes: number
  sections: SectionDef[]
  crossFieldValidations?: CrossFieldValidation[]
  resolutionMetadata?: ResolutionMetadata
  crossFormMappings?: CrossFormMapping[]
}

// ─── Layer 2: PDFBinding ─────────────────────────────────────────────────────

export type FillStrategy = "acroform" | "coordinate" | "hybrid"

export type ValueTransform =
  | "ssn-format"
  | "ssn-digits"
  | "ein-format"
  | "ein-digits"
  | "phone-format"
  | "phone-digits"
  | "currency-no-symbol"
  | "currency-whole-dollars"
  | "date-mmddyyyy"
  | "date-mm-dd-yyyy"
  | "date-mmddyyyy-nosep"
  | "uppercase"
  | "lowercase"
  | "checkbox-x"
  | "yes-no"
  | "zip-first-5"
  | "zip-last-4"

export interface AcroFieldBinding {
  acroFieldName: string
  acroFieldType?: "text" | "checkbox" | "radio" | "dropdown"
  /**
   * For checkboxes: only check the box if the bound field's value === this.
   * Used to map an enum like marital_status="married" to a specific checkbox.
   * If absent, the renderer falls back to a truthy-value check (good for yes_no).
   */
  checkWhen?: string | number | boolean
  /**
   * Inverse of checkWhen: only check the box if the bound field's value !== this.
   * Lets a single enum drive both halves of a paired checkbox group
   * (e.g. C1_01_2a[0]=Married checkWhen "married", [1]=Unmarried checkWhenNot "married").
   */
  checkWhenNot?: string | number | boolean
}

export interface CoordinateBinding {
  page: number            // 0-indexed
  x: number               // points from bottom-left
  y: number               // points from bottom-left
  fontSize?: number       // default 9
  maxWidth?: number
  isCheckbox?: boolean    // if true, render "X" instead of value text
}

export interface FieldBinding {
  // At least one of { acro, coord } must be set; if both, renderer picks
  // based on the binding's strategy (hybrid = prefer acro, fallback coord).
  acro?: AcroFieldBinding
  coord?: CoordinateBinding
  transform?: ValueTransform
  // For repeating groups: if the schema field id is like "bank_accounts.2.balance",
  // the renderer uses the numeric index as repeatIndex at fill time. This field
  // is informational (doc-only) and is not used at runtime.
  repeatIndex?: number
  /**
   * The schema field id this binding pulls its value from. If absent, the
   * binding key itself is used (the legacy and most common case).
   *
   * Set this when multiple binding entries map a single schema field to
   * several PDF widgets — e.g. paired Married/Unmarried checkboxes both
   * driven by `marital_status`. The binding keys must still be unique, so
   * use a synthetic name (e.g. `_marital_married`) and point boundField
   * at the real schema id.
   */
  boundField?: string
}

export interface PageDimensions {
  width: number
  height: number
}

export interface PDFBinding {
  formNumber: string
  revision: string                   // e.g. "2022-07"
  pdfFileName: string                // e.g. "f433a.pdf"; resolved against public/forms/
  fillStrategy: FillStrategy
  pageCount: number
  pageDimensions: PageDimensions[]   // one per page; used to verify PDF matches binding
  effectiveDate: string              // ISO date
  supersededDate: string | null
  fields: Record<string, FieldBinding>
  notes?: string                     // free-form; visible to admins
}

// ─── Layer 3: FormMetadata ───────────────────────────────────────────────────

export interface FormRevision {
  revision: string
  publishedAt: string
  changes?: string
}

export interface FormMetadata {
  formNumber: string
  ombNumber: string
  irsUrl: string                     // IRS.gov page for the form
  revisionHistory: FormRevision[]
}

// ─── Runtime types ───────────────────────────────────────────────────────────

/**
 * Per-field metadata sidecar.
 *
 * Stored on FormInstance.valuesMeta as Record<fieldId, FieldMeta>.
 * Captures the *provenance* and *review state* of each field separately
 * from the value itself, so the wizard can render confidence badges that
 * survive a reload, and the practitioner can see what's been double-checked.
 *
 * Fields are intentionally optional — the wizard treats absence as
 * "manually entered, unreviewed".
 */
export interface FieldMeta {
  /** Confidence the auto-populator had in this value. */
  confidence?: "high" | "medium" | "low"
  /** Human-readable description of where the value came from. */
  source?: string
  /** Document citations (used to render "from {fileName}, page {n}" tooltips). */
  extractedFrom?: Array<{
    documentId?: string
    documentName?: string
    pageNumber?: number
  }>
  /** Optional one-sentence rationale from the AI inference path. */
  reasoning?: string
  /** True iff the value originated from auto-populate (never user-typed). */
  autoFilled?: boolean
  /** True once a practitioner has explicitly confirmed the value. */
  reviewed?: boolean
  /** ISO timestamp of the review action. */
  reviewedAt?: string
  /** User ID of the reviewer. */
  reviewedBy?: string
  /** True if the user edited a previously-auto-filled value (clears reviewed). */
  manuallyEdited?: boolean
}

export interface FormInstance {
  id: string
  formNumber: string
  // Added in v2. Optional at the runtime-type level so legacy call sites
  // that synthesize FormInstance objects don't need to set it. The Prisma
  // column defaults to "unknown" — new instances may fill it with the
  // schema's currentRevision at creation time.
  revision?: string
  caseId: string
  clientId?: string
  status: "draft" | "in_progress" | "complete" | "submitted"
  values: Record<string, any>
  /** Per-field metadata. Empty object for legacy rows. */
  valuesMeta?: Record<string, FieldMeta>
  completedSections: string[]
  validationErrors: Record<string, string[]>
  createdAt: string
  updatedAt: string
  createdById: string
  version: number
}

// ─── Result types ────────────────────────────────────────────────────────────

export interface FillFailure {
  fieldId: string
  reason: string
}

export interface FillResult {
  pdfBytes: Uint8Array
  filled: number
  skipped: number
  failed: FillFailure[]
  strategy: FillStrategy
  durationMs: number
  revision: string
  formNumber: string
}
