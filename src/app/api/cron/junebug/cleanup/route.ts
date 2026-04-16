import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createAuditLog } from "@/lib/ai/audit"

/**
 * /api/cron/junebug/cleanup — nightly sweep for empty threads (spec §10.2).
 *
 * Deletes `JunebugThread` rows where:
 *   - message count is 0 (no USER/ASSISTANT/SYSTEM rows)
 *   - createdAt is older than 24 hours
 *
 * Empty threads are created by the "New conversation" flow; if the user
 * backs out without sending a message, the row lingers. 24 hours is
 * conservative — practitioners who wandered off still get their empty
 * thread back if they come back the same day.
 *
 * Auth: Bearer CRON_SECRET, matching the existing cron pattern
 * (src/app/api/cron/data-retention/route.ts).
 *
 * The route runs regardless of the NEXT_PUBLIC_JUNEBUG_THREADS_ENABLED
 * flag — if the flag is off but threads tables exist (they do: PR 1's
 * migration lands schema-only), we still want the sweep to run so the
 * tables don't accumulate garbage if someone flipped the flag on then
 * off again. The query is a no-op when no empty threads exist.
 */

export const maxDuration = 60

const THRESHOLD_HOURS = 24

export async function GET(request: NextRequest) {
  // Match the auth pattern used in src/app/api/cron/data-retention/route.ts.
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

  const cutoff = new Date(Date.now() - THRESHOLD_HOURS * 60 * 60 * 1000)

  try {
    // Find the candidate rows first so we can log the count + a sample.
    // deleteMany with a nested `messages: { none: {} }` relation filter
    // is an available Prisma pattern, but we want the observation step
    // (audit + sample) too — so we fetch ids + delete by id.
    const candidates = await prisma.junebugThread.findMany({
      where: {
        createdAt: { lt: cutoff },
        messages: { none: {} },
      },
      select: { id: true, userId: true, caseId: true, createdAt: true },
      take: 1000, // cap a single run so a runaway never blows the function duration
    })

    let deletedCount = 0
    if (candidates.length > 0) {
      const result = await prisma.junebugThread.deleteMany({
        where: { id: { in: candidates.map((c) => c.id) } },
      })
      deletedCount = result.count
    }

    // Audit the sweep. Metadata is small — don't log thread ids at rest.
    await createAuditLog({
      action: "JUNEBUG_CLEANUP",
      metadata: {
        deletedCount,
        thresholdHours: THRESHOLD_HOURS,
        runAt: new Date().toISOString(),
        cappedAt: candidates.length === 1000 ? 1000 : undefined,
      },
    }).catch(() => {
      /* audit failure is not fatal for a cleanup cron */
    })

    return NextResponse.json({
      success: true,
      deletedCount,
      thresholdHours: THRESHOLD_HOURS,
      capped: candidates.length === 1000,
    })
  } catch (err: any) {
    console.error("[JunebugCleanup] Failed:", err?.message)
    return NextResponse.json({ error: err?.message ?? "cleanup failed" }, { status: 500 })
  }
}
