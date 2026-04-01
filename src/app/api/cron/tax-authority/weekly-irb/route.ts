import { NextRequest, NextResponse } from 'next/server'
import { IrbHarvester } from '@/lib/tax-authority/harvest/irb-harvester'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const harvester = new IrbHarvester()
    const result = await harvester.harvest()
    return NextResponse.json({
      ok: result.errors.length === 0,
      result,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
