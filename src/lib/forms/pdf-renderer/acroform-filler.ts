import type { PDFDocument } from "pdf-lib"
import type { PDFBinding, FillFailure } from "../types"
import { applyTransform } from "./value-transforms"

interface AcroFillStats {
  filled: number
  skipped: number
  failed: FillFailure[]
}

/**
 * Fill a PDF's AcroForm fields using the binding.
 *
 * Strategy:
 *   1. For each field in the binding that has an `acro` binding, apply the
 *      value transform and attempt to set the form field.
 *   2. Try the full dotted AcroForm path first; if that fails, retry with
 *      the short name (last segment after final dot).
 *   3. Record every success, skip, and failure for observability.
 *
 * Checkboxes use `check()` / `uncheck()`. Dropdowns and radio groups use
 * `select()`. Text fields use `setText()`.
 *
 * This function mutates the PDFDocument in place. Call form.flatten() after
 * if you want the values baked in (the main fillPDF() entry point handles this).
 */
export async function acroformFill(
  pdfDoc: PDFDocument,
  binding: PDFBinding,
  flatValues: Record<string, any>
): Promise<AcroFillStats> {
  const form = pdfDoc.getForm()
  const actualFieldNames = new Set(form.getFields().map((f) => f.getName()))

  let filled = 0
  let skipped = 0
  const failed: FillFailure[] = []

  for (const [fieldId, fieldBinding] of Object.entries(binding.fields)) {
    if (!fieldBinding.acro) continue

    const value = flatValues[fieldId]
    if (value === undefined || value === null || value === "") {
      skipped++
      continue
    }

    const acroFieldType = fieldBinding.acro.acroFieldType || "text"
    const display = applyTransform(value, fieldBinding.transform)
    if (!display && acroFieldType !== "checkbox") {
      skipped++
      continue
    }

    const result = fillOne(form, fieldBinding.acro.acroFieldName, acroFieldType, value, display, actualFieldNames)
    if (result.ok) {
      filled++
    } else {
      failed.push({ fieldId, reason: result.reason })
    }
  }

  return { filled, skipped, failed }
}

function fillOne(
  form: ReturnType<PDFDocument["getForm"]>,
  fullName: string,
  type: "text" | "checkbox" | "radio" | "dropdown",
  rawValue: any,
  displayValue: string,
  actualFieldNames: Set<string>
): { ok: true } | { ok: false; reason: string } {
  // Try full path, then short name as fallback.
  const shortName = fullName.split(".").pop() || fullName
  const candidates = [fullName]
  if (shortName !== fullName && actualFieldNames.has(shortName)) {
    candidates.push(shortName)
  }

  let lastErr = ""
  for (const name of candidates) {
    try {
      switch (type) {
        case "checkbox": {
          const cb = form.getCheckBox(name)
          if (rawValue === true || rawValue === "true" || rawValue === "yes" || rawValue === 1 || displayValue === "X" || displayValue === "Yes") {
            cb.check()
          } else {
            cb.uncheck()
          }
          return { ok: true }
        }
        case "radio": {
          const rg = form.getRadioGroup(name)
          rg.select(displayValue)
          return { ok: true }
        }
        case "dropdown": {
          const dd = form.getDropdown(name)
          dd.select(displayValue)
          return { ok: true }
        }
        case "text":
        default: {
          const tf = form.getTextField(name)
          tf.setText(displayValue)
          return { ok: true }
        }
      }
    } catch (err: any) {
      lastErr = err?.message?.slice(0, 150) || "unknown error"
      continue
    }
  }

  return { ok: false, reason: lastErr || "field not found" }
}
