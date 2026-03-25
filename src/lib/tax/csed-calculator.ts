/**
 * CSED (Collection Statute Expiration Date) Calculator
 *
 * Computes the CSED for each tax year, accounting for tolling events
 * that suspend the 10-year collection statute under IRC § 6502.
 *
 * Every computation is auditable — stores inputs, logic, and result
 * for malpractice defense purposes.
 */

export interface TollingEvent {
  type: TollingType
  startDate: Date
  endDate: Date | null  // null = ongoing
  source: 'transcript' | 'manual'  // How it was identified
  description: string
  additionalDays?: number  // Extra days added after event ends (e.g., OIC +30)
}

export type TollingType =
  | 'oic_pending'          // OIC submission to final determination + 30 days
  | 'ia_pending'           // IA request while pending
  | 'bankruptcy'           // Bankruptcy filing to discharge/dismissal + 6 months
  | 'cdp_hearing'          // CDP/CAP request through determination
  | 'military_deferment'   // Military combat zone or deployment
  | 'outside_us'           // Taxpayer outside US for 6+ continuous months
  | 'litigation'           // TC 520 to TC 521
  | 'innocent_spouse'      // IRC § 6015 request pending
  | 'taxpayer_assistance'  // TAO or TAS intervention
  | 'other'                // Manual entry by practitioner

export interface CSEDInput {
  taxYear: number
  assessmentDate: Date         // TC 150 date (or TC 290/300 for SFR)
  tollingEvents: TollingEvent[]
  manualAdjustmentDays?: number  // Practitioner override
  notes?: string
}

export interface CSEDResult {
  originalCSED: Date           // Assessment + 10 years (no tolling)
  adjustedCSED: Date           // After tolling adjustments
  totalTollingDays: number     // Net suspension days
  remainingDays: number        // Days until CSED from today
  isExpired: boolean
  isApproachingExpiration: boolean  // < 180 days
  computation: CSEDComputation[]   // Auditable breakdown
  warnings: string[]
}

export interface CSEDComputation {
  step: number
  description: string
  daysAdded: number
  runningTotal: number
  source: string
}

// TC codes that indicate tolling events
const TOLLING_TC_MAP: Record<number, { type: TollingType; action: 'start' | 'end'; extraDays?: number }> = {
  480: { type: 'oic_pending', action: 'start' },
  481: { type: 'oic_pending', action: 'end', extraDays: 30 },   // Rejection + 30 days
  482: { type: 'oic_pending', action: 'end' },                   // Acceptance ends tolling
  520: { type: 'litigation', action: 'start' },
  521: { type: 'litigation', action: 'end' },
}

/**
 * Detect tolling events from transcript transaction codes.
 */
export function detectTollingEvents(
  transactions: { code: number; date: string | null; amount?: number | null }[]
): TollingEvent[] {
  const events: TollingEvent[] = []
  const openEvents: Map<TollingType, { startDate: Date; tcCode: number }> = new Map()

  // Sort by date
  const sorted = [...transactions]
    .filter(t => t.date)
    .sort((a, b) => parseDate(a.date!).getTime() - parseDate(b.date!).getTime())

  for (const tc of sorted) {
    const mapping = TOLLING_TC_MAP[tc.code]
    if (!mapping || !tc.date) continue

    const date = parseDate(tc.date)

    if (mapping.action === 'start') {
      openEvents.set(mapping.type, { startDate: date, tcCode: tc.code })
    } else if (mapping.action === 'end') {
      const open = openEvents.get(mapping.type)
      if (open) {
        events.push({
          type: mapping.type,
          startDate: open.startDate,
          endDate: date,
          source: 'transcript',
          description: `TC ${open.tcCode} → TC ${tc.code}`,
          additionalDays: mapping.extraDays,
        })
        openEvents.delete(mapping.type)
      }
    }
  }

  // Any still-open events (ongoing tolling)
  for (const [type, data] of Array.from(openEvents.entries())) {
    events.push({
      type,
      startDate: data.startDate,
      endDate: null,
      source: 'transcript',
      description: `TC ${data.tcCode} — ongoing (no closing code found)`,
    })
  }

  return events
}

/**
 * Compute the CSED with tolling adjustments.
 *
 * CSED = Assessment Date + 10 years + total tolling days
 *
 * Overlapping tolling periods are merged — days are only counted once.
 */
export function computeCSED(input: CSEDInput): CSEDResult {
  const computation: CSEDComputation[] = []
  const warnings: string[] = []
  const now = new Date()

  // Step 1: Base CSED = Assessment + 10 years
  const originalCSED = new Date(input.assessmentDate)
  originalCSED.setFullYear(originalCSED.getFullYear() + 10)

  computation.push({
    step: 1,
    description: `Base CSED: Assessment date (${formatDate(input.assessmentDate)}) + 10 years`,
    daysAdded: 0,
    runningTotal: 0,
    source: 'IRC § 6502(a)(1)',
  })

  // Step 2: Merge overlapping tolling periods
  const mergedPeriods = mergeTollingPeriods(input.tollingEvents, now)

  // Step 3: Calculate total tolling days
  let totalTollingDays = 0
  let stepNum = 2

  for (const period of mergedPeriods) {
    const endDate = period.endDate || now
    const days = daysBetween(period.startDate, endDate)
    const extraDays = period.additionalDays || 0
    const totalDays = days + extraDays

    totalTollingDays += totalDays
    computation.push({
      step: stepNum++,
      description: `${getTollingLabel(period.type)}: ${formatDate(period.startDate)} to ${period.endDate ? formatDate(period.endDate) : 'ongoing'}`
        + (extraDays > 0 ? ` + ${extraDays} day buffer` : ''),
      daysAdded: totalDays,
      runningTotal: totalTollingDays,
      source: getTollingCitation(period.type),
    })

    if (!period.endDate) {
      warnings.push(`${getTollingLabel(period.type)} is still ongoing — CSED continues to be tolled`)
    }
  }

  // Step 4: Manual adjustment
  if (input.manualAdjustmentDays) {
    totalTollingDays += input.manualAdjustmentDays
    computation.push({
      step: stepNum++,
      description: `Manual adjustment: ${input.manualAdjustmentDays} days${input.notes ? ` (${input.notes})` : ''}`,
      daysAdded: input.manualAdjustmentDays,
      runningTotal: totalTollingDays,
      source: 'Practitioner override',
    })
  }

  // Step 5: Compute adjusted CSED
  const adjustedCSED = new Date(originalCSED)
  adjustedCSED.setDate(adjustedCSED.getDate() + totalTollingDays)

  computation.push({
    step: stepNum,
    description: `Adjusted CSED: ${formatDate(originalCSED)} + ${totalTollingDays} tolling days = ${formatDate(adjustedCSED)}`,
    daysAdded: 0,
    runningTotal: totalTollingDays,
    source: 'Computed',
  })

  const remainingDays = daysBetween(now, adjustedCSED)
  const isExpired = adjustedCSED <= now
  const isApproachingExpiration = remainingDays <= 180 && !isExpired

  if (isExpired) {
    warnings.push('CSED has expired — IRS collection authority has lapsed for this period')
  } else if (isApproachingExpiration) {
    warnings.push(`CSED expires in ${remainingDays} days — consider implications for resolution strategy`)
  }

  return {
    originalCSED,
    adjustedCSED,
    totalTollingDays,
    remainingDays: Math.max(0, remainingDays),
    isExpired,
    isApproachingExpiration,
    computation,
    warnings,
  }
}

/**
 * Merge overlapping tolling periods so days aren't counted twice.
 */
function mergeTollingPeriods(events: TollingEvent[], now: Date): TollingEvent[] {
  if (events.length === 0) return []

  // Sort by start date
  const sorted = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  const merged: TollingEvent[] = [{ ...sorted[0] }]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    const lastEnd = last.endDate || now

    if (current.startDate <= lastEnd) {
      // Overlapping — extend the end date if needed
      const currentEnd = current.endDate || now
      if (currentEnd > lastEnd) {
        last.endDate = current.endDate
      }
      // Take the larger additional days
      last.additionalDays = Math.max(last.additionalDays || 0, current.additionalDays || 0)
      last.description += ` (merged with ${current.description})`
    } else {
      merged.push({ ...current })
    }
  }

  return merged
}

// ─── Utility functions ───

function parseDate(dateStr: string): Date {
  // Handle MM-DD-YYYY or MM/DD/YYYY
  const parts = dateStr.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/)
  if (parts) {
    return new Date(parseInt(parts[3]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  }
  // Handle YYYY-MM-DD
  const iso = dateStr.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/)
  if (iso) {
    return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
  }
  return new Date(dateStr)
}

function formatDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${date.getFullYear()}`
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

function getTollingLabel(type: TollingType): string {
  const labels: Record<TollingType, string> = {
    oic_pending: 'OIC pending',
    ia_pending: 'IA request pending',
    bankruptcy: 'Bankruptcy',
    cdp_hearing: 'CDP/CAP hearing',
    military_deferment: 'Military deferment',
    outside_us: 'Taxpayer outside U.S.',
    litigation: 'IRS litigation',
    innocent_spouse: 'Innocent spouse request',
    taxpayer_assistance: 'Taxpayer Advocate intervention',
    other: 'Other tolling event',
  }
  return labels[type]
}

function getTollingCitation(type: TollingType): string {
  const citations: Record<TollingType, string> = {
    oic_pending: 'IRC § 6331(k)(1) — OIC tolling + 30 days post-rejection',
    ia_pending: 'IRC § 6331(k)(2) — IA request tolling',
    bankruptcy: 'IRC § 6503(h) — Bankruptcy automatic stay + 6 months',
    cdp_hearing: 'IRC § 6330(e)(1) — CDP hearing tolling',
    military_deferment: 'IRC § 7508 — Military combat zone',
    outside_us: 'IRC § 6503(c) — Absence from U.S.',
    litigation: 'IRC § 6503(a) — Litigation tolling',
    innocent_spouse: 'IRC § 6015(e)(2) — Innocent spouse request',
    taxpayer_assistance: 'IRC § 7811 — Taxpayer Advocate Order',
    other: 'Manual entry — see notes',
  }
  return citations[type]
}

/**
 * Format CSED result for display in the UI.
 */
export function formatCSEDSummary(result: CSEDResult): string {
  const lines: string[] = []
  lines.push(`Original CSED: ${formatDate(result.originalCSED)}`)
  if (result.totalTollingDays > 0) {
    lines.push(`Tolling days: ${result.totalTollingDays}`)
    lines.push(`Adjusted CSED: ${formatDate(result.adjustedCSED)}`)
  }
  if (result.isExpired) {
    lines.push(`Status: EXPIRED`)
  } else {
    lines.push(`Remaining: ${result.remainingDays} days`)
  }
  return lines.join('\n')
}
