import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import { getFormInstance } from "@/lib/forms/form-store"
import {
  PDF_FIELD_MAP,
  PDF_CHECKBOX_MAP,
  MARITAL_STATUS_CHECKBOX_MAP,
} from "@/lib/forms/pdf-field-map"

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

    // Try to fill AcroForm fields (if the PDF has fillable fields)
    let filledViaAcroForm = false
    try {
      const form = pdfDoc.getForm()
      const fields = form.getFields()

      if (fields.length > 0) {
        const fieldMap = PDF_FIELD_MAP[formNumber] || {}
        const checkboxMap = PDF_CHECKBOX_MAP[formNumber] || {}

        // Build a reverse map: PDF field name -> our field ID
        const reverseMap: Record<string, string> = {}
        for (const [ourFieldId, pdfFieldName] of Object.entries(fieldMap)) {
          reverseMap[pdfFieldName] = ourFieldId
        }

        // Build a reverse checkbox map: PDF field name -> { ourFieldId, checkedWhen }
        const reverseCheckboxMap: Record<string, { ourFieldId: string; checkedWhen: any }> = {}
        for (const [ourFieldId, config] of Object.entries(checkboxMap)) {
          reverseCheckboxMap[config.pdfField] = {
            ourFieldId,
            checkedWhen: config.checkedWhen,
          }
        }

        for (const field of fields) {
          const pdfFieldName = field.getName()

          // ── Try checkbox fields first ──
          const checkboxConfig = reverseCheckboxMap[pdfFieldName]
          if (checkboxConfig) {
            try {
              const checkbox = form.getCheckBox(pdfFieldName)
              const ourFieldId = checkboxConfig.ourFieldId

              // Special handling for marital status checkboxes
              if (ourFieldId === "marital_status_married" || ourFieldId === "marital_status_unmarried") {
                const maritalValue = flatValues["marital_status"]
                if (maritalValue) {
                  const expectedType = MARITAL_STATUS_CHECKBOX_MAP[maritalValue]
                  if (
                    (ourFieldId === "marital_status_married" && expectedType === "married") ||
                    (ourFieldId === "marital_status_unmarried" && expectedType === "unmarried")
                  ) {
                    checkbox.check()
                    filledViaAcroForm = true
                  }
                }
              } else {
                // Standard yes/no checkbox
                const value = flatValues[ourFieldId]
                if (
                  value === true ||
                  value === "yes" ||
                  value === "Yes" ||
                  value === checkboxConfig.checkedWhen
                ) {
                  checkbox.check()
                  filledViaAcroForm = true
                }
              }
              continue
            } catch {
              // Not actually a checkbox, fall through to text field handling
            }
          }

          // ── Try text fields ──
          const ourFieldId = reverseMap[pdfFieldName]
          if (ourFieldId) {
            const matchedValue = flatValues[ourFieldId]
            if (matchedValue !== undefined && matchedValue !== null && matchedValue !== "") {
              try {
                const textField = form.getTextField(pdfFieldName)
                let displayValue = matchedValue
                if (typeof displayValue === "boolean") displayValue = displayValue ? "Yes" : "No"
                if (typeof displayValue === "number") displayValue = String(displayValue)
                textField.setText(String(displayValue))
                filledViaAcroForm = true
              } catch {
                // Not a text field (could be dropdown, radio, etc.) — skip
              }
            }
          }
        }

        // Flatten the form so values render as text, not editable fields
        form.flatten()
      }
    } catch {
      // PDF may not have a valid AcroForm — fall through to error response
      // since coordinate-based fallback is less reliable
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
