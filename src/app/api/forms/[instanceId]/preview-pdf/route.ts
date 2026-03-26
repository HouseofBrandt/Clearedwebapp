import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import { getFormInstance } from "@/lib/forms/form-store"
import {
  PDF_COORDINATES,
  MARITAL_STATUS_DISPLAY,
} from "@/lib/forms/pdf-field-map"

const FORM_PDF_FILES: Record<string, string> = {
  "433-A": "f433a.pdf",
  "433-A-OIC": "f433aoic.pdf",
  "12153": "f12153.pdf",
  "911": "f911.pdf",
}

// Dark blue color to distinguish filled values from printed form text
const FILL_COLOR = rgb(0, 0, 0.6)

/**
 * POST /api/forms/[instanceId]/preview-pdf
 *
 * Generates a filled PDF from values passed in the request body.
 * Uses coordinate-based text drawing to bypass XFA limitations.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let values: Record<string, any> = {}
  let formNumber = "433-A"

  try {
    const body = await request.json()
    values = body.values || {}
    formNumber = body.formNumber || "433-A"
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const pdfFileName = FORM_PDF_FILES[formNumber]
  if (!pdfFileName) {
    return NextResponse.json({ error: "PDF not available for this form" }, { status: 404 })
  }

  return generateFilledPDF(formNumber, values, pdfFileName)
}

/**
 * GET /api/forms/[instanceId]/preview-pdf
 *
 * Fallback: reads values from the file store (if available).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { instanceId } = params
  let values: Record<string, any> = {}
  let formNumber = "433-A"

  const instance = getFormInstance(instanceId)
  if (instance) {
    values = instance.values || {}
    formNumber = instance.formNumber || "433-A"
  }

  const pdfFileName = FORM_PDF_FILES[formNumber]
  if (!pdfFileName) {
    return NextResponse.json({ error: "PDF not available for this form" }, { status: 404 })
  }

  return generateFilledPDF(formNumber, values, pdfFileName)
}

async function generateFilledPDF(formNumber: string, values: Record<string, any>, pdfFileName: string) {

  try {
    // Load the blank IRS PDF
    const pdfPath = join(process.cwd(), "public", "forms", pdfFileName)
    const pdfBytes = await readFile(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

    // Embed Helvetica font (built into pdf-lib, no external files needed)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    // Get all pages
    const pages = pdfDoc.getPages()

    // Flatten repeating group values into dot-notation keys
    const flatValues: Record<string, any> = {}
    for (const [key, val] of Object.entries(values)) {
      if (Array.isArray(val)) {
        // Repeating group: flatten each entry
        val.forEach((entry: Record<string, any>, idx: number) => {
          if (entry && typeof entry === "object") {
            for (const [subKey, subVal] of Object.entries(entry)) {
              flatValues[`${key}.${idx}.${subKey}`] = subVal
            }
          }
        })
      } else {
        flatValues[key] = val
      }
    }

    // Get the coordinate map for this form
    const fieldCoords = PDF_COORDINATES[formNumber] || {}

    let filledCount = 0

    // Draw each mapped field value at its coordinates
    for (const [ourFieldId, coords] of Object.entries(fieldCoords)) {
      let value = flatValues[ourFieldId]

      // Special handling: marital_status displays a human-readable label
      if (ourFieldId === "marital_status" && typeof value === "string") {
        value = MARITAL_STATUS_DISPLAY[value] || value
      }

      if (value === undefined || value === null || value === "") continue

      const page = pages[coords.page]
      if (!page) continue

      // Convert value to display string
      let displayValue: string
      if (typeof value === "boolean") {
        displayValue = value ? "X" : ""
      } else if (typeof value === "number") {
        displayValue = String(value)
      } else {
        displayValue = String(value)
      }

      if (displayValue === "") continue

      // Draw the text onto the page
      page.drawText(displayValue, {
        x: coords.x,
        y: coords.y,
        size: coords.fontSize || 9,
        font,
        color: FILL_COLOR,
        maxWidth: coords.maxWidth,
      })

      filledCount++
    }

    console.log(`[PDF FILL] Drew ${filledCount} values on ${formNumber} (coordinate-based, XFA bypassed)`)

    // Generate the filled PDF
    const filledPdfBytes = await pdfDoc.save()

    return new NextResponse(filledPdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${formNumber}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error: any) {
    console.error("PDF generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 }
    )
  }
}
