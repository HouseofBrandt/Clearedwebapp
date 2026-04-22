import type { FormSchema, PDFBinding, FormMetadata } from "./types"

/**
 * Form registry — unified lookup for the three layers (schema, binding, metadata).
 *
 * Why this is structured this way:
 *
 * 1. **Bundle isolation.** Webpack code-splits each `await import()` into a
 *    separate chunk. A route that only ever calls `getFormSchema("656")`
 *    pulls only form-656.ts (and its binding) into its bundle. This is the
 *    architectural fix for the 435MB function-size failure that triggered
 *    the form-builder Tier 3 revert (commits e86203f, 9fb5794).
 *
 * 2. **Static metadata stays sync.** The wizard list view, the form picker,
 *    and any UI that needs "all available forms" reads `getAvailableForms()` —
 *    a small constant array that never imports a schema.
 *
 * 3. **Three lookups, one source of truth per form.** Adding a form:
 *      a) Add schema loader → SCHEMA_LOADERS
 *      b) Add binding loaders → BINDING_LOADERS (one per revision)
 *      c) Add metadata loader → METADATA_LOADERS
 *      d) Add sync entry → FORM_META
 *
 * 4. **Bindings cached in memory.** Bindings are JSON fixtures; loading is
 *    cheap but not free, and they're static per process lifetime. We cache
 *    on first load.
 */

import { FORM_BUILDER_V2_ENABLED } from "./feature-flags"

// ── Schema loaders ───────────────────────────────────────────────────────────

const SCHEMA_LOADERS: Record<string, () => Promise<FormSchema>> = {
  "433-A":     async () => (await import("./schemas/form-433a")).FORM_433A,
  "433-A-OIC": async () => (await import("./schemas/form-433a-oic")).FORM_433A_OIC,
  "12153":     async () => (await import("./schemas/form-12153")).FORM_12153,
  "911":       async () => (await import("./schemas/form-911")).FORM_911,
  "656":       async () => (await import("./schemas/form-656")).FORM_656,
  "843":       async () => (await import("./schemas/form-843")).FORM_843,
  "9465":      async () => (await import("./schemas/form-9465")).FORM_9465,
  "2848":      async () => (await import("./schemas/form-2848")).FORM_2848,
  "4506-T":    async () => (await import("./schemas/form-4506t")).FORM_4506T,
  "14039":     async () => (await import("./schemas/form-14039")).FORM_14039,
  "12277":     async () => (await import("./schemas/form-12277")).FORM_12277,
}

// ── Binding loaders ──────────────────────────────────────────────────────────
// Nested map: formNumber → revision → loader.
// Each entry corresponds to a JSON fixture under pdf-bindings/{formNumber}/{revision}.json.
// Bindings are loaded lazily via fs (on the server) to keep them out of
// the client bundle entirely.

const BINDING_LOADERS: Record<string, Record<string, () => Promise<PDFBinding>>> = {
  "433-A":  { "2022-07": () => loadBinding("433-A", "2022-07") },
  "12153":  { "2020-12": () => loadBinding("12153", "2020-12") },
  "911":    { "2022-05": () => loadBinding("911", "2022-05") },
  // Deferred bindings — see TASKS.md:
  //   433-A-OIC: PDF is present but AcroForm field names need inspection.
  //              The legacy code path silently fell back to 433-A's field
  //              map, which does not match 433-A-OIC's actual fields.
  //              V2 correctly reports "no binding" until this is authored.
  //   656, 843, 9465, 2848, 4506-T, 14039, 12277:
  //              Schemas exist (or will exist); PDFs must be placed in
  //              public/forms/ before bindings can be authored.
}

// ── Metadata loaders ─────────────────────────────────────────────────────────

const METADATA_LOADERS: Record<string, () => Promise<FormMetadata>> = {
  "433-A":     async () => (await import("./metadata/form-433a")).FORM_433A_META,
  "433-A-OIC": async () => (await import("./metadata/form-433a-oic")).FORM_433A_OIC_META,
  "12153":     async () => (await import("./metadata/form-12153")).FORM_12153_META,
  "911":       async () => (await import("./metadata/form-911")).FORM_911_META,
  "656":       async () => (await import("./metadata/form-656")).FORM_656_META,
  "843":       async () => (await import("./metadata/form-843")).FORM_843_META,
  "9465":      async () => (await import("./metadata/form-9465")).FORM_9465_META,
  "2848":      async () => (await import("./metadata/form-2848")).FORM_2848_META,
  "4506-T":    async () => (await import("./metadata/form-4506t")).FORM_4506T_META,
  "14039":     async () => (await import("./metadata/form-14039")).FORM_14039_META,
  "12277":     async () => (await import("./metadata/form-12277")).FORM_12277_META,
}

// ── Sync metadata (picker UI) ────────────────────────────────────────────────
// Keep in sync with SCHEMA_LOADERS. Consumed by `getAvailableForms()`.

interface SyncMeta {
  formNumber: string
  formTitle: string
  estimatedMinutes: number
  hasBinding: boolean       // true iff a PDF binding exists on disk
  currentRevision: string
}

const FORM_META: Record<string, SyncMeta> = {
  "433-A":     { formNumber: "433-A",     formTitle: "Collection Information Statement for Wage Earners and Self-Employed Individuals", estimatedMinutes: 45, hasBinding: true,  currentRevision: "2022-07" },
  "433-A-OIC": { formNumber: "433-A-OIC", formTitle: "Collection Information Statement (Offer in Compromise)",                              estimatedMinutes: 45, hasBinding: false, currentRevision: "2024-04" },
  "12153":     { formNumber: "12153",     formTitle: "Request for Collection Due Process or Equivalent Hearing",                            estimatedMinutes: 15, hasBinding: true,  currentRevision: "2020-12" },
  "911":       { formNumber: "911",       formTitle: "Request for Taxpayer Advocate Service Assistance",                                    estimatedMinutes: 20, hasBinding: true,  currentRevision: "2022-05" },
  "656":       { formNumber: "656",       formTitle: "Offer in Compromise",                                                                 estimatedMinutes: 30, hasBinding: false, currentRevision: "2024-04" },
  "843":       { formNumber: "843",       formTitle: "Claim for Refund and Request for Abatement",                                          estimatedMinutes: 20, hasBinding: false, currentRevision: "2011-08" },
  "9465":      { formNumber: "9465",      formTitle: "Installment Agreement Request",                                                       estimatedMinutes: 15, hasBinding: false, currentRevision: "2020-09" },
  "2848":      { formNumber: "2848",      formTitle: "Power of Attorney and Declaration of Representative",                                 estimatedMinutes: 20, hasBinding: false, currentRevision: "2021-01" },
  "4506-T":    { formNumber: "4506-T",    formTitle: "Request for Transcript of Tax Return",                                                estimatedMinutes: 10, hasBinding: false, currentRevision: "2023-03" },
  "14039":     { formNumber: "14039",     formTitle: "Identity Theft Affidavit",                                                            estimatedMinutes: 15, hasBinding: false, currentRevision: "2022-12" },
  "12277":     { formNumber: "12277",     formTitle: "Application for Withdrawal of Filed Notice of Federal Tax Lien",                      estimatedMinutes: 10, hasBinding: false, currentRevision: "2011-10" },
}

// ── Binding cache ────────────────────────────────────────────────────────────

const bindingCache = new Map<string, PDFBinding>()

function bindingCacheKey(formNumber: string, revision: string): string {
  return `${formNumber}@${revision}`
}

async function loadBinding(formNumber: string, revision: string): Promise<PDFBinding> {
  // Server-only: load JSON from disk and cache in memory.
  const key = bindingCacheKey(formNumber, revision)
  const cached = bindingCache.get(key)
  if (cached) return cached

  const { readFile } = await import("fs/promises")
  const { join } = await import("path")
  const path = join(process.cwd(), "src", "lib", "forms", "pdf-bindings", formNumber, `${revision}.json`)
  const raw = await readFile(path, "utf-8")
  const binding = JSON.parse(raw) as PDFBinding
  bindingCache.set(key, binding)
  return binding
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Async — dynamically imports the requested form's schema. Returns null for unknown forms. */
export async function getFormSchema(formNumber: string): Promise<FormSchema | null> {
  const loader = SCHEMA_LOADERS[formNumber]
  if (!loader) return null
  try {
    return await loader()
  } catch (err: any) {
    console.warn("[forms/registry] failed to load schema", { formNumber, error: err?.message })
    return null
  }
}

/**
 * Async — load the PDF binding for a form + revision.
 * If `revision` is omitted, uses the form's currentRevision from sync metadata.
 * Returns null if the form has no binding on disk (new schemas without PDFs).
 */
export async function getPDFBinding(formNumber: string, revision?: string): Promise<PDFBinding | null> {
  const meta = FORM_META[formNumber]
  if (!meta) return null
  const targetRevision = revision || meta.currentRevision

  const loaders = BINDING_LOADERS[formNumber]
  if (!loaders) return null

  const loader = loaders[targetRevision]
  if (!loader) return null

  try {
    return await loader()
  } catch (err: any) {
    console.warn("[forms/registry] failed to load binding", { formNumber, revision: targetRevision, error: err?.message })
    return null
  }
}

/** Async — load the publication metadata for a form. */
export async function getFormMetadata(formNumber: string): Promise<FormMetadata | null> {
  const loader = METADATA_LOADERS[formNumber]
  if (!loader) return null
  try {
    return await loader()
  } catch (err: any) {
    console.warn("[forms/registry] failed to load metadata", { formNumber, error: err?.message })
    return null
  }
}

/** Sync metadata-only listing for UI pickers. Does not import any schema. */
export function getAvailableForms(): Array<Omit<SyncMeta, "currentRevision"> & { currentRevision: string }> {
  return Object.values(FORM_META)
}

/** Cheap existence check — does not load the schema. */
export function isFormRegistered(formNumber: string): boolean {
  return formNumber in SCHEMA_LOADERS
}

/** Does a given form have a PDF binding on disk (i.e. can it be rendered)? */
export function hasBinding(formNumber: string): boolean {
  return FORM_META[formNumber]?.hasBinding === true
}

/** Which revisions does this form support? */
export function listSupportedRevisions(formNumber: string): string[] {
  return Object.keys(BINDING_LOADERS[formNumber] || {})
}

/** Is V2 enabled? Re-exported here for call sites that import from registry. */
export { FORM_BUILDER_V2_ENABLED }
