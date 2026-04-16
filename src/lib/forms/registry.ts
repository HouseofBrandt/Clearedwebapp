import { FormSchema } from "./types"
import { FORM_433A } from "./schemas/form-433a"
import { FORM_433A_OIC } from "./schemas/form-433a-oic"
import { FORM_12153 } from "./schemas/form-12153"
import { FORM_911 } from "./schemas/form-911"
import { FORM_656 } from "./schemas/form-656"
import { FORM_843 } from "./schemas/form-843"
import { FORM_9465 } from "./schemas/form-9465"

/**
 * Tier 3 form catalog. Adding a schema here makes the form available to
 * the wizard, the auto-populate route, and the preview-pdf renderer.
 *
 * Bundle note: adding schemas grows the static graph of every route that
 * imports this registry by the schema's compiled size (~50-100KB each).
 * The 4 originals (~2.5K LOC of TS) plus the 3 new (~950 LOC) compile to
 * roughly 1MB of JS — small relative to the preview-pdf function's
 * pdf-lib footprint. If this ever pushes a route over Vercel's 300MB
 * function limit, switch the registry to dynamic imports per slug and
 * make `getFormSchema` async.
 */
const FORM_REGISTRY: Record<string, FormSchema> = {
  "433-A": FORM_433A,
  "433-A-OIC": FORM_433A_OIC,
  "12153": FORM_12153,
  "911": FORM_911,
  "656": FORM_656,         // Offer in Compromise narrative
  "843": FORM_843,         // Penalty abatement
  "9465": FORM_9465,       // Installment Agreement request
}

export function getFormSchema(formNumber: string): FormSchema | null {
  return FORM_REGISTRY[formNumber] || null
}

export function getAvailableForms(): { formNumber: string; formTitle: string; estimatedMinutes: number }[] {
  return Object.values(FORM_REGISTRY).map(f => ({
    formNumber: f.formNumber,
    formTitle: f.formTitle,
    estimatedMinutes: f.estimatedMinutes,
  }))
}

export function registerForm(schema: FormSchema): void {
  FORM_REGISTRY[schema.formNumber] = schema
}
