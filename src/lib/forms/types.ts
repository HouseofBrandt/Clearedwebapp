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
  | "ein-format"
  | "phone-format"
  | "currency-no-symbol"
  | "currency-whole-dollars"
  | "date-mmddyyyy"
  | "date-mm-dd-yyyy"
  | "uppercase"
  | "lowercase"
  | "checkbox-x"
  | "yes-no"

export interface AcroFieldBinding {
  acroFieldName: string
  acroFieldType?: "text" | "checkbox" | "radio" | "dropdown"
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

export interface FormInstance {
  id: string
  formNumber: string
  revision: string                   // Added in v2. Older rows default to schema.currentRevision.
  caseId: string
  clientId?: string
  status: "draft" | "in_progress" | "complete" | "submitted"
  values: Record<string, any>
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
