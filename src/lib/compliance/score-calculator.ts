type ControlStatus = "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT" | "NOT_ASSESSED"

interface ControlForScoring {
  controlId: string
  tsc: string
  status: ControlStatus
}

const STATUS_WEIGHTS: Record<ControlStatus, number> = {
  COMPLIANT: 1,
  PARTIALLY_COMPLIANT: 0.5,
  NON_COMPLIANT: 0,
  NOT_ASSESSED: 0,
}

export function calculateComplianceScore(controls: ControlForScoring[]): {
  overall: number // 0-100
  byTsc: Record<string, { score: number; total: number; passing: number }>
} {
  if (controls.length === 0) {
    return { overall: 0, byTsc: {} }
  }

  const byTsc: Record<string, { score: number; total: number; passing: number }> = {}

  // Group by TSC
  for (const control of controls) {
    if (!byTsc[control.tsc]) {
      byTsc[control.tsc] = { score: 0, total: 0, passing: 0 }
    }
    byTsc[control.tsc].total += 1
    const weight = STATUS_WEIGHTS[control.status]
    byTsc[control.tsc].passing += weight
  }

  // Calculate per-TSC scores
  for (const tsc of Object.keys(byTsc)) {
    const { total, passing } = byTsc[tsc]
    byTsc[tsc].score = total > 0 ? Math.round((passing / total) * 100) : 0
  }

  // Overall score: weighted average across all controls
  const totalWeight = controls.reduce(
    (sum, c) => sum + STATUS_WEIGHTS[c.status],
    0
  )
  const overall = Math.round((totalWeight / controls.length) * 100)

  return { overall, byTsc }
}
