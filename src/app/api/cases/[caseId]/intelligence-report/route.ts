import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { canAccessCase } from "@/lib/auth/case-access"
import { decryptField } from "@/lib/encryption"

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = (session.user as any).id
  const { caseId } = params

  if (!await canAccessCase(userId, caseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      assignedPractitioner: { select: { id: true, name: true, role: true } },
      liabilityPeriods: { orderBy: { taxYear: "asc" } },
      intelligence: true,
      deadlines: {
        where: { status: { not: "COMPLETED" } },
        orderBy: { dueDate: "asc" },
        take: 10,
      },
      documents: {
        select: { id: true, documentCategory: true, fileType: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
      },
      _count: { select: { documents: true, aiTasks: true } },
    },
  })

  if (!caseData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Decrypt PII
  const clientName = decryptField(caseData.clientName)

  // Compute summary stats
  const totalLiability = caseData.liabilityPeriods.reduce(
    (sum, lp) => sum + (Number(lp.totalBalance) || 0), 0
  )
  const totalPenalties = caseData.liabilityPeriods.reduce(
    (sum, lp) => sum + (Number(lp.penalties) || 0), 0
  )
  const totalInterest = caseData.liabilityPeriods.reduce(
    (sum, lp) => sum + (Number(lp.interest) || 0), 0
  )
  const yearsAtIssue = caseData.liabilityPeriods.length
  const unfiledYears = caseData.liabilityPeriods.filter(
    (lp) => lp.status === "UNFILED" || lp.status === "SFR"
  ).length
  const filedYears = caseData.liabilityPeriods.filter(
    (lp) => lp.status === "FILED" || lp.status === "COMPLIANT"
  ).length

  // CSED analysis
  const csedData = caseData.liabilityPeriods
    .filter((lp) => lp.csedDate)
    .map((lp) => ({
      taxYear: lp.taxYear,
      csedDate: lp.csedDate,
      daysRemaining: lp.csedDate
        ? Math.ceil(
            (new Date(lp.csedDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : null,
      status: lp.status,
    }))

  // Lien status from intelligence
  const intelligence = caseData.intelligence
  const lienStatus = intelligence?.liensFiledActive ? "LIEN_FILED" : "NO_LIEN"

  // Resolution roadmap scoring
  const roadmap = {
    oicViability: computeOICScore(totalLiability, intelligence, csedData, unfiledYears),
    penaltyAbatement: computePenaltyScore(caseData.liabilityPeriods, totalPenalties),
    cncIndicators: computeCNCScore(intelligence),
    iaProjection: computeIAScore(totalLiability),
  }

  // Document completeness
  const docCategories = caseData.documents.map((d) => d.documentCategory)
  const requiredCategories = ["IRS_NOTICE", "TAX_RETURN", "BANK_STATEMENT", "PAYROLL"]
  const docCompleteness =
    requiredCategories.filter((c) => docCategories.includes(c)).length /
    requiredCategories.length

  return NextResponse.json({
    clientName,
    caseNumber: caseData.tabsNumber,
    caseType: caseData.caseType,
    status: caseData.status,
    assignedPractitioner: caseData.assignedPractitioner?.name,
    filingStatus: caseData.filingStatus,

    summary: {
      totalLiability,
      totalPenalties,
      totalInterest,
      totalAssessed: totalLiability - totalPenalties - totalInterest,
      yearsAtIssue,
      unfiledYears,
      filedYears,
      complianceRate:
        yearsAtIssue > 0 ? Math.round((filedYears / yearsAtIssue) * 100) : 100,
      docCompleteness: Math.round(docCompleteness * 100),
      documentCount: caseData._count.documents,
      aiTaskCount: caseData._count.aiTasks,
    },

    liabilityTable: caseData.liabilityPeriods.map((lp) => ({
      taxYear: lp.taxYear,
      formType: lp.formType,
      originalAssessment: Number(lp.originalAssessment) || 0,
      penalties: Number(lp.penalties) || 0,
      interest: Number(lp.interest) || 0,
      totalBalance: Number(lp.totalBalance) || 0,
      status: lp.status,
      assessmentDate: lp.assessmentDate,
      csedDate: lp.csedDate,
      daysToCSED: lp.csedDate
        ? Math.ceil(
            (new Date(lp.csedDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : null,
    })),

    csedAnalysis: csedData,
    lienStatus,

    roadmap,

    deadlines: caseData.deadlines.map((d) => ({
      title: d.title,
      dueDate: d.dueDate,
      daysRemaining: Math.ceil(
        (new Date(d.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
      priority: d.priority,
      type: d.type,
    })),

    intelligence: intelligence
      ? {
          digest: intelligence.digest,
          nextSteps: intelligence.nextSteps,
          riskScore: intelligence.riskScore ?? null,
          confidenceScore: intelligence.confidenceScore ?? null,
          resolutionPhase: intelligence.resolutionPhase,
        }
      : null,

    generatedAt: new Date().toISOString(),
  })
}

// --- Scoring functions ---

function computeOICScore(
  totalLiability: number,
  intelligence: any,
  csedData: any[],
  unfiledYears: number
): { score: number; label: string; factors: string[] } {
  let score = 50
  const factors: string[] = []

  if (totalLiability > 50000) {
    score += 10
    factors.push("Liability over $50K — OIC more viable than full payment")
  }
  if (totalLiability > 100000) {
    score += 5
    factors.push("Liability over $100K — significant potential for reduction")
  }

  const nearCSED = csedData.filter((c) => c.daysRemaining && c.daysRemaining < 730)
  if (nearCSED.length > 0) {
    score -= 15
    factors.push(
      `${nearCSED.length} year(s) with CSED < 2 years — IRS may prefer to wait`
    )
  }

  if (unfiledYears > 0) {
    score -= 20
    factors.push(`${unfiledYears} unfiled year(s) — must be compliant before OIC`)
  } else {
    score += 10
    factors.push("All returns filed — compliance requirement met")
  }

  if (
    intelligence?.rcpEstimate &&
    Number(intelligence.rcpEstimate) < totalLiability * 0.3
  ) {
    score += 15
    factors.push("Estimated RCP well below liability — strong OIC candidate")
  }

  score = Math.max(0, Math.min(100, score))
  const label =
    score >= 70
      ? "Strong Candidate"
      : score >= 40
        ? "Possible Candidate"
        : "Unlikely Candidate"
  return { score, label, factors }
}

function computePenaltyScore(
  periods: any[],
  totalPenalties: number
): { eligible: string[]; ineligible: string[]; totalPenalties: number } {
  const eligible: string[] = []
  const ineligible: string[] = []

  for (const lp of periods) {
    const penalties = Number(lp.penalties) || 0
    if (penalties > 0) {
      if (lp.status === "FILED" || lp.status === "COMPLIANT") {
        eligible.push(`TY ${lp.taxYear}: ${formatCurrency(penalties)} — FTA may apply`)
      } else {
        ineligible.push(
          `TY ${lp.taxYear}: ${formatCurrency(penalties)} — not in compliance`
        )
      }
    }
  }
  return { eligible, ineligible, totalPenalties }
}

function computeCNCScore(
  intelligence: any
): { indicators: string[]; needsData: boolean } {
  const indicators: string[] = []
  let needsData = true

  if (intelligence?.resolutionPhase) {
    indicators.push(`Current phase: ${intelligence.resolutionPhase}`)
    needsData = false
  }
  if (!intelligence?.rcpEstimate) {
    indicators.push("No financial data available — cannot assess CNC eligibility")
    needsData = true
  } else if (Number(intelligence.rcpEstimate) < 1000) {
    indicators.push("Very low RCP estimate — potential CNC candidate")
    needsData = false
  }

  return { indicators, needsData }
}

function computeIAScore(
  totalLiability: number
): { monthlyPayment72: number; monthlyPayment84: number; streamlined: boolean } {
  return {
    monthlyPayment72: Math.round(totalLiability / 72),
    monthlyPayment84: Math.round(totalLiability / 84),
    streamlined: totalLiability <= 50000,
  }
}

function formatCurrency(n: number): string {
  return Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  })
}
