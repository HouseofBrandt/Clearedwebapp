import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { logAudit } from "@/lib/ai/audit"
import {
  runComplianceAutomation,
  seedHealthChecks,
  getAutomationStatus,
} from "@/lib/compliance/automation-engine"

/**
 * GET /api/admin/compliance-automation
 *
 * Returns the current automation status for the dashboard.
 * Admin-only endpoint.
 */
export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const status = await getAutomationStatus()
    return NextResponse.json(status)
  } catch (error: any) {
    console.error("[compliance-automation] Error fetching status:", error)
    return NextResponse.json(
      { error: "Failed to fetch automation status", details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/compliance-automation
 *
 * Trigger a manual compliance automation run or seed health checks.
 * Admin-only endpoint.
 *
 * Body: { action: "run" | "seed" }
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const { action } = body

    if (action === "seed") {
      const seeded = await seedHealthChecks()

      await logAudit({
        userId: auth.userId,
        action: "COMPLIANCE_HEALTH_CHECKS_SEEDED",
        metadata: { seededCount: seeded },
      })

      return NextResponse.json({
        success: true,
        action: "seed",
        seededCount: seeded,
      })
    }

    if (action === "run") {
      const results = await runComplianceAutomation()

      await logAudit({
        userId: auth.userId,
        action: "COMPLIANCE_AUTOMATION_MANUAL_RUN",
        metadata: {
          ...results,
          triggeredBy: auth.email,
        },
      })

      return NextResponse.json({
        success: true,
        action: "run",
        ...results,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be "run" or "seed".' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("[compliance-automation] Error:", error)
    return NextResponse.json(
      { error: "Compliance automation action failed", details: error.message },
      { status: 500 }
    )
  }
}
