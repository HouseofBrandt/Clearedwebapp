import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { PDFDocument } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"

const FORM_PDF_FILES: Record<string, string> = {
  "433-A": "f433a.pdf",
  "433-A-OIC": "f433aoic.pdf",
  "12153": "f12153.pdf",
  "911": "f911.pdf",
}

/**
 * GET /api/forms/pdf-fields?form=433-A
 *
 * Utility endpoint that reads an IRS PDF and returns all of its fillable
 * AcroForm field names and types. Use this during development to discover
 * the correct field names for building PDF_FIELD_MAP entries.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const formNumber = url.searchParams.get("form") || "433-A"

  const fileName = FORM_PDF_FILES[formNumber]
  if (!fileName) {
    return NextResponse.json(
      { error: `Unknown form number: ${formNumber}` },
      { status: 404 }
    )
  }

  try {
    const pdfPath = join(process.cwd(), "public", "forms", fileName)
    const pdfBytes = await readFile(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const form = pdfDoc.getForm()
    const fields = form.getFields()

    const fieldInfo = fields.map((f) => ({
      name: f.getName(),
      type: f.constructor.name,
    }))

    return NextResponse.json({
      formNumber,
      fileName,
      totalFields: fields.length,
      fields: fieldInfo,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
