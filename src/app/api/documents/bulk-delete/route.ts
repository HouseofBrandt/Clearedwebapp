import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { deleteFromS3 } from "@/lib/storage"
import { recalculateDocCompleteness } from "@/lib/case-intelligence/doc-completeness"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { canAccessCase } from "@/lib/auth/case-access"
import { z } from "zod"

const bulkDeleteSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(100),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { documentIds } = parsed.data

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, filePath: true, caseId: true, fileName: true },
    })

    // Verify user has access to all affected cases
    const caseIdsForAccess = Array.from(new Set(documents.map(d => d.caseId)))
    for (const cid of caseIdsForAccess) {
      const hasAccess = await canAccessCase((session.user as any).id, cid)
      if (!hasAccess) {
        return NextResponse.json({ error: "Access denied to one or more document cases" }, { status: 403 })
      }
    }

    // Delete from storage
    await Promise.allSettled(
      documents.map((doc) => deleteFromS3(doc.filePath).catch(() => {}))
    )

    // Delete from database
    const result = await prisma.document.deleteMany({
      where: { id: { in: documents.map((d) => d.id) } },
    })

    // Recalculate doc completeness for affected cases
    const caseIds = Array.from(new Set(documents.map(d => d.caseId)))
    for (const cid of caseIds) {
      recalculateDocCompleteness(cid).catch(() => {})
    }

    // Audit log — log per case for traceability
    for (const cid of caseIds) {
      const caseDocs = documents.filter(d => d.caseId === cid)
      logAudit({
        userId: (session.user as any).id,
        action: AUDIT_ACTIONS.DOCUMENT_DELETED,
        caseId: cid,
        metadata: { documentIds: caseDocs.map(d => d.id), fileNames: caseDocs.map(d => d.fileName), count: caseDocs.length },
        ipAddress: getClientIP(),
      })
    }

    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error("Bulk delete error:", error)
    return NextResponse.json({ error: "Failed to delete documents" }, { status: 500 })
  }
}
