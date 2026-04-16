import { FormSchema } from "./types"
import { FORM_433A } from "./schemas/form-433a"
import { FORM_433A_OIC } from "./schemas/form-433a-oic"
import { FORM_12153 } from "./schemas/form-12153"
import { FORM_911 } from "./schemas/form-911"

const FORM_REGISTRY: Record<string, FormSchema> = {
  "433-A": FORM_433A,
  "433-A-OIC": FORM_433A_OIC,
  "12153": FORM_12153,
  "911": FORM_911,
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
