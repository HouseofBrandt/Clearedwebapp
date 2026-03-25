import { NextRequest, NextResponse } from "next/server"
import { enforceRetentionPolicies } from "@/lib/data-retention"
import { createAuditLog } from "@/lib/ai/audit"

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
    const result = await enforceRetentionPolicies()

    await createAuditLog({
      action: "DATA_RETENTION_RUN",
      metadata: result,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("[DataRetention] Failed:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
