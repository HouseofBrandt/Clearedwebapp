import { prisma } from "@/lib/db"
import { analyzeDocumentGaps, getNextSteps, assessCaseHealth, DEADLINE_CONSEQUENCES } from "@/lib/ai/workflow-intelligence"

// ═══════════════════════════════════════════════════
// Case Graph Engine — continuously computed intelligence
// ═══════════════════════════════════════════════════

export async function computeCaseGraph(caseId: string): Promise<void> {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      documents: true,
      aiTasks: { include: { reviewActions: true } },
      deadlines: true,
      activities: { take: 20, orderBy: { createdAt: "desc" } },
      intelligence: true,
      banjoAssignments: { include: { tasks: true } },
    },
  })
  if (!caseData) return

  const digest = computeDigest(caseData)
  const nextSteps = computeNextStepsV2(caseData)
  const bundleReadiness = computeBundleReadiness(caseData)
  const { riskScore, riskFactors } = computeRiskScore(caseData)
  const { daysSinceActivity, isStale } = computeStaleness(caseData)
  const { confidenceScore, confidenceFlags } = computeConfidence(caseData)

  const now = new Date()

  await prisma.caseIntelligence.upsert({
    where: { caseId },
    create: {
      caseId,
      digest, digestUpdatedAt: now,
      nextSteps, nextStepsUpdatedAt: now,
      bundleReadiness,
      riskScore, riskFactors,
      daysSinceActivity, isStale,
      confidenceScore, confidenceFlags,
    },
    update: {
      digest, digestUpdatedAt: now,
      nextSteps, nextStepsUpdatedAt: now,
      bundleReadiness,
      riskScore, riskFactors,
      daysSinceActivity, isStale,
      confidenceScore, confidenceFlags,
    },
  })
}

// ═══════════════════════════════════════════════════
// Digest — natural language case summary
// ═══════════════════════════════════════════════════

function computeDigest(caseData: any): string {
  const parts: string[] = []
  const intel = caseData.intelligence

  // Case type + filing status + liability
  const typeLabel = caseData.caseType
  const filing = caseData.filingStatus || "Unknown filing status"
  const liability = caseData.totalLiability
    ? `$${Number(caseData.totalLiability).toLocaleString()} liability`
    : "liability TBD"
  parts.push(`${typeLabel} case, ${filing}, ${liability}`)

  // Document completeness
  const docCount = caseData.documents?.length || 0
  const completeness = intel?.docCompleteness
    ? `${Math.round(intel.docCompleteness * 100)}% complete`
    : "not assessed"
  parts.push(`${docCount} docs uploaded (${completeness})`)

  // Key risk indicators
  if (intel?.levyThreatActive) parts.push("Active levy threat")
  if (intel?.liensFiledActive) parts.push("Liens filed")

  // CSED
  if (intel?.csedEarliest) {
    const earliest = new Date(intel.csedEarliest)
    const latest = intel.csedLatest ? new Date(intel.csedLatest) : null
    if (latest) {
      parts.push(`CSED: ${earliest.getFullYear()}-${latest.getFullYear()}`)
    } else {
      parts.push(`CSED: ${earliest.getFullYear()}`)
    }
  }

  // RPC estimate
  if (intel?.rpcEstimate) {
    parts.push(`RCP estimated at $${Number(intel.rpcEstimate).toLocaleString()}`)
  }

  // Resolution phase
  if (intel?.resolutionPhase && intel.resolutionPhase !== "GATHERING_DOCUMENTS") {
    const phaseLabels: Record<string, string> = {
      GATHERING_DOCUMENTS: "Gathering documents",
      ANALYZING: "Analysis in progress",
      PREPARING_FORMS: "Preparing forms",
      PRACTITIONER_REVIEW: "Practitioner review",
      FILED_WITH_IRS: "Filed with IRS",
      IRS_PROCESSING: "IRS processing",
      IRS_RESPONSE_RECEIVED: "IRS response received",
      APPEALS: "In appeals",
      ACCEPTED: "Accepted",
      REJECTED: "Rejected by IRS",
    }
    parts.push(phaseLabels[intel.resolutionPhase] || intel.resolutionPhase)
  }

  // Pending reviews
  const pendingReviews = caseData.aiTasks?.filter((t: any) => t.status === "READY_FOR_REVIEW").length || 0
  if (pendingReviews > 0) {
    parts.push(`${pendingReviews} item${pendingReviews === 1 ? "" : "s"} awaiting review`)
  }

  // Approaching deadlines
  const now = new Date()
  const urgentDeadlines = (caseData.deadlines || []).filter((d: any) => {
    const due = new Date(d.dueDate)
    const days = Math.floor((due.getTime() - now.getTime()) / 86400000)
    return days <= 7 && days >= 0 && d.status === "UPCOMING"
  })
  if (urgentDeadlines.length > 0) {
    const nearest = urgentDeadlines[0]
    const days = Math.floor((new Date(nearest.dueDate).getTime() - now.getTime()) / 86400000)
    parts.push(`${nearest.title} due in ${days} day${days === 1 ? "" : "s"}`)
  }

  return parts.join(". ") + "."
}

// ═══════════════════════════════════════════════════
// Next Steps — structured, prioritized recommendations
// ═══════════════════════════════════════════════════

function computeNextStepsV2(caseData: any): any[] {
  // Leverage existing getNextSteps but transform to V2 structure
  const rawSteps = getNextSteps(caseData)
  const steps: any[] = []
  const now = new Date()

  // Approaching deadlines with consequences
  for (const d of caseData.deadlines || []) {
    const due = new Date(d.dueDate)
    const daysUntil = Math.floor((due.getTime() - now.getTime()) / 86400000)
    if (daysUntil <= 7 && d.status === "UPCOMING") {
      steps.push({
        priority: daysUntil <= 2 ? "critical" : "high",
        action: daysUntil < 0
          ? `OVERDUE: ${d.title} was due ${Math.abs(daysUntil)} day(s) ago`
          : `${d.title} due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
        reason: DEADLINE_CONSEQUENCES[d.type as string] || "Deadline approaching",
        type: "deadline",
      })
    }
  }

  // Pending reviews
  const pendingReviews = (caseData.aiTasks || []).filter((t: any) => t.status === "READY_FOR_REVIEW")
  if (pendingReviews.length > 0) {
    steps.push({
      priority: "high",
      action: `${pendingReviews.length} deliverable${pendingReviews.length === 1 ? "" : "s"} awaiting review`,
      reason: "Work product is generated but not yet approved",
      type: "review",
    })
  }

  // Missing critical documents
  const docGaps = analyzeDocumentGaps(caseData)
  if (docGaps.criticalMissing > 0) {
    const missingLabels = docGaps.missing.filter(m => m.critical).map(m => m.label)
    steps.push({
      priority: "high",
      action: `${docGaps.criticalMissing} critical document${docGaps.criticalMissing === 1 ? "" : "s"} missing`,
      reason: "Cannot proceed with resolution without these documents",
      type: "documents",
      blockedBy: missingLabels.join(", "),
    })
  }

  // Suggest Banjo bundle if documents are sufficient and no pending work
  if (docGaps.completeness > 0.7 && pendingReviews.length === 0) {
    const approvedCount = (caseData.aiTasks || []).filter((t: any) => t.status === "APPROVED").length
    if (approvedCount === 0) {
      steps.push({
        priority: "normal",
        action: `Case is ready for Banjo — suggest running the ${caseData.caseType} package`,
        reason: `Document completeness is ${Math.round(docGaps.completeness * 100)}% with no pending work product`,
        type: "banjo",
        suggestedBanjoBundle: `Full ${caseData.caseType} package`,
      })
    }
  }

  // Add workflow-specific steps from existing engine
  for (const raw of rawSteps) {
    const already = steps.some(s => s.action === raw.action)
    if (!already) {
      steps.push({
        priority: raw.priority.toLowerCase(),
        action: raw.action,
        reason: raw.reason,
        type: "workflow",
      })
    }
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 }
  return steps.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2))
}

// ═══════════════════════════════════════════════════
// Risk Score — 0-100, higher = more urgent
// ═══════════════════════════════════════════════════

function computeRiskScore(caseData: any): { riskScore: number; riskFactors: any[] } {
  let score = 0
  const factors: any[] = []
  const now = new Date()
  const intel = caseData.intelligence

  // Overdue deadlines: +30 per critical, +15 per high
  for (const d of caseData.deadlines || []) {
    const due = new Date(d.dueDate)
    if (due < now && d.status === "UPCOMING") {
      const isCritical = ["CDP_HEARING", "TAX_COURT_PETITION", "OIC_PAYMENT"].includes(d.type)
      const severity = isCritical ? "critical" : "high"
      const points = isCritical ? 30 : 15
      score += points
      factors.push({
        factor: `Overdue: ${d.title}`,
        severity,
        detail: DEADLINE_CONSEQUENCES[d.type as string] || "Deadline missed",
      })
    }
  }

  // Approaching critical deadlines: +15 if <=3 days
  for (const d of caseData.deadlines || []) {
    const due = new Date(d.dueDate)
    const days = Math.floor((due.getTime() - now.getTime()) / 86400000)
    if (days >= 0 && days <= 3 && d.status === "UPCOMING") {
      score += 15
      factors.push({
        factor: `${d.title} due in ${days} day(s)`,
        severity: "high",
        detail: "Imminent deadline requires attention",
      })
    }
  }

  // Active levy threat: +25
  if (intel?.levyThreatActive) {
    score += 25
    factors.push({
      factor: "Active levy threat",
      severity: "critical",
      detail: "IRS can seize assets. Consider protective action.",
    })
  }

  // CSED expiring within 12 months: +20
  if (intel?.csedEarliest) {
    const csed = new Date(intel.csedEarliest)
    const monthsUntil = (csed.getTime() - now.getTime()) / (30 * 86400000)
    if (monthsUntil <= 12 && monthsUntil > 0) {
      score += 20
      factors.push({
        factor: "CSED expiring within 12 months",
        severity: "high",
        detail: `Earliest CSED: ${csed.toLocaleDateString()}. Verify no tolling events.`,
      })
    }
  }

  // Missing critical documents: +10 per missing
  const docGaps = analyzeDocumentGaps(caseData)
  if (docGaps.criticalMissing > 0) {
    const points = Math.min(30, docGaps.criticalMissing * 10)
    score += points
    factors.push({
      factor: `${docGaps.criticalMissing} critical document(s) missing`,
      severity: docGaps.criticalMissing >= 3 ? "high" : "medium",
      detail: docGaps.missing.filter(m => m.critical).map(m => m.label).join(", "),
    })
  }

  // Stale case (>14 days no activity): +15
  if (caseData.updatedAt) {
    const days = Math.floor((now.getTime() - new Date(caseData.updatedAt).getTime()) / 86400000)
    if (days > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)) {
      score += 15
      factors.push({
        factor: `No activity in ${days} days`,
        severity: "medium",
        detail: "Case may need attention or status update",
      })
    }
  }

  // Pending review >48 hours: +10
  const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const staleReviews = (caseData.aiTasks || []).filter(
    (t: any) => t.status === "READY_FOR_REVIEW" && new Date(t.createdAt) < staleThreshold
  )
  if (staleReviews.length > 0) {
    score += 10
    factors.push({
      factor: `${staleReviews.length} review(s) pending >48 hours`,
      severity: "medium",
      detail: "Deliverables awaiting practitioner review",
    })
  }

  // No resolution strategy yet (INTAKE with docs): +10
  if (caseData.status === "INTAKE" && (caseData.documents?.length || 0) > 3 && (caseData.aiTasks?.length || 0) === 0) {
    score += 10
    factors.push({
      factor: "Documents uploaded but no analysis run",
      severity: "medium",
      detail: "Consider running General Analysis to establish resolution strategy",
    })
  }

  // Compliance gaps for OIC/IA: +10
  if (intel && ["OIC", "IA"].includes(caseData.caseType)) {
    if (!intel.allReturnsFiled || !intel.currentOnEstimates) {
      score += 10
      factors.push({
        factor: "Filing compliance not verified",
        severity: "medium",
        detail: "OIC/IA require all returns filed and estimates current",
      })
    }
  }

  return { riskScore: Math.min(100, score), riskFactors: factors }
}

// ═══════════════════════════════════════════════════
// Bundle Readiness
// ═══════════════════════════════════════════════════

function computeBundleReadiness(caseData: any): Record<string, string> {
  const readiness: Record<string, string> = {}
  const intel = caseData.intelligence
  const docCompleteness = intel?.docCompleteness || 0
  const hasApprovedOutput = (caseData.aiTasks || []).some((t: any) => t.status === "APPROVED")

  // OIC packet
  if (caseData.caseType === "OIC" || caseData.caseType === "CNC") {
    if (docCompleteness >= 0.8 && (intel?.financialsComplete || docCompleteness >= 0.9)) {
      readiness.oicPacket = "ready"
    } else if (docCompleteness >= 0.5) {
      readiness.oicPacket = "partial"
    } else {
      readiness.oicPacket = "blocked"
    }
  }

  // IA packet
  if (["IA", "OIC"].includes(caseData.caseType)) {
    if (docCompleteness >= 0.7) {
      readiness.iaPacket = "ready"
    } else if (docCompleteness >= 0.4) {
      readiness.iaPacket = "partial"
    } else {
      readiness.iaPacket = "blocked"
    }
  }

  // Penalty analysis
  if (["PENALTY", "OIC", "IA"].includes(caseData.caseType)) {
    const hasTranscripts = (caseData.documents || []).some((d: any) => d.documentCategory === "IRS_NOTICE")
    readiness.penaltyPacket = hasTranscripts ? "ready" : "blocked"
  }

  // Appeals
  if (hasApprovedOutput) {
    readiness.appealsPacket = "ready"
  } else if (docCompleteness >= 0.6) {
    readiness.appealsPacket = "partial"
  } else {
    readiness.appealsPacket = "blocked"
  }

  // TFRP
  if (caseData.caseType === "TFRP") {
    if (docCompleteness >= 0.7) {
      readiness.tfrpPacket = "ready"
    } else {
      readiness.tfrpPacket = "blocked"
    }
  }

  // Innocent Spouse
  if (caseData.caseType === "INNOCENT_SPOUSE") {
    if (docCompleteness >= 0.7) {
      readiness.innocentSpousePacket = "ready"
    } else {
      readiness.innocentSpousePacket = "blocked"
    }
  }

  return readiness
}

// ═══════════════════════════════════════════════════
// Staleness
// ═══════════════════════════════════════════════════

function computeStaleness(caseData: any): { daysSinceActivity: number; isStale: boolean } {
  const now = new Date()
  const lastActivity = caseData.intelligence?.lastActivityDate
    ? new Date(caseData.intelligence.lastActivityDate)
    : new Date(caseData.updatedAt)

  const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / 86400000)
  const isStale = daysSinceActivity > 14 && !["RESOLVED", "CLOSED"].includes(caseData.status)

  return { daysSinceActivity, isStale }
}

// ═══════════════════════════════════════════════════
// Confidence Score
// ═══════════════════════════════════════════════════

function computeConfidence(caseData: any): { confidenceScore: number; confidenceFlags: any[] } {
  let score = 0
  const flags: any[] = []
  const intel = caseData.intelligence

  // Document completeness is the biggest confidence driver (0-40 points)
  const docCompleteness = intel?.docCompleteness || 0
  score += Math.round(docCompleteness * 40)

  if (docCompleteness < 0.5) {
    flags.push({ issue: "Low document completeness", impact: "Intelligence may be incomplete" })
  }

  // Recency of documents (0-20 points)
  const hasRecentDocs = (caseData.documents || []).some((d: any) => {
    const uploadedAt = new Date(d.uploadedAt)
    return (new Date().getTime() - uploadedAt.getTime()) < 90 * 86400000 // 90 days
  })
  if (hasRecentDocs) {
    score += 20
  } else if ((caseData.documents || []).length > 0) {
    score += 10
    flags.push({ issue: "No documents uploaded in 90 days", impact: "Financial data may be outdated" })
  }

  // AI analysis has been run (0-20 points)
  const approvedTasks = (caseData.aiTasks || []).filter((t: any) => t.status === "APPROVED").length
  if (approvedTasks > 0) {
    score += 20
  } else if ((caseData.aiTasks || []).length > 0) {
    score += 10
    flags.push({ issue: "AI analysis run but not yet approved", impact: "Work product not verified" })
  } else {
    flags.push({ issue: "No AI analysis run", impact: "No automated assessment available" })
  }

  // IRS position known (0-10 points)
  if (intel?.irsLastAction) {
    score += 10
  } else {
    flags.push({ issue: "IRS position unknown", impact: "Cannot assess urgency accurately" })
  }

  // Compliance verified (0-10 points)
  if (intel?.allReturnsFiled && intel?.currentOnEstimates && intel?.poaOnFile) {
    score += 10
  } else if (intel?.poaOnFile) {
    score += 5
  }

  return { confidenceScore: Math.min(100, score), confidenceFlags: flags }
}

// ═══════════════════════════════════════════════════
// Similar Cases (for precedent matching)
// ═══════════════════════════════════════════════════

export async function computeSimilarCases(caseId: string): Promise<string[]> {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    select: { caseType: true, filingStatus: true, totalLiability: true },
  })
  if (!caseData) return []

  const similar = await prisma.case.findMany({
    where: {
      id: { not: caseId },
      caseType: caseData.caseType,
      status: { in: ["ACTIVE", "RESOLVED"] },
    },
    select: { id: true, filingStatus: true, totalLiability: true },
    take: 10,
  })

  // Rank by similarity — same filing status and similar liability
  const liability = Number(caseData.totalLiability || 0)
  const scored = similar.map(c => {
    let matchScore = 0
    if (c.filingStatus === caseData.filingStatus) matchScore += 2
    const cLiability = Number(c.totalLiability || 0)
    if (liability > 0 && cLiability > 0) {
      const ratio = Math.min(liability, cLiability) / Math.max(liability, cLiability)
      if (ratio > 0.5) matchScore += 2
      if (ratio > 0.8) matchScore += 1
    }
    return { id: c.id, matchScore }
  })

  return scored
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5)
    .map(c => c.id)
}
