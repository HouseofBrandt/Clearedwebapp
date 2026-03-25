import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { calculateSLADeadline } from "@/lib/compliance/incident-classifier"
import {
  getNotificationRequirements,
  generateNotificationDraft,
  getEarliestDeadline,
} from "@/lib/compliance/breach-notification"

/**
 * GET /api/admin/incidents/[incidentId]
 * Get incident detail with playbook steps and SLA info.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> }
) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { incidentId } = await params

    const incident = await prisma.incidentRecord.findUnique({
      where: { id: incidentId },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!incident) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      )
    }

    // Compute SLA information
    const sev = incident.severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    const slaDeadline = calculateSLADeadline(incident.detectedAt, sev)
    const now = new Date()
    const slaBreached = !incident.resolvedAt && now > slaDeadline
    const slaRemainingMs = incident.resolvedAt
      ? null
      : Math.max(0, slaDeadline.getTime() - now.getTime())

    // If breach-related, compute notification requirements
    let notificationInfo = null
    if (
      incident.affectedStates &&
      incident.affectedStates.length > 0
    ) {
      const requirements = getNotificationRequirements(
        incident.affectedStates
      )
      const earliest = getEarliestDeadline(
        incident.affectedStates,
        incident.detectedAt
      )
      notificationInfo = {
        requirements,
        earliestDeadline: earliest,
      }
    }

    return NextResponse.json({
      incident: {
        ...incident,
        slaDeadline,
        slaBreached,
        slaRemainingHours: slaRemainingMs
          ? Math.round((slaRemainingMs / (1000 * 60 * 60)) * 10) / 10
          : null,
      },
      notificationInfo,
    })
  } catch (error: any) {
    console.error("[incidents/[id]] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch incident", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/incidents/[incidentId]
 * Update incident: change status, add post-mortem, assign, resolve,
 * update playbook steps, add affected states.
 *
 * Body (all optional):
 *   - status: string
 *   - assignedToId: string
 *   - postMortemNotes: string
 *   - rootCause: string
 *   - affectedClients: number
 *   - affectedStates: string[]
 *   - playbookSteps: array (full replacement)
 *   - playbookStepUpdate: { stepIndex: number, status: string } (single step update)
 *   - generateNotification: { stateCode: string, affectedCount: number } (generate draft)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> }
) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { incidentId } = await params
    const body = await req.json()

    const existing = await prisma.incidentRecord.findUnique({
      where: { id: incidentId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Incident not found" },
        { status: 404 }
      )
    }

    const updateData: any = {}

    // Status change
    if (body.status) {
      updateData.status = body.status
      if (body.status === "RESOLVED") {
        updateData.resolvedAt = new Date()
        updateData.resolvedById = auth.userId
      }
    }

    // Assignment
    if (body.assignedToId !== undefined) {
      updateData.assignedToId = body.assignedToId
    }

    // Post-mortem
    if (body.postMortemNotes) {
      updateData.postMortemNotes = body.postMortemNotes
    }
    if (body.rootCause) {
      updateData.rootCause = body.rootCause
    }

    // Affected scope
    if (body.affectedClients !== undefined) {
      updateData.affectedClients = body.affectedClients
    }
    if (body.affectedStates) {
      updateData.affectedStates = body.affectedStates
    }

    // Full playbook replacement
    if (body.playbookSteps) {
      updateData.playbookSteps = body.playbookSteps
    }

    // Single playbook step update
    if (body.playbookStepUpdate) {
      const { stepIndex, status } = body.playbookStepUpdate
      const currentSteps = (existing.playbookSteps as any[]) || []

      if (stepIndex >= 0 && stepIndex < currentSteps.length) {
        currentSteps[stepIndex] = {
          ...currentSteps[stepIndex],
          status,
          completedAt:
            status === "completed" ? new Date().toISOString() : null,
          completedBy:
            status === "completed" ? auth.userId : null,
        }
        updateData.playbookSteps = currentSteps
      }
    }

    const updated = await prisma.incidentRecord.update({
      where: { id: incidentId },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    logAudit({
      userId: auth.userId,
      action: "INCIDENT_UPDATED",
      metadata: {
        incidentId,
        changes: Object.keys(updateData),
        newStatus: body.status || undefined,
      },
    })

    // Generate notification draft if requested
    let notificationDraft = null
    if (body.generateNotification) {
      const { stateCode, affectedCount } = body.generateNotification
      const dataTypes = (body.affectedDataTypes as string[]) || [
        "Social Security Numbers",
        "Tax Return Information",
        "Financial Account Information",
      ]
      notificationDraft = generateNotificationDraft(
        {
          description: existing.description,
          dataTypes,
          detectedAt: existing.detectedAt,
          playbookSteps: (existing.playbookSteps as any[])?.map(
            (s: any) => ({
              description: s.description,
              status: s.status,
            })
          ),
        },
        stateCode,
        affectedCount
      )
    }

    return NextResponse.json({
      incident: updated,
      notificationDraft,
    })
  } catch (error: any) {
    console.error("[incidents/[id]] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update incident", details: error.message },
      { status: 500 }
    )
  }
}
