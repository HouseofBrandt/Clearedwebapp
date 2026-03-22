import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { detectImplementation } from "@/lib/ai/feature-detection"
import { logAudit, AUDIT_ACTIONS } from "@/lib/ai/audit"
import { notify } from "@/lib/notifications"

export const maxDuration = 120

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  // Fetch all open/null feature requests and bug reports
  const messages = await prisma.message.findMany({
    where: {
      type: { in: ["FEATURE_REQUEST", "BUG_REPORT"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
      ],
    },
    select: {
      id: true,
      subject: true,
      body: true,
      type: true,
      senderId: true,
    },
  })

  const results: Array<{
    id: string
    subject: string
    confidence: string
    action: string
    evidence: string
  }> = []

  for (const msg of messages) {
    try {
      const detection = await detectImplementation({
        subject: msg.subject,
        body: msg.body,
        type: msg.type,
      })

      if (detection.confidence === "HIGH") {
        await prisma.message.update({
          where: { id: msg.id },
          data: {
            implementationStatus: "implemented",
            implementedAt: new Date(),
            implementationNotes: `Auto-detected: ${detection.evidence}\nFiles: ${detection.matchedFiles.slice(0, 5).join(", ")}`,
            implementedById: auth.userId,
          },
        })

        // Notify original submitter
        if (msg.senderId) {
          notify({
            recipientId: msg.senderId,
            type: "DIRECT_MESSAGE",
            subject: `Your ${msg.type === "BUG_REPORT" ? "bug report" : "feature request"} has been implemented`,
            body: `"${msg.subject}" has been detected as implemented.\n\nEvidence: ${detection.evidence}`,
          }).catch(() => {})
        }

        results.push({ id: msg.id, subject: msg.subject, confidence: "HIGH", action: "marked_implemented", evidence: detection.evidence })
      } else if (detection.confidence === "MEDIUM") {
        await prisma.message.update({
          where: { id: msg.id },
          data: {
            implementationStatus: "needs_review",
            implementationNotes: `Auto-scan (medium confidence): ${detection.evidence}\nFiles: ${detection.matchedFiles.slice(0, 5).join(", ")}`,
          },
        })
        results.push({ id: msg.id, subject: msg.subject, confidence: "MEDIUM", action: "flagged_for_review", evidence: detection.evidence })
      } else {
        results.push({ id: msg.id, subject: msg.subject, confidence: detection.confidence, action: "no_change", evidence: detection.evidence })
      }
    } catch (err: any) {
      results.push({ id: msg.id, subject: msg.subject, confidence: "ERROR", action: "error", evidence: err.message })
    }
  }

  logAudit({
    userId: auth.userId,
    action: "SCAN_IMPLEMENTATIONS",
    metadata: {
      scanned: messages.length,
      implemented: results.filter(r => r.action === "marked_implemented").length,
      flagged: results.filter(r => r.action === "flagged_for_review").length,
    },
  })

  return NextResponse.json({
    scanned: messages.length,
    implemented: results.filter(r => r.action === "marked_implemented").length,
    flaggedForReview: results.filter(r => r.action === "flagged_for_review").length,
    unchanged: results.filter(r => r.action === "no_change").length,
    errors: results.filter(r => r.action === "error").length,
    details: results,
  })
}
