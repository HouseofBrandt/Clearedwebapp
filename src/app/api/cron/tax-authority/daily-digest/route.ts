import { NextRequest, NextResponse } from 'next/server'
import { publishDailyDigest } from '@/lib/tax-authority/digest/publisher'
import { runPippenPipeline } from '@/lib/pippen/pipeline'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Stage 1: Publish the existing daily digest
    const digestId = await publishDailyDigest()

    // Stages 2-4: Run the full Pippen learnings pipeline
    let pipelineResult = null
    try {
      pipelineResult = await runPippenPipeline()
    } catch (err) {
      console.error('[Cron] Pippen pipeline failed:', err)
      pipelineResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    return NextResponse.json({
      ok: true,
      digestId,
      pipeline: pipelineResult,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
