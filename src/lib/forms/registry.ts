import { FormSchema } from "./types"
import { FORM_433A } from "./schemas/form-433a"

const FORM_REGISTRY: Record<string, FormSchema> = {
  "433-A": FORM_433A,
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
