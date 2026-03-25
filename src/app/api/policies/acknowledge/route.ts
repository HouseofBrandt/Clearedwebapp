import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * GET /api/policies/acknowledge
 * Check if the current user has unacknowledged policies.
 * Returns a list of policies needing acknowledgment.
 */
export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    // Get all active policies
    const activePolicies = await prisma.compliancePolicy.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    })

    // Get all acknowledgments for this user
    const acknowledgments = await prisma.policyAcknowledgment.findMany({
      where: { userId: auth.userId },
    })

    // Build a map of policyId+version -> acknowledged
    const ackMap = new Set(
      acknowledgments.map((a) => `${a.policyId}:${a.version}`)
    )

    // Filter to policies the user hasn't acknowledged at the current version
    const unacknowledged = activePolicies.filter(
      (p) => !ackMap.has(`${p.id}:${p.version}`)
    )

    return NextResponse.json({
      allAcknowledged: unacknowledged.length === 0,
      unacknowledgedPolicies: unacknowledged.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        content: p.content,
        version: p.version,
        effectiveDate: p.effectiveDate,
      })),
    })
  } catch (e: any) {
    console.error("[GET /api/policies/acknowledge]", e.message)
    return NextResponse.json(
      { error: "Failed to check policy acknowledgments" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/policies/acknowledge
 * Acknowledge a policy.
 * Body: { policyId, version }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await req.json()
    const { policyId, version } = body

    if (!policyId || version === undefined) {
      return NextResponse.json(
        { error: "policyId and version are required" },
        { status: 400 }
      )
    }

    // Verify the policy exists and is active
    const policy = await prisma.compliancePolicy.findUnique({
      where: { id: policyId },
    })

    if (!policy || !policy.isActive) {
      return NextResponse.json(
        { error: "Policy not found or inactive" },
        { status: 404 }
      )
    }

    if (policy.version !== version) {
      return NextResponse.json(
        { error: "Policy version mismatch. Please refresh and try again." },
        { status: 409 }
      )
    }

    // Get IP address from request headers
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null

    // Create acknowledgment (upsert to handle re-acknowledgment)
    const acknowledgment = await prisma.policyAcknowledgment.upsert({
      where: {
        policyId_userId_version: {
          policyId,
          userId: auth.userId,
          version,
        },
      },
      update: {
        acknowledgedAt: new Date(),
        ipAddress,
      },
      create: {
        policyId,
        userId: auth.userId,
        version,
        ipAddress,
      },
    })

    return NextResponse.json({ acknowledgment })
  } catch (e: any) {
    console.error("[POST /api/policies/acknowledge]", e.message)
    return NextResponse.json(
      { error: "Failed to acknowledge policy" },
      { status: 500 }
    )
  }
}
