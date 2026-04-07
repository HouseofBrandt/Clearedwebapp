import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { RegHarvester } from "@/lib/tax-authority/harvest/reg-harvester"
import { IrmHarvester } from "@/lib/tax-authority/harvest/irm-harvester"
import { IrbHarvester } from "@/lib/tax-authority/harvest/irb-harvester"
import { TaxCourtHarvester } from "@/lib/tax-authority/harvest/tax-court-harvester"
import { WrittenDetHarvester } from "@/lib/tax-authority/harvest/written-det-harvester"
import { runPippenPipeline } from "@/lib/pippen/pipeline"
import type { HarvestResult } from "@/lib/tax-authority/types"

export const maxDuration = 300

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const results: HarvestResult[] = []
  const harvesters = [
    new RegHarvester(),
    new IrbHarvester(),
    new IrmHarvester(),
    new TaxCourtHarvester(),
    new WrittenDetHarvester(),
  ]

  for (const harvester of harvesters) {
    try {
      const result = await harvester.harvest()
      results.push(result)
    } catch (e) {
      results.push({
        sourceId: "unknown",
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

  // Run the compile + ingest + post stages after harvesting
  let pipelineResult = null
  try {
    pipelineResult = await runPippenPipeline()
  } catch (err) {
    console.error("[Admin] Pippen pipeline failed:", err)
    pipelineResult = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return NextResponse.json({
    ok: totalErrors === 0,
    summary: { totalNew, totalChanged, totalErrors },
    results,
    pipeline: pipelineResult,
  })
}
