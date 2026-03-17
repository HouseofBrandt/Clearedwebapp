import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { readFile, unlink } from "fs/promises"
import path from "path"

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const document = await prisma.document.findUnique({
    where: { id: params.documentId },
  })

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), document.filePath)
    const fileBuffer = await readFile(filePath)

    const mimeTypes: Record<string, string> = {
      PDF: "application/pdf",
      IMAGE: "image/png",
      DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      TEXT: "text/plain",
    }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": mimeTypes[document.fileType] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${document.fileName}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const document = await prisma.document.findUnique({
    where: { id: params.documentId },
  })

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), document.filePath)
    await unlink(filePath).catch(() => {})
    await prisma.document.delete({ where: { id: params.documentId } })
    return NextResponse.json({ message: "Document deleted" })
  } catch (error) {
    console.error("Delete document error:", error)
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
  }
}
