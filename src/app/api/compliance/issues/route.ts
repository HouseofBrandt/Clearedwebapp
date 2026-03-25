import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(req.url)
  const severity = searchParams.get("severity")
  const status = searchParams.get("status")

  const where: any = {}
  if (severity) where.severity = severity
  if (status) where.status = status

  const issues = await prisma.complianceIssue.findMany({
    where,
    include: {
      control: {
        select: {
          controlId: true,
          description: true,
          tsc: true,
        },
      },
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json(issues)
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { controlId, severity, description, remediationPlan, slaDeadline } = body

    if (!controlId || !severity || !description) {
      return NextResponse.json(
        { error: "controlId, severity, and description are required" },
        { status: 400 }
      )
    }

    const validSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
        { status: 400 }
      )
    }

    // Find the control by controlId (the string like "CC1.1")
    const control = await prisma.complianceControl.findUnique({
      where: { controlId },
    })

    if (!control) {
      return NextResponse.json({ error: "Control not found" }, { status: 404 })
    }

    const issue = await prisma.complianceIssue.create({
      data: {
        controlId: control.id,
        severity,
        description,
        remediationPlan: remediationPlan || null,
        slaDeadline: slaDeadline ? new Date(slaDeadline) : null,
        ownerId: auth.userId,
      },
      include: {
        control: {
          select: {
            controlId: true,
            description: true,
            tsc: true,
          },
        },
      },
    })

    logAudit({
      userId: auth.userId,
      action: "COMPLIANCE_ISSUE_CREATED",
      metadata: {
        issueId: issue.id,
        controlId,
        severity,
        description,
      },
    })

    return NextResponse.json(issue, { status: 201 })
  } catch (error: any) {
    console.error("[compliance/issues POST] Error:", error)
    return NextResponse.json(
      { error: "Failed to create issue", details: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { issueId, status, remediationPlan } = body

    if (!issueId || !status) {
      return NextResponse.json(
        { error: "issueId and status are required" },
        { status: 400 }
      )
    }

    const validStatuses = ["OPEN", "IN_PROGRESS", "IMPLEMENTED", "VERIFIED", "CLOSED", "ACCEPTED_RISK"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate status flow
    const validFlows: Record<string, string[]> = {
      OPEN: ["IN_PROGRESS", "ACCEPTED_RISK"],
      IN_PROGRESS: ["IMPLEMENTED", "OPEN"],
      IMPLEMENTED: ["VERIFIED", "IN_PROGRESS"],
      VERIFIED: ["CLOSED", "IN_PROGRESS"],
      CLOSED: ["OPEN"],
      ACCEPTED_RISK: ["OPEN"],
    }

    const issue = await prisma.complianceIssue.findUnique({
      where: { id: issueId },
    })

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 })
    }

    const allowedTransitions = validFlows[issue.status] || []
    if (!allowedTransitions.includes(status)) {
      return NextResponse.json(
        {
          error: `Invalid status transition from ${issue.status} to ${status}. Allowed: ${allowedTransitions.join(", ")}`,
        },
        { status: 400 }
      )
    }

    const updateData: any = { status }
    if (remediationPlan !== undefined) {
      updateData.remediationPlan = remediationPlan
    }
    if (status === "CLOSED" || status === "VERIFIED") {
      updateData.resolvedAt = new Date()
    }

    const updated = await prisma.complianceIssue.update({
      where: { id: issueId },
      data: updateData,
      include: {
        control: {
          select: {
            controlId: true,
            description: true,
            tsc: true,
          },
        },
      },
    })

    logAudit({
      userId: auth.userId,
      action: "COMPLIANCE_ISSUE_STATUS_UPDATE",
      metadata: {
        issueId,
        previousStatus: issue.status,
        newStatus: status,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[compliance/issues PATCH] Error:", error)
    return NextResponse.json(
      { error: "Failed to update issue", details: error.message },
      { status: 500 }
    )
  }
}
