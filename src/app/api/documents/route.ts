import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { uploadToS3 } from "@/lib/storage"
import { extractTextFromDocument } from "@/lib/documents/extract"

function getFileType(mimeType: string): "PDF" | "IMAGE" | "DOCX" | "XLSX" | "TEXT" {
  if (mimeType === "application/pdf") return "PDF"
  if (mimeType.startsWith("image/")) return "IMAGE"
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) return "DOCX"
  if (mimeType.includes("spreadsheetml") || mimeType.includes("ms-excel")) return "XLSX"
  return "TEXT"
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const caseId = formData.get("caseId") as string | null
    const category = (formData.get("category") as string) || "OTHER"

    if (!file || !caseId) {
      return NextResponse.json({ error: "File and caseId are required" }, { status: 400 })
    }

    // Verify case exists
    const caseExists = await prisma.case.findUnique({ where: { id: caseId } })
    if (!caseExists) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    // Upload to S3
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const uniqueName = `${Date.now()}-${file.name}`
    const s3Key = `documents/${caseId}/${uniqueName}`
    await uploadToS3(s3Key, buffer, file.type || "application/octet-stream")

    const fileType = getFileType(file.type)

    // Extract text from document
    let extractedText: string | null = null
    try {
      extractedText = await extractTextFromDocument(s3Key, fileType)
      if (extractedText && !extractedText.trim()) {
        extractedText = null
      }
    } catch (err) {
      console.error("Text extraction failed (non-fatal):", err)
    }

    // Create document record
    const document = await prisma.document.create({
      data: {
        caseId,
        fileName: file.name,
        filePath: s3Key,
        fileType,
        fileSize: file.size,
        documentCategory: category as any,
        uploadedById: (session.user as any).id,
        extractedText,
      },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
