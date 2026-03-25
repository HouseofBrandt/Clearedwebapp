import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(req.url)
  const tscFilter = searchParams.get("tsc")

  const where: any = {}
  if (tscFilter) {
    where.tsc = tscFilter
  }

  const controls = await prisma.complianceControl.findMany({
    where,
    include: {
      healthChecks: {
        include: {
          results: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
      },
      issues: {
        where: {
          status: { notIn: ["CLOSED", "ACCEPTED_RISK"] },
        },
      },
      evidence: {
        orderBy: { collectedAt: "desc" },
        take: 3,
      },
    },
    orderBy: { controlId: "asc" },
  })

  const result = controls.map((control) => ({
    ...control,
    openIssueCount: control.issues.length,
    latestHealthResult: control.healthChecks[0]?.results[0] ?? null,
    evidenceCount: control.evidence.length,
  }))

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { controlId, status } = body

    if (!controlId || !status) {
      return NextResponse.json(
        { error: "controlId and status are required" },
        { status: 400 }
      )
    }

    const validStatuses = ["COMPLIANT", "PARTIALLY_COMPLIANT", "NON_COMPLIANT", "NOT_ASSESSED"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    const control = await prisma.complianceControl.findUnique({
      where: { controlId },
    })

    if (!control) {
      return NextResponse.json({ error: "Control not found" }, { status: 404 })
    }

    const updated = await prisma.complianceControl.update({
      where: { controlId },
      data: { status },
    })

    logAudit({
      userId: auth.userId,
      action: "COMPLIANCE_CONTROL_STATUS_UPDATE",
      metadata: {
        controlId,
        previousStatus: control.status,
        newStatus: status,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[compliance/controls PATCH] Error:", error)
    return NextResponse.json(
      { error: "Failed to update control status", details: error.message },
      { status: 500 }
    )
  }
}
