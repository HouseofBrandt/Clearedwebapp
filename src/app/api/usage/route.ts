import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) {
    return auth.response
  }

  // Get usage stats for the current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "AI_REQUEST",
      timestamp: { gte: startOfMonth },
    },
    select: { metadata: true },
  })

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalRequests = logs.length

  for (const log of logs) {
    const meta = log.metadata as any
    if (meta) {
      totalInputTokens += meta.inputTokens || 0
      totalOutputTokens += meta.outputTokens || 0
    }
  }

  return NextResponse.json({
    month: startOfMonth.toISOString(),
    totalRequests,
    totalInputTokens,
    totalOutputTokens,
  })
}
