import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { PDFDocument } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import { getFormInstance } from "@/lib/forms/form-store"

const FORM_PDF_FILES: Record<string, string> = {
  "433-A": "f433a.pdf",
  "433-A-OIC": "f433aoic.pdf",
  "12153": "f12153.pdf",
  "911": "f911.pdf",
}

// Map our schema field IDs to keywords that appear in the PDF field names
// The PDF has 393 fields with names like "topmostSubform[0].Page1[0].c1[0].Lines1a-b[0].p1-t4[0]"
// We match by looking for patterns in the field names
const FIELD_KEYWORDS: Record<string, string[]> = {
  "taxpayer_name": ["Lines1a-b[0].p1-t4[0]"],
  "ssn": ["Lines1a-b[0].p1-t5[0]"],
  "address_street": ["C1_01_2a[0]", "2a[0]"],
  "address_city": ["C1_01_2a[1]", "2a[1]"],
  "county": ["Line1c[0].p1-t6"],
  "home_phone": ["Line1c[0].p1-t7", "Line1d[0].p1-t8"],
  "cell_phone": ["Line1d[0].p1-t8", "Line1e[0].p1-t10"],
  "work_phone": ["Line1e[0].p1-t10", "Line1e[0].p1-t11"],
  "spouse_name": ["Lines1a-b[1].p1-t4[0]"],
  "spouse_ssn": ["Lines1a-b[1].p1-t5[0]"],
}

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
    return NextResponse.json({ error: "PDF not available" }, { status: 404 })
  }

  return generateFilledPDF(formNumber, values, pdfFileName)
}

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
    return NextResponse.json({ error: "PDF not available" }, { status: 404 })
  }

  return generateFilledPDF(formNumber, values, pdfFileName)
}

async function generateFilledPDF(formNumber: string, values: Record<string, any>, pdfFileName: string) {
  try {
    const pdfPath = join(process.cwd(), "public", "forms", pdfFileName)
    const pdfBytes = await readFile(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

    // Flatten repeating groups
    const flatValues: Record<string, any> = {}
    for (const [key, val] of Object.entries(values)) {
      if (Array.isArray(val)) {
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

    // Get the form — pdf-lib strips XFA but keeps AcroForm fields
    const form = pdfDoc.getForm()
    const fields = form.getFields()
    let filledCount = 0
    const errors: string[] = []

    console.log(`[PDF FILL] Form has ${fields.length} AcroForm fields after XFA strip`)

    // Build a reverse lookup: short suffix -> full field name
    const fieldLookup: Record<string, string> = {}
    for (const field of fields) {
      const name = field.getName()
      // Store multiple lookup keys for each field
      fieldLookup[name] = name
      // Also store by last segment
      const parts = name.split(".")
      const lastPart = parts[parts.length - 1]
      if (!fieldLookup[lastPart]) fieldLookup[lastPart] = name
      // Store by last two segments
      if (parts.length >= 2) {
        const last2 = parts.slice(-2).join(".")
        if (!fieldLookup[last2]) fieldLookup[last2] = name
      }
    }

    // Direct mapping: our field ID -> the exact PDF field name suffix to match
    const DIRECT_MAP: Record<string, string> = {
      "taxpayer_name": "p1-t4[0]",
      "ssn": "p1-t5[0]",
      "address_street": "C1_01_2a[0]",
      "county": "p1-t6c[0]",
      "home_phone": "p1-t7c[0]",
      "cell_phone": "p1-t8d[0]",
      "work_phone": "p1-t10e[0]",
      "spouse_name": "p1-t4[0]", // Second instance
    }

    // Try to fill each of our values into the PDF
    for (const [ourId, value] of Object.entries(flatValues)) {
      if (value === undefined || value === null || value === "") continue

      const suffix = DIRECT_MAP[ourId]
      if (!suffix) continue

      // Find the PDF field that ends with this suffix
      let targetField: string | null = null
      for (const field of fields) {
        const name = field.getName()
        if (name.endsWith(suffix)) {
          // For spouse_name, skip the first match (taxpayer) and use the second
          if (ourId === "spouse_name" && name.includes("[0].Lines1a-b[0]")) continue
          targetField = name
          break
        }
      }

      if (!targetField) continue

      try {
        const textField = form.getTextField(targetField)
        let displayValue = String(value)
        if (typeof value === "boolean") displayValue = value ? "Yes" : "No"
        textField.setText(displayValue)
        filledCount++
        console.log(`[PDF FILL] ✓ ${ourId} → ${targetField.slice(-50)} = "${displayValue.slice(0, 30)}"`)
      } catch (e: any) {
        try {
          if (value === true) {
            const cb = form.getCheckBox(targetField)
            cb.check()
            filledCount++
          }
        } catch {
          errors.push(`${ourId}: ${e?.message?.slice(0, 50)}`)
        }
      }
    }

    console.log(`[PDF FILL] Filled ${filledCount} fields, ${errors.length} errors`)
    if (errors.length > 0) console.log(`[PDF FILL] Errors: ${errors.slice(0, 5).join("; ")}`)

    // Flatten form so values render as text
    form.flatten()

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
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 })
  }
}
