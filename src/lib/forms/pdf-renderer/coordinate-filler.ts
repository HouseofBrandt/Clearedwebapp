import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib"
import { StandardFonts, rgb } from "pdf-lib"
import type { PDFBinding, FillFailure } from "../types"
import { applyTransform } from "./value-transforms"

interface CoordFillStats {
  filled: number
  skipped: number
  failed: FillFailure[]
}

/**
 * Fill a PDF by drawing text at explicit coordinates.
 *
 * Used when the PDF is XFA-based (pdf-lib strips XFA on load) or when
 * AcroForm fields are unreliable. Coordinates are in points from the
 * bottom-left of the page.
 *
 * Font: Times New Roman is not bundled with pdf-lib — StandardFonts only
 * exposes Helvetica, Courier, and Times. We use Times-Roman for text
 * because the firm's export standard is Times New Roman; the visual
 * difference between Times-Roman and Times New Roman is negligible at
 * form-fill sizes, and embedding a custom font would bloat the function.
 *
 * Checkboxes render as "X" at the coordinate with the configured font size
 * bumped by 2 points for visual weight.
 */
export async function coordinateFill(
  pdfDoc: PDFDocument,
  binding: PDFBinding,
  flatValues: Record<string, any>
): Promise<CoordFillStats> {
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const pages = pdfDoc.getPages()

  let filled = 0
  let skipped = 0
  const failed: FillFailure[] = []

  for (const [fieldId, fieldBinding] of Object.entries(binding.fields)) {
    if (!fieldBinding.coord) continue

    const value = flatValues[fieldId]
    if (value === undefined || value === null || value === "") {
      skipped++
      continue
    }

    const display = applyTransform(value, fieldBinding.transform)
    if (!display) {
      skipped++
      continue
    }

    const coord = fieldBinding.coord
    const page = pages[coord.page]
    if (!page) {
      failed.push({ fieldId, reason: `page ${coord.page} does not exist (PDF has ${pages.length} pages)` })
      continue
    }

    try {
      drawOne(page, font, display, coord)
      filled++
    } catch (err: any) {
      failed.push({ fieldId, reason: err?.message?.slice(0, 150) || "draw failed" })
    }
  }

  return { filled, skipped, failed }
}

function drawOne(
  page: PDFPage,
  font: PDFFont,
  display: string,
  coord: {
    page: number
    x: number
    y: number
    fontSize?: number
    maxWidth?: number
    isCheckbox?: boolean
  }
): void {
  if (coord.isCheckbox) {
    // Render "X" at the checkbox coordinate, one step larger for weight.
    const size = (coord.fontSize || 9) + 2
    page.drawText("X", {
      x: coord.x,
      y: coord.y,
      size,
      font,
      color: rgb(0, 0, 0),
    })
    return
  }

  // Truncate to maxWidth if specified. pdf-lib does not support text wrapping
  // natively; for form-fill we prefer truncation with ellipsis to prevent
  // overflow into neighboring fields.
  const size = coord.fontSize || 9
  let text = display
  if (coord.maxWidth && coord.maxWidth > 0) {
    text = truncateToWidth(text, font, size, coord.maxWidth)
  }

  page.drawText(text, {
    x: coord.x,
    y: coord.y,
    size,
    font,
    color: rgb(0, 0, 0),
  })
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const width = font.widthOfTextAtSize(text, size)
  if (width <= maxWidth) return text

  // Binary search for the longest prefix that fits, with room for ellipsis.
  const ellipsis = "…"
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, size)
  const budget = maxWidth - ellipsisWidth

  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const slice = text.slice(0, mid)
    if (font.widthOfTextAtSize(slice, size) <= budget) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return text.slice(0, lo) + ellipsis
}
