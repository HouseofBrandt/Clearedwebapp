import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import {
  classifyIncident,
  autoCreateIncident,
  calculateSLADeadline,
} from "@/lib/compliance/incident-classifier"

/**
 * GET /api/admin/incidents
 * List all incidents. ADMIN only. Filterable by status and severity.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get("status")
    const severity = url.searchParams.get("severity")
    const limit = parseInt(url.searchParams.get("limit") || "50", 10)
    const offset = parseInt(url.searchParams.get("offset") || "0", 10)

    const where: any = {}
    if (status) where.status = status
    if (severity) where.severity = severity

    const [incidents, total] = await Promise.all([
      prisma.incidentRecord.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.incidentRecord.count({ where }),
    ])

    // Enrich with SLA info
    const enriched = incidents.map((incident) => {
      const sev = incident.severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
      const slaDeadline = calculateSLADeadline(incident.detectedAt, sev)
      const now = new Date()
      const slaBreached =
        !incident.resolvedAt && now > slaDeadline
      const slaRemainingMs = incident.resolvedAt
        ? null
        : Math.max(0, slaDeadline.getTime() - now.getTime())

      return {
        ...incident,
        slaDeadline,
        slaBreached,
        slaRemainingHours: slaRemainingMs
          ? Math.round(slaRemainingMs / (1000 * 60 * 60) * 10) / 10
          : null,
      }
    })

    return NextResponse.json({
      incidents: enriched,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error("[incidents] GET error:", error)
    return NextResponse.json(
      { error: "Failed to list incidents", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/incidents
 * Create a new incident. Can be auto-classified or manually classified.
 *
 * Body:
 *   - eventType: string (for auto-classification)
 *   - title?: string (override auto-generated title)
 *   - description: string
 *   - severity?: string (override auto-classification)
 *   - classification?: string
 *   - metadata?: object
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { eventType, title, description, severity, classification, metadata } =
      body

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      )
    }

    let incidentData: any

    if (eventType) {
      // Auto-classify based on event type
      const auto = autoCreateIncident(eventType, description, metadata)
      incidentData = {
        title: title || auto.title,
        severity: severity || auto.severity,
        classification: classification || auto.classification,
        description,
        detectedBy: "system",
        status: "DETECTED",
        playbookSteps: auto.playbookSteps,
      }
    } else {
      // Manual incident creation
      if (!title || !severity) {
        return NextResponse.json(
          { error: "title and severity are required for manual incidents" },
          { status: 400 }
        )
      }
      incidentData = {
        title,
        severity,
        classification: classification || "manual",
        description,
        detectedBy: auth.userId,
        status: "DETECTED",
        playbookSteps: [],
      }
    }

    // Auto-assign based on severity
    const autoAssignment = classifyIncident(
      eventType || "MANUAL",
      metadata
    )
    let assignedToId: string | null = null

    // Find an appropriate assignee based on autoAssign target
    if (autoAssignment.autoAssign === "admin") {
      // Assign to first available admin
      const admin = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
      })
      assignedToId = admin?.id || null
    }

    const incident = await prisma.incidentRecord.create({
      data: {
        ...incidentData,
        assignedToId,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    logAudit({
      userId: auth.userId,
      action: "INCIDENT_CREATED",
      metadata: {
        incidentId: incident.id,
        severity: incident.severity,
        classification: incident.classification,
        autoClassified: !!eventType,
      },
    })

    return NextResponse.json({ incident }, { status: 201 })
  } catch (error: any) {
    console.error("[incidents] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create incident", details: error.message },
      { status: 500 }
    )
  }
}
