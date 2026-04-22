import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { canAccessCase } from "@/lib/auth/case-access"
import { prisma } from "@/lib/db"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { fillPDFOrReport } from "@/lib/forms/pdf-renderer"
import { getFormSchema, FORM_BUILDER_V2_ENABLED } from "@/lib/forms/registry"
import { logAudit } from "@/lib/ai/audit"

/**
 * Merge every complete form instance for a case into a single PDF, with a
 * cover sheet and table of contents, and stream it to the client.
 *
 * This is the "submit package to IRS" deliverable: one PDF the practitioner
 * can print, sign, and mail. Or attach to a portal upload.
 *
 * Only forms with a PDF binding on disk can be included. Instances for
 * forms that have a schema but no binding are listed on the cover sheet
 * as "Not included — binding pending".
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  if (!FORM_BUILDER_V2_ENABLED) {
    return NextResponse.json({ error: "V2 package download is disabled" }, { status: 404 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = (session.user as any).id

  const hasAccess = await canAccessCase(userId, params.caseId)
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [caseRow, user, instances] = await Promise.all([
    prisma.case.findUnique({
      where: { id: params.caseId },
      select: { id: true, tabsNumber: true, clientName: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.formInstance.findMany({
      where: { caseId: params.caseId, status: { in: ["complete", "submitted"] } },
      select: { id: true, formNumber: true, revision: true, values: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
    }),
  ])
  if (!caseRow) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (instances.length === 0) {
    return NextResponse.json({ error: "No complete forms in package" }, { status: 400 })
  }

  // Fill each form and collect page counts for the cover sheet TOC.
  const filled: Array<{
    formNumber: string
    title: string
    pdfBytes: Uint8Array
    pageStart: number
    pageEnd: number
    failed: number
  }> = []
  const skipped: Array<{ formNumber: string; reason: string }> = []

  // Start page counter at 2 — page 1 will be the cover sheet (we'll insert TOC
  // after a first fill-pass determines total pages).
  let pageCursor = 1 // the cover sheet is page 1; first form starts at page 2

  for (const inst of instances) {
    const schema = await getFormSchema(inst.formNumber)
    if (!schema) {
      skipped.push({ formNumber: inst.formNumber, reason: "Schema not registered" })
      continue
    }
    const filledResult = await fillPDFOrReport({
      formNumber: inst.formNumber,
      // Prefer the instance's recorded revision; otherwise let the renderer
      // pick the registry default.
      revision: inst.revision !== "unknown" ? inst.revision : undefined,
      values: (inst.values as Record<string, any>) || {},
      options: { flatten: true },
    })
    if (!filledResult.ok) {
      skipped.push({ formNumber: inst.formNumber, reason: filledResult.reason })
      continue
    }
    const r = filledResult.result
    // Load bytes back into pdf-lib to count pages and merge.
    const doc = await PDFDocument.load(r.pdfBytes, { ignoreEncryption: true })
    const count = doc.getPageCount()
    filled.push({
      formNumber: inst.formNumber,
      title: schema.formTitle,
      pdfBytes: r.pdfBytes,
      pageStart: pageCursor + 1, // +1 because cover sheet occupies page 1
      pageEnd: pageCursor + count,
      failed: r.failed.length,
    })
    pageCursor += count
  }

  if (filled.length === 0) {
    return NextResponse.json({
      error: "No forms could be rendered. See 'skipped' for details.",
      skipped,
    }, { status: 500 })
  }

  // Build the final merged PDF: cover sheet + all forms.
  const merged = await PDFDocument.create()
  const font = await merged.embedFont(StandardFonts.TimesRoman)
  const fontBold = await merged.embedFont(StandardFonts.TimesRomanBold)

  drawCoverSheet(merged, font, fontBold, {
    caseNumber: caseRow.tabsNumber,
    clientName: caseRow.clientName,
    preparerName: user?.name || user?.email || "Unknown practitioner",
    formsIncluded: filled.map((f) => ({
      formNumber: f.formNumber,
      title: f.title,
      pageStart: f.pageStart,
      pageEnd: f.pageEnd,
    })),
    skipped,
  })

  // Append each filled form.
  for (const f of filled) {
    const doc = await PDFDocument.load(f.pdfBytes, { ignoreEncryption: true })
    const copied = await merged.copyPages(doc, doc.getPageIndices())
    for (const p of copied) merged.addPage(p)
  }

  const mergedBytes = await merged.save()

  logAudit({
    userId,
    action: "FORM_PACKAGE_DOWNLOADED",
    caseId: params.caseId,
    metadata: {
      formCount: filled.length,
      skipCount: skipped.length,
      totalPages: pageCursor,
    },
  }).catch(() => {})

  return new NextResponse(Buffer.from(mergedBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${caseRow.tabsNumber}-forms-package.pdf"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}

function drawCoverSheet(
  pdf: PDFDocument,
  font: any,
  fontBold: any,
  data: {
    caseNumber: string
    clientName: string
    preparerName: string
    formsIncluded: Array<{ formNumber: string; title: string; pageStart: number; pageEnd: number }>
    skipped: Array<{ formNumber: string; reason: string }>
  }
) {
  const page = pdf.insertPage(0, [612, 792])
  const { width, height } = page.getSize()
  const margin = 72
  let y = height - margin

  // Letterhead.
  page.drawText("CLEARED", {
    x: margin, y,
    size: 14, font: fontBold, color: rgb(0.1, 0.1, 0.1),
  })
  y -= 20
  page.drawText("Tax Resolution Working Package", {
    x: margin, y,
    size: 10, font, color: rgb(0.4, 0.4, 0.4),
  })

  y -= 50

  // Case info.
  page.drawText(`Case ${data.caseNumber}`, { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) })
  y -= 24
  page.drawText(data.clientName, { x: margin, y, size: 14, font, color: rgb(0.2, 0.2, 0.2) })
  y -= 16
  page.drawText(`Prepared by ${data.preparerName}`, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
  y -= 14
  page.drawText(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, {
    x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
  })

  y -= 48

  // TOC header.
  page.drawText("Contents", { x: margin, y, size: 13, font: fontBold, color: rgb(0, 0, 0) })
  y -= 20

  const rightCol = width - margin

  for (const f of data.formsIncluded) {
    const label = `Form ${f.formNumber} — ${f.title}`
    const pageRange = f.pageStart === f.pageEnd ? `p. ${f.pageStart}` : `pp. ${f.pageStart}–${f.pageEnd}`
    page.drawText(truncate(label, 72), { x: margin, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) })
    const rangeWidth = font.widthOfTextAtSize(pageRange, 11)
    page.drawText(pageRange, { x: rightCol - rangeWidth, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 16
    if (y < 120) break
  }

  if (data.skipped.length > 0) {
    y -= 16
    page.drawText("Not included (binding pending)", { x: margin, y, size: 11, font: fontBold, color: rgb(0.6, 0.3, 0.1) })
    y -= 14
    for (const s of data.skipped) {
      page.drawText(`— Form ${s.formNumber}: ${truncate(s.reason, 60)}`, {
        x: margin, y, size: 10, font, color: rgb(0.5, 0.3, 0.1),
      })
      y -= 12
      if (y < 80) break
    }
  }

  // Footer disclaimer. Lines are drawn top-to-bottom; pdf-lib's y is measured
  // from the bottom of the page, so we start high and decrement.
  const disclaimer = "This package was assembled by Cleared for review. All forms require licensed-practitioner approval before filing with the IRS. Original signatures are required on all forms before submission."
  const lines = wrapText(disclaimer, 68)
  let footerY = 72 + lines.length * 10
  for (const line of lines) {
    page.drawText(line, { x: margin, y: footerY, size: 8, font, color: rgb(0.5, 0.5, 0.5) })
    footerY -= 10
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}

function wrapText(text: string, charsPerLine: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const w of words) {
    if ((current + " " + w).trim().length > charsPerLine) {
      if (current) lines.push(current.trim())
      current = w
    } else {
      current = (current ? current + " " : "") + w
    }
  }
  if (current) lines.push(current.trim())
  return lines
}
