import { NextRequest, NextResponse } from "next/server"
import { runComplianceAutomation } from "@/lib/compliance/automation-engine"
import { createAuditLog } from "@/lib/ai/audit"

/**
 * GET /api/cron/compliance-automation
 *
 * Runs all automated SOC 2 compliance checks, collects evidence,
 * updates control statuses, and creates issues for failures.
 *
 * Protected by CRON_SECRET bearer token.
 * Intended to be called by Vercel Cron or external scheduler.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    )
  }

  try {
    const results = await runComplianceAutomation()

    await createAuditLog({
      action: "COMPLIANCE_AUTOMATION_RUN",
      metadata: {
        ...results,
        triggeredBy: "cron",
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[compliance-automation] Cron error:", error)
    return NextResponse.json(
      { error: "Compliance automation failed", details: error.message },
      { status: 500 }
    )
  }
}
