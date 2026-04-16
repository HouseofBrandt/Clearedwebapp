import { FormSchema } from "./types"
import { FORM_433A } from "./schemas/form-433a"
import { FORM_433A_OIC } from "./schemas/form-433a-oic"
import { FORM_12153 } from "./schemas/form-12153"
import { FORM_911 } from "./schemas/form-911"
import { FORM_656 } from "./schemas/form-656"
import { FORM_9465 } from "./schemas/form-9465"
import { FORM_843 } from "./schemas/form-843"

/**
 * Central form registry. Adding a new IRS form is now ~50 lines of work:
 *   1. Drop the PDF in /public/forms or /public/irs_kb
 *   2. Write a FormSchema in src/lib/forms/schemas/form-NNNN.ts
 *   3. Import + add it to FORM_REGISTRY here
 *
 * The pdf-filler will:
 *   - Use any explicit AcroForm map you provide in pdf-maps/
 *   - Fall through to the fuzzy matcher (auto-detects field names by IRS conventions)
 *   - Fall through to coordinate-based drawing if a coordinate map exists
 *
 * Most modern IRS forms (post-2015) have well-named AcroForm fields that the
 * fuzzy matcher handles without any explicit mapping.
 */
const FORM_REGISTRY: Record<string, FormSchema> = {
  "433-A": FORM_433A,
  "433-A-OIC": FORM_433A_OIC,
  "12153": FORM_12153,
  "911": FORM_911,
  "656": FORM_656,
  "9465": FORM_9465,
  "843": FORM_843,
}

/** Look up a form schema by IRS form number (e.g. "433-A", "656"). */
export function getFormSchema(formNumber: string): FormSchema | null {
  return FORM_REGISTRY[formNumber] || null
}

/** Returns metadata for every form the system can fill, sorted by form number. */
export function getAvailableForms(): { formNumber: string; formTitle: string; estimatedMinutes: number }[] {
  return Object.values(FORM_REGISTRY)
    .map((f) => ({
      formNumber: f.formNumber,
      formTitle: f.formTitle,
      estimatedMinutes: f.estimatedMinutes,
    }))
    .sort((a, b) => a.formNumber.localeCompare(b.formNumber, undefined, { numeric: true }))
}

/** Returns true if a schema is registered for this form number. */
export function isFormAvailable(formNumber: string): boolean {
  return formNumber in FORM_REGISTRY
}

/** Register a new form schema at runtime (used for dynamic loading / tests). */
export function registerForm(schema: FormSchema): void {
  if (!schema?.formNumber) throw new Error("registerForm: schema must have formNumber")
  if (!Array.isArray(schema.sections) || schema.sections.length === 0) {
    throw new Error(`registerForm: schema for ${schema.formNumber} has no sections`)
  }
  FORM_REGISTRY[schema.formNumber] = schema
}
