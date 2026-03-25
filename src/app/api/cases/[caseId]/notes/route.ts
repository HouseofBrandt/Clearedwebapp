import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { canAccessCase } from "@/lib/auth/case-access"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"
import { createFeedEvent } from "@/lib/feed/create-event"

// ─── Zod schemas ───────────────────────────────────────────

const createNoteSchema = z.object({
  content: z.string().min(1, "Content is required"),
  title: z.string().optional(),
  noteType: z.enum([
    "JOURNAL_ENTRY", "CALL_LOG", "IRS_CONTACT",
    "STRATEGY_NOTE", "CLIENT_INTERACTION", "RESEARCH", "GENERAL",
  ]).default("GENERAL"),
  visibility: z.enum([
    "ALL_PRACTITIONERS", "CASE_TEAM_ONLY", "PRIVATE",
  ]).default("ALL_PRACTITIONERS"),
  taxYears: z.array(z.number().int().min(1900).max(2100)).optional(),
  relatedFeature: z.enum([
    "TRANSCRIPT_DECODER", "CASE_INTELLIGENCE", "PENALTY_ABATEMENT",
    "OIC", "COMPLIANCE", "DEADLINE_TRACKER", "GENERAL",
  ]).optional().nullable(),
  pinned: z.boolean().optional(),
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

// ─── GET: List notes for a case ────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const noteType = url.searchParams.get("noteType")
  const authorId = url.searchParams.get("authorId")
  const taxYear = url.searchParams.get("taxYear")
  const relatedFeature = url.searchParams.get("relatedFeature")
  const search = url.searchParams.get("search")
  const pinned = url.searchParams.get("pinned")
  const sort = url.searchParams.get("sort") || "newest"
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100)
  const offset = parseInt(url.searchParams.get("offset") || "0", 10)

  // Build where clause
  const where: any = {
    caseId: params.caseId,
    isDeleted: false,
  }

  // Visibility filtering
  // Exclude PRIVATE notes unless the user is the author or an ADMIN
  if (auth.role !== "ADMIN") {
    where.OR = [
      { visibility: "ALL_PRACTITIONERS" },
      { visibility: "CASE_TEAM_ONLY" },
      { visibility: "PRIVATE", authorId: auth.userId },
    ]
  }

  if (noteType) where.noteType = noteType
  if (authorId) where.authorId = authorId
  if (taxYear) where.taxYears = { has: parseInt(taxYear, 10) }
  if (relatedFeature) where.relatedFeature = relatedFeature
  if (pinned === "true") where.pinned = true
  if (search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { content: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
        ],
      },
    ]
  }

  // For CASE_TEAM_ONLY: check if user is assigned practitioner
  // (ADMIN/SENIOR already pass canAccessCase, PRACTITIONER is assigned)
  // The canAccessCase check above ensures the user has access to the case,
  // so CASE_TEAM_ONLY is appropriate for assigned practitioners and ADMIN/SENIOR.

  const [notes, total] = await Promise.all([
    prisma.clientNote.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
      orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.clientNote.count({ where }),
  ])

  return NextResponse.json({
    notes,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  })
}

// ─── POST: Create a note ───────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const hasAccess = await canAccessCase(auth.userId, params.caseId)
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createNoteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data

  try {
    const note = await prisma.clientNote.create({
      data: {
        caseId: params.caseId,
        authorId: auth.userId,
        noteType: data.noteType,
        title: data.title || null,
        content: data.content,
        taxYears: data.taxYears || [],
        relatedFeature: data.relatedFeature || null,
        pinned: data.pinned || false,
        visibility: data.visibility,
        isPrivileged: data.isPrivileged || false,
        callDate: data.callDate ? new Date(data.callDate) : null,
        callDuration: data.callDuration ?? null,
        callParticipants: data.callParticipants || null,
        callType: data.callType || null,
        callDisposition: data.callDisposition || null,
        irsEmployeeName: data.irsEmployeeName || null,
        irsEmployeeId: data.irsEmployeeId || null,
        irsDepartment: data.irsDepartment || null,
        irsContactMethod: data.irsContactMethod || null,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
    })

    // Audit log
    logAudit({
      userId: auth.userId,
      action: AUDIT_ACTIONS.NOTE_CREATED,
      caseId: params.caseId,
      resourceId: note.id,
      resourceType: "ClientNote",
      metadata: { noteType: data.noteType, noteId: note.id },
      ipAddress: getClientIP(),
    })

    // Feed event
    const snippet = data.content.length > 100
      ? data.content.slice(0, 100) + "..."
      : data.content
    createFeedEvent({
      eventType: "note_created",
      caseId: params.caseId,
      content: `${auth.name} added a ${data.noteType.toLowerCase().replace(/_/g, " ")} note: ${snippet}`,
      sourceType: "note",
      sourceId: note.id,
      eventData: { noteId: note.id, noteType: data.noteType, authorName: auth.name },
    })

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    console.error("Create note error:", error)
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 })
  }
}
