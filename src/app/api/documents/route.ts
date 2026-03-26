export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { uploadToS3 } from "@/lib/storage"
import { extractWithDetails } from "@/lib/documents/extract"
import { canAccessCase } from "@/lib/auth/case-access"
import { computeCaseGraph } from "@/lib/case-intelligence/graph-engine"

/**
 * Detect file type from MIME type, file extension, AND buffer magic bytes.
 */
function detectFileType(mimeType: string, fileName: string, buffer: Buffer): string {
  const ext = fileName.toLowerCase().split(".").pop() || ""
  const mime = (mimeType || "").toLowerCase()

  if (buffer.length > 4) {
    if (buffer.toString("ascii", 0, 5) === "%PDF-") return "PDF"
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
      if (ext === "docx" || ext === "doc" || mime.includes("wordprocessing") || mime.includes("msword")) return "DOCX"
      return "DOCX"
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "IMAGE"
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "IMAGE"
    if ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D)) return "IMAGE"
    if (buffer.toString("ascii", 0, 3) === "GIF") return "IMAGE"
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return "IMAGE"
  }

  if (mime === "application/pdf") return "PDF"
  if (mime.startsWith("image/")) return "IMAGE"
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return "DOCX"
  if (mime.includes("spreadsheetml") || mime.includes("excel") || mime === "text/csv") return "XLSX"
  if (mime.startsWith("text/")) return "TEXT"

  if (ext === "pdf") return "PDF"
  if (["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "heic"].includes(ext)) return "IMAGE"
  if (["doc", "docx"].includes(ext)) return "DOCX"
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLSX"
  if (["txt", "text", "rtf", "log", "md"].includes(ext)) return "TEXT"

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
    const category = (formData.get("documentCategory") as string) || (formData.get("category") as string) || "OTHER"

    if (!file || !caseId) {
      return NextResponse.json({ error: "File and caseId are required" }, { status: 400 })
    }

    const caseExists = await prisma.case.findUnique({ where: { id: caseId } })
    if (!caseExists) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    const hasAccess = await canAccessCase((session.user as any).id, caseId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileType = detectFileType(file.type, file.name, buffer)
    const uniqueName = `${Date.now()}-${file.name}`
    const s3Key = `documents/${caseId}/${uniqueName}`

    const [, extractionResult] = await Promise.all([
      uploadToS3(s3Key, buffer, file.type || "application/octet-stream").catch((err) => {
        console.error("S3 upload failed:", err)
        return null
      }),
      extractWithDetails(buffer, fileType),
    ])

    const extractedText = extractionResult.text.trim() || null

    const document = await prisma.document.create({
      data: {
        caseId,
        fileName: file.name,
        filePath: s3Key,
        fileType: fileType as any,
        fileSize: file.size,
        documentCategory: category as any,
        uploadedById: (session.user as any).id,
        extractedText,
      },
    })

    // Refresh case graph after document upload (fire-and-forget)
    computeCaseGraph(caseId).catch(() => {})

    return NextResponse.json({
      ...document,
      hasExtractedText: !!extractedText,
      extractionMethod: extractionResult.method,
      extractionError: extractionResult.error || null,
    }, { status: 201 })
  } catch (error: any) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: `Failed to upload file: ${error.message}` }, { status: 500 })
  }
}
