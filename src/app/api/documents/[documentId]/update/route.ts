import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const { documentCategory } = body

    const document = await prisma.document.update({
      where: { id: params.documentId },
      data: { documentCategory },
      select: { id: true, caseId: true, fileName: true, documentCategory: true },
    })

    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.DOCUMENT_CATEGORY_CHANGED,
      caseId: document.caseId,
      resourceId: params.documentId,
      resourceType: "Document",
      metadata: { newCategory: documentCategory, fileName: document.fileName },
    })

    recalculateDocCompleteness(document.caseId).catch(() => {})

    return NextResponse.json(document)
  } catch (error) {
    console.error("Update document error:", error)
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 })
  }
}
