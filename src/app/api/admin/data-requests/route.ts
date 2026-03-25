import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

/**
 * GET /api/admin/data-requests
 * List all data subject requests. ADMIN only.
 * Filterable by status and requestType.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get("status")
    const requestType = url.searchParams.get("requestType")
    const limit = parseInt(url.searchParams.get("limit") || "50", 10)
    const offset = parseInt(url.searchParams.get("offset") || "0", 10)

    const where: any = {}
    if (status) where.status = status
    if (requestType) where.requestType = requestType

    const [requests, total] = await Promise.all([
      prisma.dataSubjectRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.dataSubjectRequest.count({ where }),
    ])

    // Enrich with SLA status
    const now = new Date()
    const enriched = requests.map((r) => {
      const slaRemainingMs = r.completedAt
        ? null
        : Math.max(0, r.slaDeadline.getTime() - now.getTime())
      const slaBreached = !r.completedAt && now > r.slaDeadline

      return {
        ...r,
        slaBreached,
        slaRemainingDays: slaRemainingMs
          ? Math.round((slaRemainingMs / (1000 * 60 * 60 * 24)) * 10) / 10
          : null,
      }
    })

    return NextResponse.json({
      requests: enriched,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("[data-requests] GET error:", error)
    return NextResponse.json(
      { error: "Failed to list data requests", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/data-requests
 * Create a new data subject request.
 *
 * Body:
 *   - requestType: "ACCESS" | "CORRECTION" | "DELETION"
 *   - subjectName: string
 *   - subjectEmail: string
 *   - description: string
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { requestType, subjectName, subjectEmail, description } = body

    if (!requestType || !subjectName || !subjectEmail || !description) {
      return NextResponse.json(
        {
          error:
            "requestType, subjectName, subjectEmail, and description are required",
        },
        { status: 400 }
      )
    }

    const validTypes = ["ACCESS", "CORRECTION", "DELETION"]
    if (!validTypes.includes(requestType)) {
      return NextResponse.json(
        { error: `requestType must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      )
    }

    // SLA: 30 days from receipt
    const slaDeadline = new Date()
    slaDeadline.setDate(slaDeadline.getDate() + 30)

    const request = await prisma.dataSubjectRequest.create({
      data: {
        requestType,
        subjectName,
        subjectEmail,
        description,
        status: "RECEIVED",
        slaDeadline,
      },
    })

    logAudit({
      userId: auth.userId,
      action: "DATA_SUBJECT_REQUEST_CREATED",
      metadata: {
        requestId: request.id,
        requestType,
        subjectEmail: "[REDACTED]",
      },
    })

    return NextResponse.json({ request }, { status: 201 })
  } catch (error: any) {
    console.error("[data-requests] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create data request", details: error.message },
      { status: 500 }
    )
  }
}
