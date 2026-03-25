import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"

// ─── POST: Toggle pin on a note ────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string; noteId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const note = await prisma.clientNote.findFirst({
    where: { id: params.noteId, caseId: params.caseId, isDeleted: false },
  })

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 })
  }

  try {
    const newPinned = !note.pinned

    const updated = await prisma.clientNote.update({
      where: { id: params.noteId },
      data: { pinned: newPinned },
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
    })

    logAudit({
      userId: auth.userId,
      action: newPinned ? AUDIT_ACTIONS.NOTE_PINNED : AUDIT_ACTIONS.NOTE_UNPINNED,
      caseId: params.caseId,
      resourceId: params.noteId,
      resourceType: "ClientNote",
      metadata: { noteId: params.noteId, pinned: newPinned },
      ipAddress: getClientIP(),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Toggle pin error:", error)
    return NextResponse.json({ error: "Failed to toggle pin" }, { status: 500 })
  }
}
