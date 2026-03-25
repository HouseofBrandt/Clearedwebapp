/**
 * Transcript Anomaly Detection Engine
 *
 * Scans parsed transcript data for irregularities, duplicate assessments,
 * misapplied payments, missing credits, and other conditions that
 * require practitioner attention.
 */

export interface TranscriptAnomaly {
  id: string
  severity: "critical" | "warning" | "info"
  type: string
  taxYear: string
  description: string
  details: string
  recommendation: string
  relatedTransactions: { code: string; date: string; amount: number }[]
}

export function detectAnomalies(yearData: Record<string, any>): TranscriptAnomaly[] {
  const anomalies: TranscriptAnomaly[] = []
  let anomalyId = 0

  for (const [year, data] of Object.entries(yearData)) {
    const transactions = data?.account?.transactions || []

    // Rule 1: Duplicate assessments (same TC + same amount on same year)
    const assessmentMap = new Map<string, any[]>()
    for (const t of transactions) {
      if (["290", "300"].includes(t.code) && t.amount > 0) {
        const key = `${t.code}-${t.amount}`
        if (!assessmentMap.has(key)) assessmentMap.set(key, [])
        assessmentMap.get(key)!.push(t)
      }
    }
    for (const [, dupes] of Array.from(assessmentMap.entries())) {
      if (dupes.length > 1) {
        anomalies.push({
          id: `anomaly-${++anomalyId}`,
          severity: "critical",
          type: "DUPLICATE_ASSESSMENT",
          taxYear: year,
          description: `Possible duplicate assessment: TC ${dupes[0].code} for ${formatCurrency(dupes[0].amount)} appears ${dupes.length} times`,
          details: `Same transaction code and amount posted on ${dupes.map((d: any) => d.date).join(", ")}. This may indicate a processing error.`,
          recommendation: "Request abatement of duplicate assessment. File Form 843 or call IRS to dispute.",
          relatedTransactions: dupes
        })
      }
    }

    // Rule 2: Misapplied payments (TC 670 without corresponding balance)
    const payments = transactions.filter((t: any) => t.code === "670")
    const assessments = transactions.filter((t: any) => ["150", "290", "300"].includes(t.code))
    for (const payment of payments) {
      if (assessments.length === 0 && Math.abs(payment.amount) > 0) {
        anomalies.push({
          id: `anomaly-${++anomalyId}`,
          severity: "warning",
          type: "MISAPPLIED_PAYMENT",
          taxYear: year,
          description: `Payment of ${formatCurrency(Math.abs(payment.amount))} on ${payment.date} with no corresponding assessment`,
          details: "A payment was posted to this tax year but no assessment exists. The payment may have been intended for a different year.",
          recommendation: "Verify payment was applied to the correct tax year. If misapplied, request transfer via Form 8379 or call IRS.",
          relatedTransactions: [payment]
        })
      }
    }

    // Rule 3: Missing withholding credits
    const wiForms = data?.wage_income?.forms || []
    const hasWithholding = wiForms.some((f: any) => (f.fields?.fed_withheld || 0) > 0)
    const has806 = transactions.some((t: any) => t.code === "806")
    if (hasWithholding && !has806) {
      const totalWithheld = wiForms.reduce((sum: number, f: any) => sum + (f.fields?.fed_withheld || 0), 0)
      anomalies.push({
        id: `anomaly-${++anomalyId}`,
        severity: "critical",
        type: "MISSING_WITHHOLDING_CREDIT",
        taxYear: year,
        description: `${formatCurrency(totalWithheld)} in withholding on W&I transcript but no TC 806 credit on account transcript`,
        details: "Federal withholding is reported on Wage & Income transcripts but not credited on the account transcript. This may result in an inflated balance.",
        recommendation: "File return claiming withholding credits, or if return was filed, request credit posting. May need Form 4506-T for transcript verification.",
        relatedTransactions: []
      })
    }

    // Rule 4: Penalty computation check
    const penaltyTCs = transactions.filter((t: any) => ["160", "170"].includes(t.code))
    const taxAssessed = transactions.find((t: any) => t.code === "150")
    for (const penalty of penaltyTCs) {
      if (taxAssessed && Math.abs(penalty.amount) > Math.abs(taxAssessed.amount || 0) * 0.5) {
        anomalies.push({
          id: `anomaly-${++anomalyId}`,
          severity: "warning",
          type: "EXCESSIVE_PENALTY",
          taxYear: year,
          description: `Penalty of ${formatCurrency(Math.abs(penalty.amount))} exceeds 50% of tax assessed (${formatCurrency(Math.abs(taxAssessed.amount || 0))})`,
          details: "Penalty amount appears disproportionately high relative to the underlying tax liability. May warrant review of penalty computation.",
          recommendation: "Review penalty computation for accuracy. Consider penalty abatement (FTA or reasonable cause). Request detailed penalty computation from IRS.",
          relatedTransactions: [penalty, taxAssessed]
        })
      }
    }

    // Rule 5: Processing delays
    const returnFiled = transactions.find((t: any) => t.code === "150")
    const firstAssessment = transactions.find((t: any) => t.code === "290" || t.code === "300")
    if (returnFiled && firstAssessment) {
      const filedDate = new Date(returnFiled.date)
      const assessDate = new Date(firstAssessment.date)
      const daysBetween = (assessDate.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysBetween > 365) {
        anomalies.push({
          id: `anomaly-${++anomalyId}`,
          severity: "info",
          type: "PROCESSING_DELAY",
          taxYear: year,
          description: `${Math.round(daysBetween)} days between return filing and additional assessment`,
          details: "Extended gap between return filing and subsequent assessment may indicate exam or processing backlog.",
          recommendation: "Review for audit activity (TC 420/421). Check if interest was properly computed from original due date.",
          relatedTransactions: [returnFiled, firstAssessment]
        })
      }
    }

    // Rule 6: SFR without taxpayer filing
    const sfr = transactions.find((t: any) => ["590", "598", "599"].includes(t.code))
    const taxpayerReturn = transactions.find((t: any) => t.code === "150" && !t.description?.toLowerCase().includes("substitute"))
    if (sfr && !taxpayerReturn) {
      anomalies.push({
        id: `anomaly-${++anomalyId}`,
        severity: "critical",
        type: "SFR_NO_RETURN",
        taxYear: year,
        description: "Substitute for Return (SFR) filed by IRS \u2014 no taxpayer return on record",
        details: "The IRS filed a substitute return which typically results in higher tax liability (no deductions, credits, or favorable filing status applied).",
        recommendation: "File original return to supersede SFR. Compare SFR assessment to estimated actual liability \u2014 superseding often results in significant reduction.",
        relatedTransactions: [sfr]
      })
    }
  }

  return anomalies.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })
}

function formatCurrency(n: number): string {
  return Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })
}
