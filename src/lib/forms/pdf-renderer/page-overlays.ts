import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib"
import { StandardFonts, rgb, degrees } from "pdf-lib"

export interface OverlayOptions {
  watermark?: "DRAFT" | "PRACTITIONER REVIEW REQUIRED" | null
  includePageNumbers?: boolean
}

/**
 * Apply page overlays to a filled PDF.
 *
 *   - Watermark: diagonal, 30% opacity, every page.
 *     Standard wording: "DRAFT — NOT FOR FILING" or
 *     "PRACTITIONER REVIEW REQUIRED" per the spec §11.2.
 *
 *   - Page numbers: bottom-right, small, "Page N of M".
 *
 * Runs after fill but before flatten so the watermark is not editable
 * by a PDF viewer.
 */
export async function applyOverlays(
  pdfDoc: PDFDocument,
  options: OverlayOptions
): Promise<void> {
  if (!options.watermark && !options.includePageNumbers) return

  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const pages = pdfDoc.getPages()
  const total = pages.length

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]

    if (options.watermark) {
      drawWatermark(page, font, options.watermark === "DRAFT" ? "DRAFT — NOT FOR FILING" : "PRACTITIONER REVIEW REQUIRED")
    }

    if (options.includePageNumbers) {
      drawPageNumber(page, font, i + 1, total)
    }
  }
}

function drawWatermark(page: PDFPage, font: PDFFont, text: string): void {
  const { width, height } = page.getSize()
  const fontSize = Math.floor(Math.min(width, height) * 0.08)

  // Estimate text width so we can center-align under the diagonal.
  const textWidth = font.widthOfTextAtSize(text, fontSize)
  const centerX = width / 2
  const centerY = height / 2

  // Rotate 30 degrees for diagonal effect.
  // The rotation origin is the text's (x, y); we offset half its width.
  const angle = 30
  const rad = (angle * Math.PI) / 180
  const offsetX = (textWidth / 2) * Math.cos(rad)
  const offsetY = (textWidth / 2) * Math.sin(rad)

  page.drawText(text, {
    x: centerX - offsetX,
    y: centerY - offsetY,
    size: fontSize,
    font,
    color: rgb(0.7, 0.7, 0.7),
    opacity: 0.3,
    rotate: degrees(angle),
  })
}

function drawPageNumber(page: PDFPage, font: PDFFont, current: number, total: number): void {
  const { width } = page.getSize()
  const text = `Page ${current} of ${total}`
  const size = 9
  const textWidth = font.widthOfTextAtSize(text, size)
  page.drawText(text, {
    x: width - textWidth - 36,
    y: 18,
    size,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })
}
