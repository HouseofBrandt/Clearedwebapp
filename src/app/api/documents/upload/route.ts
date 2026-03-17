import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

function getFileType(mimeType: string, fileName: string): string {
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) return "PDF"
  if (mimeType.startsWith("image/")) return "IMAGE"
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.endsWith(".docx")) return "DOCX"
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || fileName.endsWith(".xlsx")) return "XLSX"
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
    const documentCategory = (formData.get("documentCategory") as string) || "OTHER"

    if (!file || !caseId) {
      return NextResponse.json(
        { error: "File and caseId are required" },
        { status: 400 }
      )
    }

    // Verify case exists
    const caseExists = await prisma.case.findUnique({ where: { id: caseId } })
    if (!caseExists) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    // Create upload directory
    const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || "./uploads", caseId)
    await mkdir(uploadDir, { recursive: true })

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const uniqueName = `${Date.now()}-${file.name}`
    const filePath = path.join(uploadDir, uniqueName)
    await writeFile(filePath, buffer)

    const fileType = getFileType(file.type, file.name)

    const document = await prisma.document.create({
      data: {
        caseId,
        fileName: file.name,
        filePath: path.relative(process.cwd(), filePath),
        fileType: fileType as any,
        fileSize: buffer.length,
        documentCategory: documentCategory as any,
        uploadedById: (session.user as any).id,
      },
      include: {
        uploadedBy: { select: { name: true } },
      },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
