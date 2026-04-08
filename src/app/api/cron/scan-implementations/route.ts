import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { detectImplementation } from "@/lib/ai/feature-detection"

export const maxDuration = 300

export async function GET(request: Request) {
  // Verify cron secret (skip check if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const openItems = await prisma.message.findMany({
    where: {
      type: { in: ["FEATURE_REQUEST", "BUG_REPORT"] },
      OR: [{ implementationStatus: null }, { implementationStatus: "open" }],
    },
    select: { id: true, subject: true, body: true, type: true, senderId: true },
  })

  let implemented = 0
  let flagged = 0
  let errors = 0

  for (const item of openItems) {
    try {
      const detection = await detectImplementation({
        subject: item.subject,
        body: item.body,
        type: item.type,
      })

      if (detection.confidence === "HIGH") {
        await prisma.message.update({
          where: { id: item.id },
          data: {
            implementationStatus: "implemented",
            implementedAt: new Date(),
            implementationNotes: `Auto-detected by daily scan: ${detection.evidence}\nFiles: ${detection.matchedFiles.slice(0, 5).join(", ")}`,
          },
        })
        implemented++
      } else if (detection.confidence === "MEDIUM") {
        await prisma.message.update({
          where: { id: item.id },
          data: {
            implementationStatus: "needs_review",
            implementationNotes: `Auto-scan (medium confidence): ${detection.evidence}`,
          },
        })
        flagged++
      }
    } catch {
      errors++
    }
  }

  return NextResponse.json({
    scanned: openItems.length,
    implemented,
    flagged,
    errors,
  })
}
