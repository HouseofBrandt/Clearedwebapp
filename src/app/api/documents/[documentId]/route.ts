import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { getFromS3, deleteFromS3 } from "@/lib/storage"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"

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

  logAudit({
    userId: (session.user as any).id,
    action: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
    caseId: document.caseId,
    resourceId: params.documentId,
    resourceType: "Document",
    metadata: { fileName: document.fileName },
    ipAddress: getClientIP(),
  })

  try {
    const fileBuffer = await getFromS3(document.filePath)

    const mimeTypes: Record<string, string> = {
      PDF: "application/pdf",
      IMAGE: "image/png",
      DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      TEXT: "text/plain",
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": mimeTypes[document.fileType] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${document.fileName}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
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
    await deleteFromS3(document.filePath).catch(() => {})
    await prisma.document.delete({ where: { id: params.documentId } })

    logAudit({
      userId: (session.user as any).id,
      action: AUDIT_ACTIONS.DOCUMENT_DELETED,
      caseId: document.caseId,
      resourceId: params.documentId,
      resourceType: "Document",
      metadata: { fileName: document.fileName },
      ipAddress: getClientIP(),
    })

    recalculateDocCompleteness(document.caseId).catch(() => {})

    return NextResponse.json({ message: "Document deleted" })
  } catch (error) {
    console.error("Delete document error:", error)
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
  }
}
