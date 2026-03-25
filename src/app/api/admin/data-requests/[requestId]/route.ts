import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import {
  compileAccessData,
  executeCorrection,
  executeDeletion,
} from "@/lib/compliance/data-subject-rights"

/**
 * GET /api/admin/data-requests/[requestId]
 * Get request detail with auto-compiled data package (for ACCESS requests).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { requestId } = await params

    const request = await prisma.dataSubjectRequest.findUnique({
      where: { id: requestId },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!request) {
      return NextResponse.json(
        { error: "Data subject request not found" },
        { status: 404 }
      )
    }

    // For access requests, auto-compile the data package
    let compiledData = null
    if (request.requestType === "ACCESS") {
      compiledData = await compileAccessData(request.subjectEmail)
    }

    // SLA info
    const now = new Date()
    const slaRemainingMs = request.completedAt
      ? null
      : Math.max(0, request.slaDeadline.getTime() - now.getTime())
    const slaBreached = !request.completedAt && now > request.slaDeadline

    return NextResponse.json({
      request: {
        ...request,
        slaBreached,
        slaRemainingDays: slaRemainingMs
          ? Math.round((slaRemainingMs / (1000 * 60 * 60 * 24)) * 10) / 10
          : null,
      },
      compiledData,
    })
  } catch (error: any) {
    console.error("[data-requests/[id]] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch data request", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/data-requests/[requestId]
 * Update request status, assign, or execute the request.
 *
 * Body (all optional):
 *   - status: string
 *   - assignedToId: string
 *   - notes: string
 *   - executeAction: "compile" | "correct" | "delete"
 *   - corrections: array (for correction requests)
 *   - deletionScope: string[] (for deletion requests)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { requestId } = await params
    const body = await req.json()

    const existing = await prisma.dataSubjectRequest.findUnique({
      where: { id: requestId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Data subject request not found" },
        { status: 404 }
      )
    }

    // Handle action execution
    if (body.executeAction) {
      switch (body.executeAction) {
        case "compile": {
          const data = await compileAccessData(existing.subjectEmail)
          await prisma.dataSubjectRequest.update({
            where: { id: requestId },
            data: {
              status: "IN_PROGRESS",
              responseData: data as any,
            },
          })

          logAudit({
            userId: auth.userId,
            action: "DATA_SUBJECT_ACCESS_COMPILED",
            metadata: {
              requestId,
              caseCount: data.cases.length,
              documentCount: data.documents.length,
            },
          })

          return NextResponse.json({
            success: true,
            compiledData: data,
            message: "Data compiled successfully",
          })
        }

        case "correct": {
          if (!body.corrections || !Array.isArray(body.corrections)) {
            return NextResponse.json(
              { error: "corrections array is required" },
              { status: 400 }
            )
          }

          const result = await executeCorrection(
            requestId,
            body.corrections,
            auth.userId
          )

          return NextResponse.json({
            success: true,
            ...result,
            message: `${result.correctedCount} corrections applied`,
          })
        }

        case "delete": {
          if (!body.deletionScope || !Array.isArray(body.deletionScope)) {
            return NextResponse.json(
              { error: "deletionScope array is required" },
              { status: 400 }
            )
          }

          const result = await executeDeletion(
            requestId,
            body.deletionScope,
            auth.userId
          )

          return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount,
            certificate: result.certificate,
            message: `${result.deletedCount} records deleted`,
          })
        }

        default:
          return NextResponse.json(
            {
              error: `Unknown action: ${body.executeAction}. Valid: compile, correct, delete`,
            },
            { status: 400 }
          )
      }
    }

    // Simple field updates
    const updateData: any = {}
    if (body.status) {
      updateData.status = body.status
      if (body.status === "COMPLETED") {
        updateData.completedAt = new Date()
        updateData.completedById = auth.userId
      }
    }
    if (body.assignedToId !== undefined) {
      updateData.assignedToId = body.assignedToId
    }
    if (body.notes) {
      updateData.notes = body.notes
    }

    const updated = await prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    logAudit({
      userId: auth.userId,
      action: "DATA_SUBJECT_REQUEST_UPDATED",
      metadata: {
        requestId,
        changes: Object.keys(updateData),
      },
    })

    return NextResponse.json({ request: updated })
  } catch (error: any) {
    console.error("[data-requests/[id]] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update data request", details: error.message },
      { status: 500 }
    )
  }
}
