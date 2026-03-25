import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

/**
 * GET /api/admin/governance
 *
 * List all governance meetings, ordered by date descending.
 * Admin-only endpoint.
 */
export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const meetings = await prisma.governanceMeeting.findMany({
      orderBy: { meetingDate: "desc" },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    // Resolve attendee names
    const allUserIds = Array.from(new Set(meetings.flatMap((m) => m.attendeeIds)))
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, name: true, email: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const enriched = meetings.map((m) => ({
      ...m,
      attendees: m.attendeeIds
        .map((id) => userMap.get(id))
        .filter(Boolean),
    }))

    return NextResponse.json({ meetings: enriched })
  } catch (error: any) {
    console.error("[governance] Error listing meetings:", error)
    return NextResponse.json(
      { error: "Failed to list governance meetings", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/governance
 *
 * Create a new governance meeting record.
 * Admin-only endpoint.
 *
 * Body: {
 *   meetingDate: string (ISO date),
 *   attendeeIds: string[],
 *   agenda: string,
 *   decisions: string,
 *   actionItems: { description: string, assigneeId: string, dueDate: string, status?: string }[],
 *   quarter: string (e.g. "2026-Q1")
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const { meetingDate, attendeeIds, agenda, decisions, actionItems, quarter } = body

    // Validate required fields
    if (!meetingDate || !attendeeIds || !agenda || !decisions || !quarter) {
      return NextResponse.json(
        { error: "Missing required fields: meetingDate, attendeeIds, agenda, decisions, quarter" },
        { status: 400 }
      )
    }

    if (!Array.isArray(attendeeIds) || attendeeIds.length === 0) {
      return NextResponse.json(
        { error: "attendeeIds must be a non-empty array of user IDs" },
        { status: 400 }
      )
    }

    if (!Array.isArray(actionItems)) {
      return NextResponse.json(
        { error: "actionItems must be an array" },
        { status: 400 }
      )
    }

    // Validate attendee IDs exist
    const validUsers = await prisma.user.findMany({
      where: { id: { in: attendeeIds } },
      select: { id: true },
    })
    const validIds = new Set(validUsers.map((u) => u.id))
    const invalidIds = attendeeIds.filter((id: string) => !validIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid attendee IDs: ${invalidIds.join(", ")}` },
        { status: 400 }
      )
    }

    // Normalize action items
    const normalizedItems = actionItems.map((item: any) => ({
      description: item.description || "",
      assigneeId: item.assigneeId || "",
      dueDate: item.dueDate || "",
      status: item.status || "OPEN",
    }))

    const meeting = await prisma.governanceMeeting.create({
      data: {
        meetingDate: new Date(meetingDate),
        attendeeIds,
        agenda,
        decisions,
        actionItems: normalizedItems,
        quarter,
        createdById: auth.userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    logAudit({
      userId: auth.userId,
      action: "GOVERNANCE_MEETING_CREATED",
      metadata: {
        meetingId: meeting.id,
        meetingDate,
        quarter,
        attendeeCount: attendeeIds.length,
        actionItemCount: normalizedItems.length,
      },
    })

    return NextResponse.json({ meeting }, { status: 201 })
  } catch (error: any) {
    console.error("[governance] Error creating meeting:", error)
    return NextResponse.json(
      { error: "Failed to create governance meeting", details: error.message },
      { status: 500 }
    )
  }
}
