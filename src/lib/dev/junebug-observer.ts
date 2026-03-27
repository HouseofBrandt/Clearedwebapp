/**
 * Junebug Auto-Observation Logger
 *
 * Fire-and-forget observer that detects issues from Junebug chat interactions
 * and logs them as JunebugObservation records for the feedback pipeline.
 *
 * Detection categories:
 * - CONTEXT_FAILURE: Case context failed to load
 * - ERROR_PATTERN: Browser console errors or network failures detected
 * - MISSING_FEATURE: Junebug indicated a feature is unavailable
 * - UX_FRICTION: User expressed frustration or confusion
 * - QUALITY_GAP: Junebug couldn't provide specific data
 */

import { prisma } from "@/lib/db"

interface ObservationInput {
  userMessage: string
  assistantResponse: string
  caseId?: string
  userId?: string
  route?: string
  contextAvailable?: boolean
  contextFailureReason?: string
  pageContext?: {
    errors?: { type: string; message: string; timestamp: number }[]
    networkFailures?: { url: string; status: number; method: string; timestamp: number }[]
    route?: string
  }
}

interface Detection {
  type: "CONTEXT_FAILURE" | "ERROR_PATTERN" | "MISSING_FEATURE" | "UX_FRICTION" | "QUALITY_GAP"
  severity: "HIGH" | "MEDIUM" | "LOW"
  title: string
  description: string
}

export async function logObservations(input: ObservationInput): Promise<void> {
  try {
    const detections: Detection[] = []

    // 1. CONTEXT_FAILURE
    if (input.contextAvailable === false && input.caseId) {
      detections.push({
        type: "CONTEXT_FAILURE",
        severity: "HIGH",
        title: `Case context failed to load for case ${input.caseId}`,
        description: `Reason: ${input.contextFailureReason || "unknown"}. User message: "${input.userMessage.slice(0, 200)}"`,
      })
    }

    // 2. ERROR_PATTERN
    const errors = input.pageContext?.errors || []
    const networkFailures = input.pageContext?.networkFailures || []
    if (errors.length > 0 || networkFailures.length > 0) {
      const errorSummary = errors
        .slice(0, 3)
        .map((e) => e.message.slice(0, 100))
        .join("; ")
      const networkSummary = networkFailures
        .slice(0, 3)
        .map((f) => `${f.method} ${f.url} → ${f.status}`)
        .join("; ")
      detections.push({
        type: "ERROR_PATTERN",
        severity: errors.some((e) => e.type === "unhandled_exception") ? "HIGH" : "MEDIUM",
        title: `Browser errors detected on ${input.route || input.pageContext?.route || "unknown page"}`,
        description: `Console errors: ${errorSummary || "none"}. Network failures: ${networkSummary || "none"}. User said: "${input.userMessage.slice(0, 200)}"`,
      })
    }

    // 3. MISSING_FEATURE
    const missingPhrases = [
      "not available",
      "doesn't exist",
      "don't have that feature",
      "not supported",
      "can't do that",
      "not yet implemented",
      "not built yet",
    ]
    if (missingPhrases.some((p) => input.assistantResponse.toLowerCase().includes(p))) {
      detections.push({
        type: "MISSING_FEATURE",
        severity: "MEDIUM",
        title: `Feature gap: "${input.userMessage.slice(0, 100)}"`,
        description: `User asked: "${input.userMessage.slice(0, 300)}". Response indicated feature unavailable.`,
      })
    }

    // 4. UX_FRICTION
    const frictionPhrases = [
      "broken",
      "doesn't work",
      "can't find",
      "stuck on",
      "not working",
      "frustrated",
      "confusing",
      "where is",
      "how do i",
      "bug",
    ]
    if (frictionPhrases.some((p) => input.userMessage.toLowerCase().includes(p))) {
      detections.push({
        type: "UX_FRICTION",
        severity:
          input.userMessage.toLowerCase().includes("broken") ||
          input.userMessage.toLowerCase().includes("not working")
            ? "HIGH"
            : "MEDIUM",
        title: `UX friction: "${input.userMessage.slice(0, 100)}"`,
        description: `Route: ${input.route || "unknown"}. Full message: "${input.userMessage.slice(0, 500)}"`,
      })
    }

    // 5. QUALITY_GAP — if Junebug says "I don't have" or "I can't verify"
    const qualityPhrases = [
      "i don't have",
      "i can't verify",
      "i don't currently have",
      "unable to confirm",
      "i'm not sure about the specific",
    ]
    if (qualityPhrases.some((p) => input.assistantResponse.toLowerCase().includes(p))) {
      detections.push({
        type: "QUALITY_GAP",
        severity: "LOW",
        title: `Junebug data gap on ${input.route || "unknown page"}`,
        description: `User asked: "${input.userMessage.slice(0, 200)}". Junebug couldn't provide specific data.`,
      })
    }

    if (detections.length === 0) return

    // Deduplicate: skip if same type+title exists in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    for (const det of detections) {
      const existing = await prisma.junebugObservation
        .findFirst({
          where: {
            type: det.type,
            title: det.title,
            createdAt: { gte: oneHourAgo },
          },
        })
        .catch(() => null)

      if (existing) continue

      await prisma.junebugObservation
        .create({
          data: {
            type: det.type,
            severity: det.severity,
            title: det.title,
            description: det.description,
            route: input.route || input.pageContext?.route,
            caseId: input.caseId,
            userId: input.userId,
            metadata: {
              userMessage: input.userMessage.slice(0, 500),
              errorCount: errors.length,
              networkFailureCount: networkFailures.length,
            },
          },
        })
        .catch(() => {}) // fire-and-forget
    }
  } catch {
    // Entire function is fire-and-forget
  }
}
