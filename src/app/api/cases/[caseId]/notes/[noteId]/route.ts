import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"

// ─── Zod schema ────────────────────────────────────────────

const updateNoteSchema = z.object({
  content: z.string().min(1).optional(),
  title: z.string().optional().nullable(),
  noteType: z.enum([
    "JOURNAL_ENTRY", "CALL_LOG", "IRS_CONTACT",
    "STRATEGY_NOTE", "CLIENT_INTERACTION", "RESEARCH", "GENERAL",
  ]).optional(),
  visibility: z.enum([
    "ALL_PRACTITIONERS", "CASE_TEAM_ONLY", "PRIVATE",
  ]).optional(),
  taxYears: z.array(z.number().int().min(1900).max(2100)).optional(),
  relatedFeature: z.enum([
    "TRANSCRIPT_DECODER", "CASE_INTELLIGENCE", "PENALTY_ABATEMENT",
    "OIC", "COMPLIANCE", "DEADLINE_TRACKER", "GENERAL",
  ]).optional().nullable(),
  isPrivileged: z.boolean().optional(),
  // Call log fields
  callDate: z.string().datetime().optional().nullable(),
  callDuration: z.number().int().min(0).optional().nullable(),
  callParticipants: z.string().optional().nullable(),
  callType: z.string().optional().nullable(),
  callDisposition: z.string().optional().nullable(),
  // IRS contact fields
  irsEmployeeName: z.string().optional().nullable(),
  irsEmployeeId: z.string().optional().nullable(),
  irsDepartment: z.string().optional().nullable(),
  irsContactMethod: z.string().optional().nullable(),
})

// ─── Helper: load note with access check ───────────────────

async function loadNoteWithAccess(
  userId: string,
  role: string,
  caseId: string,
  noteId: string
) {
  const hasAccess = await canAccessCase(userId, caseId)
  if (!hasAccess) return { error: "Forbidden", status: 403 }

  const note = await prisma.clientNote.findFirst({
    where: { id: noteId, caseId, isDeleted: false },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
  })

  if (!note) return { error: "Note not found", status: 404 }

  // Visibility check
  if (note.visibility === "PRIVATE" && note.authorId !== userId && role !== "ADMIN") {
    return { error: "Forbidden", status: 403 }
  }

  return { note }
}

// ─── GET: Single note ──────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string; noteId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const result = await loadNoteWithAccess(auth.userId, auth.role, params.caseId, params.noteId)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.note)
}

// ─── PATCH: Edit note (author only or ADMIN) ───────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string; noteId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const result = await loadNoteWithAccess(auth.userId, auth.role, params.caseId, params.noteId)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { note } = result

  // Only author or ADMIN can edit
  if (note.authorId !== auth.userId && auth.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the author or an admin can edit this note" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = updateNoteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data
  const updateData: any = {}

  if (data.content !== undefined) updateData.content = data.content
  if (data.title !== undefined) updateData.title = data.title
  if (data.noteType !== undefined) updateData.noteType = data.noteType
  if (data.visibility !== undefined) updateData.visibility = data.visibility
  if (data.taxYears !== undefined) updateData.taxYears = data.taxYears
  if (data.relatedFeature !== undefined) updateData.relatedFeature = data.relatedFeature
  if (data.isPrivileged !== undefined) updateData.isPrivileged = data.isPrivileged
  if (data.callDate !== undefined) updateData.callDate = data.callDate ? new Date(data.callDate) : null
  if (data.callDuration !== undefined) updateData.callDuration = data.callDuration
  if (data.callParticipants !== undefined) updateData.callParticipants = data.callParticipants
  if (data.callType !== undefined) updateData.callType = data.callType
  if (data.callDisposition !== undefined) updateData.callDisposition = data.callDisposition
  if (data.irsEmployeeName !== undefined) updateData.irsEmployeeName = data.irsEmployeeName
  if (data.irsEmployeeId !== undefined) updateData.irsEmployeeId = data.irsEmployeeId
  if (data.irsDepartment !== undefined) updateData.irsDepartment = data.irsDepartment
  if (data.irsContactMethod !== undefined) updateData.irsContactMethod = data.irsContactMethod

  try {
    const updated = await prisma.clientNote.update({
      where: { id: params.noteId },
      data: updateData,
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
    })

    // Audit with before/after for content changes
    const metadata: Record<string, any> = {
      noteId: params.noteId,
      fieldsChanged: Object.keys(updateData),
    }
    if (data.content !== undefined) {
      metadata.contentBefore = note.content.slice(0, 200)
      metadata.contentAfter = data.content.slice(0, 200)
    }

    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.NOTE_EDITED,
      caseId: params.caseId,
      resourceId: params.noteId,
      resourceType: "ClientNote",
      metadata,
      ipAddress: getClientIP(),
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Update note error:", error)
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 })
  }
}

// ─── DELETE: Soft delete ───────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { caseId: string; noteId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const result = await loadNoteWithAccess(auth.userId, auth.role, params.caseId, params.noteId)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { note } = result

  // Only author or ADMIN can delete
  if (note.authorId !== auth.userId && auth.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the author or an admin can delete this note" }, { status: 403 })
  }

  try {
    await prisma.clientNote.update({
      where: { id: params.noteId },
      data: { isDeleted: true },
    })

    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.NOTE_DELETED,
      caseId: params.caseId,
      resourceId: params.noteId,
      resourceType: "ClientNote",
      metadata: { noteId: params.noteId, noteType: note.noteType },
      ipAddress: getClientIP(),
    })

    return NextResponse.json({ message: "Note deleted" })
  } catch (error) {
    console.error("Delete note error:", error)
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 })
  }
}
