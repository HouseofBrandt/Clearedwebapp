// ---------------------------------------------------------------------------
// Form Builder – UI Type Definitions
//
// Re-exports core types from src/lib/forms/types.ts and adds UI-specific types.
// ---------------------------------------------------------------------------

// Re-export core schema types
export type {
  FieldType,
  ValidationRule,
  ConditionalRule,
  FieldDef,
  SectionDef,
  FormSchema,
  CrossFieldValidation,
  FormInstance,
} from "@/lib/forms/types"

// ---------------------------------------------------------------------------
// UI-specific types
// ---------------------------------------------------------------------------

export type SectionCompletionState = "empty" | "partial" | "complete" | "error"

export type FormInstanceUIStatus = "draft" | "in_progress" | "complete" | "submitted"

export const FORM_STATUS_LABELS: Record<FormInstanceUIStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  complete: "Complete",
  submitted: "Submitted",
}

export const FORM_STATUS_STYLES: Record<FormInstanceUIStatus, string> = {
  draft: "bg-c-gray-100 text-c-gray-700",
  in_progress: "bg-c-info-soft text-c-teal",
  complete: "bg-c-success-soft text-c-success",
  submitted: "bg-c-gray-100 text-c-gray-700",
}

// ---------------------------------------------------------------------------
// Form Template types removed — use FormSchema from src/lib/forms/types.ts
// and getAvailableForms() from the schema registry instead.
// ---------------------------------------------------------------------------
