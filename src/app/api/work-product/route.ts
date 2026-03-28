/**
 * GET /api/work-product
 *
 * Returns the full work product registry merged with the current user's
 * overrides, grouped by category with stats.
 */

import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import {
  WORK_PRODUCT_REGISTRY,
  getRegistryByCategory,
  type WorkProductCategory,
  type WorkProductEntry,
} from "@/lib/work-product/registry"

interface OverrideSummary {
  id: string
  isEnabled: boolean
  hasDirectives: boolean
  exampleCount: number
  updatedAt: Date
}

interface MergedEntry extends WorkProductEntry {
  override: OverrideSummary | null
}

export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  // Load all overrides for this user with example counts
  // Wrapped in try/catch — table may not exist yet if migration hasn't run
  let overrides: any[] = []
  try {
    overrides = await prisma.workProductOverride.findMany({
      where: { userId: auth.userId },
      include: { _count: { select: { examples: true } } },
    })
  } catch {
    // Table doesn't exist yet — return registry without overrides
  }

  // Build a lookup map
  const overrideMap = new Map(
    overrides.map((o) => [
      o.taskType,
      {
        id: o.id,
        isEnabled: o.isEnabled,
        hasDirectives: !!(
          o.toneDirective ||
          o.structureDirective ||
          o.lengthDirective ||
          o.emphasisAreas ||
          o.avoidances ||
          o.customInstructions
        ),
        exampleCount: o._count.examples,
        updatedAt: o.updatedAt,
      } satisfies OverrideSummary,
    ])
  )

  // Merge overrides into registry entries
  const mergedRegistry: MergedEntry[] = WORK_PRODUCT_REGISTRY.map((entry) => ({
    ...entry,
    override: overrideMap.get(entry.taskType) ?? null,
  }))

  // Group by category
  const categories = getRegistryByCategory()
  const grouped: Record<WorkProductCategory, MergedEntry[]> = {
    case_analysis: [],
    work_product: [],
    correspondence: [],
    research: [],
  }

  for (const entry of mergedRegistry) {
    grouped[entry.category].push(entry)
  }

  // Compute stats
  const customizedCount = overrides.filter((o) => o.isEnabled).length
  const totalExamples = overrides.reduce((sum, o) => sum + o._count.examples, 0)

  return NextResponse.json({
    categories: grouped,
    stats: {
      totalTypes: WORK_PRODUCT_REGISTRY.length,
      customizedCount,
      totalExamples,
    },
  })
}
