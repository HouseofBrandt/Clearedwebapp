import { NextRequest, NextResponse } from 'next/server'
import { RegHarvester } from '@/lib/tax-authority/harvest/reg-harvester'
import { IrmHarvester } from '@/lib/tax-authority/harvest/irm-harvester'
import { IrbHarvester } from '@/lib/tax-authority/harvest/irb-harvester'
import { TaxCourtHarvester } from '@/lib/tax-authority/harvest/tax-court-harvester'
import { WrittenDetHarvester } from '@/lib/tax-authority/harvest/written-det-harvester'
import { FormsHarvester } from '@/lib/tax-authority/harvest/forms-harvester'
import { runSupersessionScan } from '@/lib/tax-authority/authority/supersession'
import type { HarvestResult, SupersessionReport } from '@/lib/tax-authority/types'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const harvestResults: HarvestResult[] = []
  let supersessionReport: SupersessionReport | null = null

  // Run all harvesters sequentially to respect rate limits
  const harvesters = [
    new RegHarvester(),
    new IrmHarvester(),
    new IrbHarvester(),
    new TaxCourtHarvester(),
    new WrittenDetHarvester(),
    new FormsHarvester(),
  ]

  for (const harvester of harvesters) {
    try {
      const result = await harvester.harvest()
      harvestResults.push(result)
    } catch (e) {
      harvestResults.push({
        sourceId: 'unknown',
        itemsFetched: 0,
        itemsNew: 0,
        itemsChanged: 0,
        itemsSkipped: 0,
        itemsFailed: 1,
        errors: [e instanceof Error ? e.message : String(e)],
        durationMs: 0,
      })
    }
  }

  // Run supersession scan after all harvesters complete
  try {
    supersessionReport = await runSupersessionScan()
  } catch (e) {
    console.error('[WeeklyReconcile] Supersession scan failed:', e)
  }

  const totalNew = harvestResults.reduce((s, r) => s + r.itemsNew, 0)
  const totalChanged = harvestResults.reduce((s, r) => s + r.itemsChanged, 0)
  const totalErrors = harvestResults.reduce((s, r) => s + r.errors.length, 0)

  return NextResponse.json({
    ok: totalErrors === 0,
    summary: { totalNew, totalChanged, totalErrors },
    harvestResults,
    supersessionReport,
  })
}
