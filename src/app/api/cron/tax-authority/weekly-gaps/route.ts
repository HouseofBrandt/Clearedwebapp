import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { scanForGaps } from '@/lib/tax-authority/integration/junebug-gaps'
import type { GapReport } from '@/lib/tax-authority/types'

/**
 * Weekly Gap Scan (Pippen Phase 2)
 *
 * Runs `scanForGaps()` once a week and persists the result as an AuditLog
 * entry with action=`AUTHORITY_GAP_SCAN`. The admin tax-authority dashboard
 * reads the most recent entry to render the Gap Report card.
 *
 * We deliberately piggyback on AuditLog instead of introducing a dedicated
 * GapReport table — report payloads are small, cadence is low (weekly), and
 * the existing audit infrastructure (retention, access control) already fits.
 * If this grows into anything more complex (trending, delta analysis), it
 * gets its own model in a later phase.
 */

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let report: GapReport | null = null
  let errorMessage: string | null = null

  try {
    report = await scanForGaps()
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[weekly-gaps] scanForGaps failed:', errorMessage)
  }

  // Persist to AuditLog (non-blocking, best-effort)
  try {
    await prisma.auditLog.create({
      data: {
        action: 'AUTHORITY_GAP_SCAN',
        metadata: (report ?? { error: errorMessage }) as any,
      },
    })
  } catch (err) {
    console.error('[weekly-gaps] AuditLog write failed:', err)
  }

  if (!report) {
    return NextResponse.json(
      { ok: false, error: errorMessage ?? 'Unknown failure' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    summary: {
      corrections: report.corrections,
      missingCitations: report.missingCitations,
      staleCitations: report.staleCitations,
      benchmarkDrifts: report.benchmarkDrifts,
      totalGaps: report.gaps.length,
    },
  })
}
