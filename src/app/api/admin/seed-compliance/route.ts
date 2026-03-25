import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { seedComplianceControls } from "@/lib/compliance/seed-controls"
import { logAudit } from "@/lib/ai/audit"

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const result = await seedComplianceControls()

    logAudit({
      userId: auth.userId,
      action: "SEED_COMPLIANCE_CONTROLS",
      metadata: {
        totalControls: result.total,
        details: result.results,
      },
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error("[seed-compliance] Error:", error)
    return NextResponse.json(
      { error: "Failed to seed compliance controls", details: error.message },
      { status: 500 }
    )
  }
}
