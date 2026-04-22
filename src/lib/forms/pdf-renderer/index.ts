import { PDFDocument } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import type { FillResult, PDFBinding } from "../types"
import { getPDFBinding, getFormSchema } from "../registry"
import { flattenValues } from "./flatten-values"
import { acroformFill } from "./acroform-filler"
import { coordinateFill } from "./coordinate-filler"
import { applyOverlays, type OverlayOptions } from "./page-overlays"

export interface FillParams {
  formNumber: string
  values: Record<string, any>
  /** Revision to render against. Defaults to the form's currentRevision. */
  revision?: string
  options?: {
    watermark?: "DRAFT" | "PRACTITIONER REVIEW REQUIRED" | null
    flatten?: boolean               // default true
    includePageNumbers?: boolean    // default false
  }
}

/**
 * Main fill entrypoint.
 *
 * Given a form number and values, loads the PDF binding for the requested
 * revision, picks the fill strategy declared in the binding, fills the PDF,
 * optionally applies overlays, and returns the resulting bytes with a
 * complete stats breakdown.
 *
 * Never throws for fill failures — failures are reported in the FillResult.
 * Throws only for catastrophic issues (binding not found, PDF file missing,
 * PDF corrupt).
 *
 * This is the canonical rendering path when FORM_BUILDER_V2_ENABLED is true.
 */
export async function fillPDF(params: FillParams): Promise<FillResult> {
  const started = Date.now()

  const binding = await getPDFBinding(params.formNumber, params.revision)
  if (!binding) {
    throw new Error(`No PDF binding registered for form ${params.formNumber}${params.revision ? ` at revision ${params.revision}` : ""}`)
  }

  const pdfDoc = await loadPDF(binding)
  const flatValues = flattenValues(params.values)

  // Dispatch on strategy. Hybrid = run AcroForm first, then coordinate for
  // any field the AcroForm strategy couldn't fill (useful for checkboxes
  // that don't participate in the AcroForm cleanly).
  let filled = 0
  let skipped = 0
  let failed: FillResult["failed"] = []

  if (binding.fillStrategy === "acroform" || binding.fillStrategy === "hybrid") {
    const stats = await acroformFill(pdfDoc, binding, flatValues)
    filled += stats.filled
    skipped += stats.skipped
    failed = failed.concat(stats.failed)
  }

  if (binding.fillStrategy === "coordinate" || binding.fillStrategy === "hybrid") {
    const stats = await coordinateFill(pdfDoc, binding, flatValues)
    filled += stats.filled
    // In hybrid, skipped may be double-counted; we don't care — skipped is
    // informational. Failed is what matters for observability.
    if (binding.fillStrategy === "coordinate") skipped += stats.skipped
    failed = failed.concat(stats.failed)
  }

  await applyOverlays(pdfDoc, {
    watermark: params.options?.watermark ?? null,
    includePageNumbers: params.options?.includePageNumbers ?? false,
  })

  const shouldFlatten = params.options?.flatten !== false && binding.fillStrategy !== "coordinate"
  if (shouldFlatten) {
    try {
      pdfDoc.getForm().flatten()
    } catch (err: any) {
      // Flattening can fail for PDFs without a real AcroForm (e.g. XFA). Safe
      // to ignore; the coordinate-drawn text is already baked into the page
      // content stream.
      console.warn("[pdf-renderer] flatten skipped", { formNumber: params.formNumber, error: err?.message })
    }
  }

  const pdfBytes = await pdfDoc.save()

  return {
    pdfBytes,
    filled,
    skipped,
    failed,
    strategy: binding.fillStrategy,
    durationMs: Date.now() - started,
    revision: binding.revision,
    formNumber: params.formNumber,
  }
}

/**
 * Convenience: call fillPDF using the schema's declared revision even if
 * the binding isn't present — returns a clear error for UI surfacing.
 */
export async function fillPDFOrReport(params: FillParams): Promise<
  | { ok: true; result: FillResult }
  | { ok: false; reason: string }
> {
  const schema = await getFormSchema(params.formNumber)
  if (!schema) return { ok: false, reason: `Unknown form ${params.formNumber}` }

  const binding = await getPDFBinding(params.formNumber, params.revision || schema.currentRevision)
  if (!binding) {
    return {
      ok: false,
      reason: `Form ${params.formNumber} has no PDF binding on disk. The IRS PDF must be placed in public/forms/ and a binding authored before this form can be rendered.`,
    }
  }

  try {
    const result = await fillPDF(params)
    return { ok: true, result }
  } catch (err: any) {
    return { ok: false, reason: err?.message || "Fill failed" }
  }
}

async function loadPDF(binding: PDFBinding): Promise<PDFDocument> {
  const path = join(process.cwd(), "public", "forms", binding.pdfFileName)
  const bytes = await readFile(path)
  return PDFDocument.load(bytes, { ignoreEncryption: true })
}

// Re-export so callers don't need to reach into sub-files.
export { applyTransform } from "./value-transforms"
export { flattenValues } from "./flatten-values"
export type { OverlayOptions }
