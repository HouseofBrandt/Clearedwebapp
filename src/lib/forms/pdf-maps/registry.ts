import type { PDFFieldMap } from "./types"
import { FORM_433A_PDF_MAP } from "./form-433a-pdf"

const PDF_MAP_REGISTRY: Record<string, PDFFieldMap> = {
  "433-A": FORM_433A_PDF_MAP,
  // Additional PDF maps can be registered here as they are created:
  // "433-A-OIC": FORM_433A_OIC_PDF_MAP,
  // "12153": FORM_12153_PDF_MAP,
  // "911": FORM_911_PDF_MAP,
}

/**
 * Look up the PDF field map for a given form number.
 * Returns null if no map is registered for that form.
 */
export function getPDFMap(formNumber: string): PDFFieldMap | null {
  return PDF_MAP_REGISTRY[formNumber] || null
}

/**
 * Get the AcroForm-only field map (legacy format) for backward compatibility
 * with the existing preview-pdf route.
 */
export function getAcroFieldMap(formNumber: string): Record<string, string> | null {
  const pdfMap = PDF_MAP_REGISTRY[formNumber]
  if (!pdfMap) return null

  const result: Record<string, string> = {}
  for (const [fieldId, mapping] of Object.entries(pdfMap.fields)) {
    if (mapping.acroFieldName) {
      result[fieldId] = mapping.acroFieldName
    }
  }
  return result
}
