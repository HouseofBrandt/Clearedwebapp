import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { checkKnownImplementations } from "@/lib/ai/feature-detection"

/**
 * POST — marks all inbox items that match known implementations as "implemented".
 * Admin-only. Runs checkKnownImplementations() against all open BUG_REPORT
 * and FEATURE_REQUEST messages.
 */
export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  // 1. Query all open bug reports and feature requests
  const openMessages = await prisma.message.findMany({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
      ],
    },
    select: {
      id: true,
      subject: true,
      body: true,
    },
  })

  const results: { subject: string; status: string }[] = []
  let markedCount = 0

  // 2. Check each message against known implementations
  for (const msg of openMessages) {
    const detection = checkKnownImplementations(msg.subject, msg.body)

    if (detection && detection.confidence === "HIGH") {
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          implementationStatus: "implemented",
          implementedAt: new Date(),
          implementationNotes: detection.evidence,
          implementedById: auth.userId,
        },
      })
      results.push({ subject: msg.subject, status: "marked_implemented" })
      markedCount++
    } else {
      results.push({ subject: msg.subject, status: "no_match" })
    }
  }

  logAudit({
    userId: auth.userId,
    action: "BULK_MARK_IMPLEMENTED",
    metadata: {
      totalScanned: openMessages.length,
      markedImplemented: markedCount,
      details: results.filter((r) => r.status === "marked_implemented"),
    },
  })

  return NextResponse.json({
    totalScanned: openMessages.length,
    markedImplemented: markedCount,
    details: results,
  })
}
