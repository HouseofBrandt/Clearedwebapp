import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
