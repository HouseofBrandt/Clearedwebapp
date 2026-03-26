import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import { getFormInstance } from "@/lib/forms/form-store"
import { PDF_FIELD_MAP, PDF_TEXT_COORDINATES } from "@/lib/forms/pdf-field-map"

const FORM_PDF_FILES: Record<string, string> = {
  "433-A": "f433a.pdf",
  "433-A-OIC": "f433aoic.pdf",
  "12153": "f12153.pdf",
  "911": "f911.pdf",
}

/**
 * GET /api/forms/[instanceId]/preview-pdf
 *
 * Generates a filled PDF by loading the blank IRS form and overlaying the
 * user's current field values. Returns the PDF as binary with Content-Type
 * application/pdf for inline display in an iframe.
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

  // Load the form instance values
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

  try {
    // Load the blank IRS PDF
    const pdfPath = join(process.cwd(), "public", "forms", pdfFileName)
    const pdfBytes = await readFile(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

    // Try to fill AcroForm fields first (if the PDF has fillable fields)
    let filledViaAcroForm = false
    try {
      const form = pdfDoc.getForm()
      const fields = form.getFields()

      if (fields.length > 0) {
        const fieldMap = PDF_FIELD_MAP[formNumber] || {}

        // Build a reverse map: PDF field name -> our field ID
        const reverseMap: Record<string, string> = {}
        for (const [ourFieldId, pdfFieldName] of Object.entries(fieldMap)) {
          reverseMap[pdfFieldName] = ourFieldId
        }

        for (const field of fields) {
          const fieldName = field.getName()
          try {
            const textField = form.getTextField(fieldName)

            // First try reverse map (exact match from our field map)
            let matchedValue: any = undefined
            if (reverseMap[fieldName]) {
              matchedValue = values[reverseMap[fieldName]]
            }

            // If no exact match, try keyword-based matching
            if (matchedValue === undefined || matchedValue === null || matchedValue === "") {
              matchedValue = findMatchingValue(fieldName, values)
            }

            if (matchedValue !== undefined && matchedValue !== null && matchedValue !== "") {
              textField.setText(String(matchedValue))
              filledViaAcroForm = true
            }
          } catch {
            // Not a text field (could be checkbox, dropdown, etc.) — skip
          }
        }

        // Flatten the form so values render as text, not editable fields
        form.flatten()
      }
    } catch {
      // PDF may not have a valid AcroForm — fall through to coordinate-based approach
    }

    // If AcroForm filling didn't work (or partially worked), also use coordinate-based
    // text placement as a fallback
    if (!filledViaAcroForm) {
      const coords = PDF_TEXT_COORDINATES[formNumber]
      if (coords && coords.length > 0) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const pages = pdfDoc.getPages()

        for (const coord of coords) {
          const value = values[coord.fieldId]
          if (value === undefined || value === null || value === "") continue

          const page = pages[coord.page]
          if (!page) continue

          let text = String(value)

          // Truncate if maxWidth is specified (rough estimate: 6pts per char)
          if (coord.maxWidth) {
            const approxCharsPerWidth = Math.floor(coord.maxWidth / (coord.fontSize * 0.5))
            if (text.length > approxCharsPerWidth) {
              text = text.substring(0, approxCharsPerWidth)
            }
          }

          page.drawText(text, {
            x: coord.x,
            y: coord.y,
            size: coord.fontSize,
            font,
            color: rgb(0, 0, 0.6), // Dark blue to distinguish from printed form text
          })
        }
      }
    }

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

/**
 * Try to match our schema field ID to a PDF form field name using keyword
 * heuristics. This is a best-effort fallback when we don't have an exact
 * mapping in PDF_FIELD_MAP.
 */
function findMatchingValue(
  pdfFieldName: string,
  values: Record<string, any>
): any {
  const lower = pdfFieldName.toLowerCase()

  // Common mappings between PDF field name keywords and our schema field IDs
  const mappings: Record<string, string[]> = {
    name: ["taxpayer_name", "spouse_name"],
    ssn: ["ssn", "spouse_ssn"],
    social: ["ssn", "spouse_ssn"],
    address: ["address_street"],
    street: ["address_street"],
    city: ["address_city"],
    state: ["address_state"],
    zip: ["address_zip"],
    phone: ["home_phone", "cell_phone", "daytime_phone"],
    dob: ["dob"],
    birth: ["dob", "spouse_dob"],
    marital: ["marital_status"],
    employer: ["employer_name"],
    occupation: ["occupation"],
    county: ["county"],
  }

  // Try exact match first
  if (values[pdfFieldName] !== undefined) return values[pdfFieldName]

  // Try keyword matching
  for (const [keyword, fieldIds] of Object.entries(mappings)) {
    if (lower.includes(keyword)) {
      for (const fieldId of fieldIds) {
        if (values[fieldId] !== undefined && values[fieldId] !== "") {
          return values[fieldId]
        }
      }
    }
  }

  return undefined
}
