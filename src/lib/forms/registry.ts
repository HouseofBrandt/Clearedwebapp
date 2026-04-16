import type { FormSchema } from "./types"

/**
 * Form catalog with per-schema dynamic imports.
 *
 * Why this is structured this way:
 *
 * 1. **Bundle isolation.** Webpack code-splits each `await import()` into a
 *    separate chunk. A route that only ever calls `getFormSchema("656")`
 *    pulls only form-656.ts into its bundle, not all seven schemas. This
 *    is the architectural fix for the 435MB function-size failure that
 *    triggered the form-builder Tier 3 revert (commits e86203f, 9fb5794).
 *
 * 2. **Static metadata stays sync.** The wizard list view, the form
 *    picker, and any UI that needs "all available forms" reads
 *    `getAvailableForms()` — a small constant array that never imports
 *    a schema. Only callers that need the full schema (auto-populate,
 *    preview-pdf, the in-progress wizard for that specific form) await
 *    `getFormSchema(formNumber)`.
 *
 * 3. **Adding a form is two edits.** Add a loader in FORM_LOADERS and a
 *    metadata row in FORM_METADATA. Nothing else.
 *
 * If you need a synchronous getFormSchema (you almost certainly don't —
 * everything that uses it is server-side), you'll have to pre-load the
 * schema via getFormSchema() somewhere upstream and pass it down. Don't
 * be tempted to revive the eager-import version — that's how the 300MB
 * function ceiling killed Tier 3 the first time.
 */

const FORM_LOADERS: Record<string, () => Promise<FormSchema>> = {
  "433-A":     async () => (await import("./schemas/form-433a")).FORM_433A,
  "433-A-OIC": async () => (await import("./schemas/form-433a-oic")).FORM_433A_OIC,
  "12153":     async () => (await import("./schemas/form-12153")).FORM_12153,
  "911":       async () => (await import("./schemas/form-911")).FORM_911,
  "656":       async () => (await import("./schemas/form-656")).FORM_656,
  "843":       async () => (await import("./schemas/form-843")).FORM_843,
  "9465":      async () => (await import("./schemas/form-9465")).FORM_9465,
}

/**
 * Synchronous metadata — title + estimated minutes — for the wizard form
 * picker, the available-forms admin page, and validation. Keep this in
 * sync with FORM_LOADERS. Adding an entry here without a corresponding
 * loader (or vice versa) is a programming error.
 */
const FORM_METADATA: Record<
  string,
  { formNumber: string; formTitle: string; estimatedMinutes: number }
> = {
  "433-A":     { formNumber: "433-A",     formTitle: "Collection Information Statement for Wage Earners and Self-Employed Individuals", estimatedMinutes: 45 },
  "433-A-OIC": { formNumber: "433-A-OIC", formTitle: "Collection Information Statement (Offer in Compromise)",                              estimatedMinutes: 45 },
  "12153":     { formNumber: "12153",     formTitle: "Request for Collection Due Process or Equivalent Hearing",                            estimatedMinutes: 15 },
  "911":       { formNumber: "911",       formTitle: "Request for Taxpayer Advocate Service Assistance",                                    estimatedMinutes: 20 },
  "656":       { formNumber: "656",       formTitle: "Offer in Compromise",                                                                 estimatedMinutes: 30 },
  "843":       { formNumber: "843",       formTitle: "Claim for Refund and Request for Abatement",                                          estimatedMinutes: 20 },
  "9465":      { formNumber: "9465",      formTitle: "Installment Agreement Request",                                                       estimatedMinutes: 15 },
}

/**
 * Async — dynamically imports the requested form's schema module so each
 * call site only bundles the schema(s) it actually loads. Returns null
 * for unknown form numbers; never throws (a failed dynamic import is
 * surfaced as null with a console.warn).
 */
export async function getFormSchema(formNumber: string): Promise<FormSchema | null> {
  const loader = FORM_LOADERS[formNumber]
  if (!loader) return null
  try {
    return await loader()
  } catch (err: any) {
    console.warn("[forms/registry] failed to load schema", { formNumber, error: err?.message })
    return null
  }
}

/** Sync metadata-only listing for UI pickers. Does not import any schema. */
export function getAvailableForms(): { formNumber: string; formTitle: string; estimatedMinutes: number }[] {
  return Object.values(FORM_METADATA)
}

/** Cheap existence check — does not load the schema. */
export function isFormRegistered(formNumber: string): boolean {
  return formNumber in FORM_LOADERS
}
