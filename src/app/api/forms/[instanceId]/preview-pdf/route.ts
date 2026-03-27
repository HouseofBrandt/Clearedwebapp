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

// EXACT mapping: our field ID -> the full PDF field name
// These are the actual AcroForm field names from the IRS PDF
const P = "topmostSubform[0].Page1[0]"
const EXACT_FIELD_MAP: Record<string, string> = {
  "taxpayer_name": `${P}.c1[0].Lines1a-b[0].p1-t4[0]`,
  "ssn": `${P}.c1[0].Lines1a-b[0].p1-t5[0]`,
  "county": `${P}.c1[0].Line1c[0].p1-t6c[0]`,
  "home_phone": `${P}.c1[0].Line1c[0].p1-t7c[0]`,
  "cell_phone": `${P}.c1[0].Line1d[0].p1-t8d[0]`,
  "work_phone": `${P}.c1[0].Line1e[0].p1-t10e[0]`,
  "spouse_name": `${P}.c1[0].Lines1a-b[1].p1-t4[0]`,
  "spouse_ssn": `${P}.c1[0].Lines1a-b[1].p1-t5[0]`,
  "address_street": `${P}.c1[0].C1_01_2a[0]`,
  "address_city": `${P}.c1[0].C1_01_2a[1]`,
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

    // DEBUG MODE: try filling the first field and report what happens
    if (Object.keys(values).length > 0) {
      const form = pdfDoc.getForm()
      const allFields = form.getFields()
      const firstFieldName = allFields[0]?.getName()
      const testResults: string[] = []

      // Try to fill the first field
      try {
        const tf = form.getTextField(firstFieldName)
        tf.setText("TEST_VALUE")
        testResults.push(`SUCCESS: getTextField('${firstFieldName}') worked, setText succeeded`)
      } catch (e: any) {
        testResults.push(`FAILED getTextField: ${e.message}`)
        // Try getField instead
        try {
          const f = allFields[0]
          testResults.push(`Field class: ${f.constructor.name}`)
          testResults.push(`Field acroField: ${JSON.stringify(Object.keys(f))}`)
        } catch (e2: any) {
          testResults.push(`Inspection failed: ${e2.message}`)
        }
      }

      // Return debug info as JSON instead of PDF
      const isDebug = new URL("http://x?" + (values._debug || "")).searchParams.has("debug") || values._debug === true
      if (isDebug) {
        return NextResponse.json({
          fieldCount: allFields.length,
          firstField: firstFieldName,
          testResults,
          valuesReceived: Object.keys(values),
        })
      }
    }

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

    // Fill fields using exact name mapping
    for (const [ourId, value] of Object.entries(flatValues)) {
      if (value === undefined || value === null || value === "") continue
      if (ourId === "_debug") continue

      const pdfFieldName = EXACT_FIELD_MAP[ourId]
      if (!pdfFieldName) continue

      try {
        const textField = form.getTextField(pdfFieldName)
        let displayValue = String(value)
        if (typeof value === "boolean") displayValue = value ? "Yes" : "No"
        textField.setText(displayValue)
        filledCount++
      } catch (e: any) {
        errors.push(`${ourId} → ${pdfFieldName}: ${e?.message?.slice(0, 80)}`)
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
