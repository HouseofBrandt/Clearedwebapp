import { NextRequest, NextResponse } from 'next/server'
import { RegHarvester } from '@/lib/tax-authority/harvest/reg-harvester'
import { IrmHarvester } from '@/lib/tax-authority/harvest/irm-harvester'
import type { HarvestResult } from '@/lib/tax-authority/types'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: HarvestResult[] = []

  // Run harvesters sequentially to respect rate limits
  const harvesters = [new RegHarvester(), new IrmHarvester()]

  for (const harvester of harvesters) {
    try {
      const result = await harvester.harvest()
      results.push(result)
    } catch (e) {
      results.push({
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

  const totalNew = results.reduce((s, r) => s + r.itemsNew, 0)
  const totalChanged = results.reduce((s, r) => s + r.itemsChanged, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0)

  return NextResponse.json({
    ok: totalErrors === 0,
    summary: { totalNew, totalChanged, totalErrors },
    results,
  })
}
