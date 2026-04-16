/**
 * Unified PDF Filler
 * ------------------
 * Single entry point for filling any IRS form PDF. Combines:
 *   - Explicit AcroForm map (highest priority — hand-coded names)
 *   - Fuzzy AcroForm matcher (auto-detect field names by IRS conventions)
 *   - Coordinate-based drawing fallback (for pure-XFA forms or unmapped fields)
 *
 * Properly handles:
 *   - Text fields, checkboxes, radio groups, dropdowns
 *   - Multi-line text (long descriptions, addresses)
 *   - Repeating groups (auto-expanded to row count)
 *   - Currency, date, phone, SSN, EIN normalization
 *   - Marital status & other multi-option fields → correct radio button
 *
 * Returns: filled PDF bytes + a fill report (counts, per-field outcomes).
 */

import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, StandardFonts, rgb } from "pdf-lib"
import type { FormSchema, FieldDef } from "./types"
import type { PDFFieldMap } from "./pdf-maps/types"
import { findBestPdfField, type PDFFieldInfo, type SchemaFieldInfo } from "./pdf-fuzzy-matcher"
import { normalizeValue, formatCurrencyForPdf, formatDateForPdf, formatPhoneForPdf, formatSsn, formatEin, parseYesNo } from "./value-normalizers"

export interface FillReport {
  filled: number
  skipped: number
  errors: { fieldId: string; reason: string }[]
  filledFields: { fieldId: string; pdfField: string; method: "explicit" | "fuzzy" | "coordinate" }[]
}

export interface FillOptions {
  /** Schema for this form (used for type-aware normalization and fuzzy matching) */
  schema?: FormSchema | null
  /** Pre-built explicit AcroForm map (fieldId → PDF field name) */
  explicitMap?: Record<string, string>
  /** Coordinate map for fallback drawing */
  coordinateMap?: PDFFieldMap | null
  /** Whether to flatten the form after filling (so values render as plain text) */
  flatten?: boolean
}

// ────────────────────────────────────────────────────────────────────────────
// VALUE FLATTENING
// Convert nested arrays / repeating groups to dot-notation flat keys.
// ────────────────────────────────────────────────────────────────────────────

export function flattenFormValues(values: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, val] of Object.entries(values)) {
    if (Array.isArray(val)) {
      val.forEach((entry: any, idx: number) => {
        if (entry && typeof entry === "object") {
          for (const [subKey, subVal] of Object.entries(entry)) {
            out[`${key}.${idx}.${subKey}`] = subVal
          }
        } else {
          out[`${key}.${idx}`] = entry
        }
      })
    } else if (val && typeof val === "object" && !(val instanceof Date)) {
      // Plain nested object — flatten one level
      for (const [subKey, subVal] of Object.entries(val)) {
        out[`${key}.${subKey}`] = subVal
      }
    } else {
      out[key] = val
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// SCHEMA INTROSPECTION
// Walk a schema and produce a fieldId → FieldDef lookup including
// row-expanded repeating-group sub-fields.
// ────────────────────────────────────────────────────────────────────────────

export function buildFieldDefIndex(schema: FormSchema | null | undefined, valueKeys: string[]): Map<string, FieldDef & { _rowIndex?: number; _parentGroup?: string }> {
  const index = new Map<string, FieldDef & { _rowIndex?: number; _parentGroup?: string }>()
  if (!schema) return index

  for (const section of schema.sections) {
    for (const field of section.fields) {
      index.set(field.id, field)

      if (field.type === "repeating_group" && field.groupFields) {
        // Detect how many rows we actually have data for
        const rowsWithData = new Set<number>()
        const prefix = `${field.id}.`
        for (const k of valueKeys) {
          if (k.startsWith(prefix)) {
            const m = /^[^.]+\.(\d+)\./.exec(k)
            if (m) rowsWithData.add(Number(m[1]))
          }
        }
        const rowCount = Math.max(rowsWithData.size, field.maxGroups || 0, 1)
        for (let row = 0; row < rowCount; row++) {
          for (const sub of field.groupFields) {
            const fullId = `${field.id}.${row}.${sub.id}`
            index.set(fullId, { ...sub, _rowIndex: row, _parentGroup: field.id })
          }
        }
      }
    }
  }
  return index
}

// ────────────────────────────────────────────────────────────────────────────
// FILL ONE FIELD
// Try in order: text → checkbox → radio → dropdown.
// ────────────────────────────────────────────────────────────────────────────

function tryFillAcroField(
  form: PDFForm,
  pdfFieldName: string,
  rawValue: any,
  fieldDef?: FieldDef
): { ok: true; value: string } | { ok: false; reason: string } {
  // Normalize the value based on declared field type
  const fieldType = fieldDef?.type
  let value: any = rawValue
  if (fieldType) {
    value = normalizeValue(rawValue, fieldType, { target: "pdf" })
  } else {
    // Best-effort normalization for unknown field types
    value = typeof rawValue === "boolean" ? (rawValue ? "Yes" : "No") : String(rawValue ?? "")
  }
  if (value == null || value === "") return { ok: false, reason: "value normalized to empty" }

  // Try CHECKBOX first if value parses as a boolean
  const asBool = parseYesNo(rawValue)
  if (asBool !== null || fieldType === "yes_no") {
    try {
      const cb = form.getCheckBox(pdfFieldName)
      if (asBool || value === "Yes" || value === true) cb.check()
      else cb.uncheck()
      return { ok: true, value: asBool ? "checked" : "unchecked" }
    } catch { /* not a checkbox */ }
  }

  // Try RADIO GROUP — only meaningful if value is a string label or option value
  try {
    const rg = form.getRadioGroup(pdfFieldName)
    const stringVal = String(value).trim()
    const options = rg.getOptions()
    // Try exact, case-insensitive, and substring match against radio options
    let matched = options.find((o) => o === stringVal)
      || options.find((o) => o.toLowerCase() === stringVal.toLowerCase())
      || options.find((o) => o.toLowerCase().includes(stringVal.toLowerCase()))
      || options.find((o) => stringVal.toLowerCase().includes(o.toLowerCase()))
    if (matched) {
      rg.select(matched)
      return { ok: true, value: matched }
    }
    return { ok: false, reason: `value "${stringVal}" not in radio options [${options.join(", ")}]` }
  } catch { /* not a radio */ }

  // Try DROPDOWN
  try {
    const dd = form.getDropdown(pdfFieldName)
    const stringVal = String(value).trim()
    const options = dd.getOptions()
    let matched = options.find((o) => o === stringVal)
      || options.find((o) => o.toLowerCase() === stringVal.toLowerCase())
      || options.find((o) => o.toLowerCase().includes(stringVal.toLowerCase()))
    if (matched) {
      dd.select(matched)
      return { ok: true, value: matched }
    }
    // Fall through — try as text-fillable dropdown
  } catch { /* not a dropdown */ }

  // Try TEXT FIELD (most common)
  try {
    const tf = form.getTextField(pdfFieldName)
    tf.setText(String(value))
    return { ok: true, value: String(value) }
  } catch (e: any) {
    return { ok: false, reason: e?.message || "unknown error" }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COORDINATE FALLBACK
// Draw text directly at coordinates from a coordinate map.
// ────────────────────────────────────────────────────────────────────────────

async function drawAtCoordinate(
  pdfDoc: PDFDocument,
  fieldId: string,
  rawValue: any,
  coord: { page: number; x: number; y: number; fontSize?: number; maxWidth?: number },
  fieldDef?: FieldDef
): Promise<boolean> {
  try {
    const pages = pdfDoc.getPages()
    if (coord.page < 0 || coord.page >= pages.length) return false
    const page = pages[coord.page]
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    let value: string
    if (fieldDef?.type) {
      const norm = normalizeValue(rawValue, fieldDef.type, { target: "pdf" })
      if (norm == null || norm === "") return false
      value = String(norm)
    } else {
      value = typeof rawValue === "boolean" ? (rawValue ? "X" : "") : String(rawValue ?? "")
    }
    if (!value) return false

    page.drawText(value, {
      x: coord.x,
      y: coord.y,
      size: coord.fontSize ?? 9,
      font,
      color: rgb(0, 0, 0),
      maxWidth: coord.maxWidth,
    })
    return true
  } catch {
    return false
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN FILL ENTRY POINT
// ────────────────────────────────────────────────────────────────────────────

export async function fillPdf(
  pdfBytes: Uint8Array | Buffer,
  values: Record<string, any>,
  opts: FillOptions = {}
): Promise<{ pdfBytes: Uint8Array; report: FillReport }> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = pdfDoc.getForm()
  const acroFields = form.getFields()
  const acroFieldNames = new Set(acroFields.map((f) => f.getName()))
  const acroFieldInfo: PDFFieldInfo[] = acroFields.map((f) => ({
    name: f.getName(),
    type: f.constructor.name,
  }))

  const flatValues = flattenFormValues(values)
  // Strip internal control keys
  delete flatValues._debug

  const fieldDefIndex = buildFieldDefIndex(opts.schema, Object.keys(flatValues))
  const explicitMap = opts.explicitMap || {}
  const coordinateMap = opts.coordinateMap

  const report: FillReport = {
    filled: 0,
    skipped: 0,
    errors: [],
    filledFields: [],
  }

  const usedPdfFields = new Set<string>()

  for (const [fieldId, rawValue] of Object.entries(flatValues)) {
    if (rawValue == null || rawValue === "" || (typeof rawValue === "number" && Number.isNaN(rawValue))) {
      report.skipped++
      continue
    }

    const fieldDef = fieldDefIndex.get(fieldId)

    // 1. EXPLICIT MAP
    let pdfFieldName = explicitMap[fieldId]
    let method: "explicit" | "fuzzy" | "coordinate" = "explicit"

    // 2. FUZZY MATCH if no explicit mapping
    if (!pdfFieldName) {
      // Build SchemaFieldInfo from FieldDef for fuzzy matcher
      const schemaInfo: SchemaFieldInfo = {
        id: fieldId,
        label: fieldDef?.label || fieldId,
        type: fieldDef?.type || "text",
        irsReference: fieldDef?.irsReference,
        parentGroup: (fieldDef as any)?._parentGroup,
        rowIndex: (fieldDef as any)?._rowIndex,
      }
      const match = findBestPdfField(schemaInfo, acroFieldInfo, { excludeNames: usedPdfFields })
      if (match) {
        pdfFieldName = match.fieldName
        method = "fuzzy"
      }
    }

    // 3. TRY ACROFORM FILL
    if (pdfFieldName) {
      // Try the full path; if it fails, try the leaf
      let result = acroFieldNames.has(pdfFieldName)
        ? tryFillAcroField(form, pdfFieldName, rawValue, fieldDef)
        : { ok: false as const, reason: "field name not in PDF" }
      if (!result.ok) {
        const leaf = pdfFieldName.split(".").pop() || pdfFieldName
        if (acroFieldNames.has(leaf)) {
          result = tryFillAcroField(form, leaf, rawValue, fieldDef)
          if (result.ok) pdfFieldName = leaf
        }
      }
      if (result.ok) {
        report.filled++
        usedPdfFields.add(pdfFieldName)
        report.filledFields.push({ fieldId, pdfField: pdfFieldName, method })
        continue
      }
      // AcroForm failed — fall through to coordinate fallback
    }

    // 4. COORDINATE FALLBACK
    if (coordinateMap && coordinateMap.fields[fieldId]?.coordinate) {
      const coord = coordinateMap.fields[fieldId].coordinate!
      const drawn = await drawAtCoordinate(pdfDoc, fieldId, rawValue, coord, fieldDef)
      if (drawn) {
        report.filled++
        report.filledFields.push({ fieldId, pdfField: `coord(p${coord.page},${coord.x},${coord.y})`, method: "coordinate" })
        continue
      }
    }

    // 5. RECORD UNFILLED
    report.errors.push({
      fieldId,
      reason: pdfFieldName
        ? `AcroForm fill failed; no coordinate fallback`
        : `no PDF field match found`,
    })
  }

  if (opts.flatten !== false) {
    try {
      form.flatten()
    } catch {
      // Some forms can't be flattened (XFA-only) — that's ok
    }
  }

  const filledPdfBytes = await pdfDoc.save()
  return { pdfBytes: filledPdfBytes, report }
}
