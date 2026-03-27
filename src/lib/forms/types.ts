// Core form schema types for the IRS Form Builder

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
  field: string // field ID to watch
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_empty" | "is_not_empty"
  value: any
  action: "show" | "hide" | "require" | "disable"
}

export interface FieldDef {
  id: string
  label: string
  type: FieldType
  placeholder?: string
  helpText?: string // Brief inline help
  irsReference?: string // e.g., "Form 433-A, Line 14"
  required?: boolean
  validation?: ValidationRule[]
  conditionals?: ConditionalRule[]
  defaultValue?: any
  options?: { value: string; label: string }[] // For select types
  computeFormula?: string // For computed fields, e.g., "field_a + field_b"
  dependsOn?: string[] // Field IDs this computed field depends on
  pdfMapping?: { page: number; x: number; y: number; width: number; height: number; fontSize?: number }
  groupFields?: FieldDef[] // For repeating_group type
  minGroups?: number
  maxGroups?: number
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

export interface FormSchema {
  formNumber: string
  formTitle: string
  revisionDate: string
  ombNumber?: string
  totalSections: number
  estimatedMinutes: number
  sections: SectionDef[]
  crossFieldValidations?: CrossFieldValidation[]
  resolutionMetadata?: {
    resolutionPaths: string[]
    requirementLevel: Record<string, "required" | "recommended" | "if_applicable">
    dependsOn: string[]
    requiredBy: string[]
    dataSources: string[]
    dataTargets: string[]
  }
}

export interface CrossFieldValidation {
  id: string
  description: string
  fields: string[] // Field IDs involved
  rule: string // Expression to evaluate
  errorMessage: string
  severity: "error" | "warning"
}

export interface FormInstance {
  id: string
  formNumber: string
  caseId: string
  clientId?: string
  status: "draft" | "in_progress" | "complete" | "submitted"
  values: Record<string, any> // field ID -> value
  completedSections: string[]
  validationErrors: Record<string, string[]>
  createdAt: string
  updatedAt: string
  createdById: string
  version: number
}
