import { prisma } from "@/lib/db"

export async function trackError(params: {
  route: string
  method?: string
  error: any
  userId?: string
  caseId?: string
  aiTaskId?: string
  metadata?: Record<string, any>
}) {
  try {
    await prisma.appError.create({
      data: {
        route: params.route,
        method: params.method || "POST",
        errorMessage: params.error?.message || String(params.error),
        errorStack: params.error?.stack?.substring(0, 5000) || null,
        statusCode: params.error?.status || params.error?.statusCode || null,
        userId: params.userId || null,
        caseId: params.caseId || null,
        aiTaskId: params.aiTaskId || null,
        metadata: params.metadata || undefined,
      },
    })
  } catch {
    console.error("[ErrorTracker] Failed to track error:", params.error?.message)
  }
}
