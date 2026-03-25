import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(req.url)
  const controlId = searchParams.get("controlId")

  if (!controlId) {
    return NextResponse.json(
      { error: "controlId query parameter is required" },
      { status: 400 }
    )
  }

  // Look up by the string controlId (e.g. "CC1.1")
  const control = await prisma.complianceControl.findUnique({
    where: { controlId },
  })

  if (!control) {
    return NextResponse.json({ error: "Control not found" }, { status: 404 })
  }

  const evidence = await prisma.evidenceItem.findMany({
    where: { controlId: control.id },
    orderBy: { collectedAt: "desc" },
  })

  return NextResponse.json(evidence)
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { controlId, evidenceType, contentOrPath, validUntil } = body

    if (!controlId || !evidenceType || !contentOrPath) {
      return NextResponse.json(
        { error: "controlId, evidenceType, and contentOrPath are required" },
        { status: 400 }
      )
    }

    const validTypes = ["AUTOMATED_LOG", "CONFIG_SNAPSHOT", "POLICY_DOCUMENT", "MANUAL_UPLOAD", "TEST_RESULT"]
    if (!validTypes.includes(evidenceType)) {
      return NextResponse.json(
        { error: `Invalid evidenceType. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      )
    }

    const control = await prisma.complianceControl.findUnique({
      where: { controlId },
    })

    if (!control) {
      return NextResponse.json({ error: "Control not found" }, { status: 404 })
    }

    const evidence = await prisma.evidenceItem.create({
      data: {
        controlId: control.id,
        evidenceType,
        contentOrPath,
        collector: auth.userId,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    })

    // Update last evidence collected on the control
    await prisma.complianceControl.update({
      where: { id: control.id },
      data: { lastEvidenceCollected: new Date() },
    })

    logAudit({
      userId: auth.userId,
      action: "COMPLIANCE_EVIDENCE_UPLOADED",
      metadata: {
        evidenceId: evidence.id,
        controlId,
        evidenceType,
      },
    })

    return NextResponse.json(evidence, { status: 201 })
  } catch (error: any) {
    console.error("[compliance/evidence POST] Error:", error)
    return NextResponse.json(
      { error: "Failed to upload evidence", details: error.message },
      { status: 500 }
    )
  }
}
