/**
 * Pippen Daily Intake Report Builder
 *
 * Combines:
 *  1. Tax authority harvesting digest (from existing digest builder)
 *  2. Client document intake stats for the day
 *
 * Returns a unified PippenDailyReport for the practitioner-facing page.
 */

import { prisma } from "@/lib/db"
import { getDocumentFreshness } from "@/lib/documents/freshness"
import type { FreshnessStatus } from "@/lib/documents/freshness"

// ---- Types ----

export interface DocumentIntakeStat {
  category: string
  fileType: string
  count: number
}

export interface UploaderStat {
  uploaderId: string
  uploaderName: string
  count: number
}

export interface ExtractionQualityStat {
  total: number
  withText: number
  withoutText: number
  extractionRate: number
}

export interface FreshnessBreakdown {
  current: number
  expiring_soon: number
  expired: number
  no_expiration: number
  unknown: number
}

export interface CaseDocumentGroup {
  caseId: string
  caseNumber: string
  clientName: string
  documents: {
    id: string
    fileName: string
    fileType: string
    documentCategory: string
    uploadedAt: string
    uploaderName: string
    freshness: { status: FreshnessStatus; daysRemaining: number | null }
    hasExtractedText: boolean
  }[]
}

export interface PippenAlert {
  type: "irs_rejection" | "deadline" | "drift" | "extraction_failure" | "stale_authority"
  severity: "critical" | "warning" | "info"
  message: string
  caseId?: string
  caseNumber?: string
}

export interface AuthorityDigestSummary {
  available: boolean
  newAuthorities: number
  changedAuthorities: number
  supersededItems: number
  benchmarkDrifts: number
  knowledgeGaps: number
  summary: string
}

export interface LearningItem {
  title: string
  summary: string
  source: string
  sourceUrl: string
  relevance: string
  actionItems?: string[]
  publicationDate?: string
  /**
   * Primary issue category from Pippen Phase 2 classifyIssue() — surfaces
   * the (sourceId, issueCategory) pair the practitioner-feedback control
   * needs. Optional for back-compat with consumers that don't render
   * the +1/-1 buttons. "general" is a permitted value.
   */
  issueCategory?: string
}

export interface LearningsSection {
  available: boolean
  date: string
  topTakeaway: string
  learnings: LearningItem[]
}

export interface PippenDailyReport {
  reportDate: string
  generatedAt: string

  // Client document intake
  totalDocuments: number
  totalCasesAffected: number
  statsByCategory: DocumentIntakeStat[]
  statsByFileType: DocumentIntakeStat[]
  statsByUploader: UploaderStat[]
  extractionQuality: ExtractionQualityStat
  freshnessBreakdown: FreshnessBreakdown
  caseGroups: CaseDocumentGroup[]

  // Authority harvesting
  authorityDigest: AuthorityDigestSummary

  // Compiled learnings
  learnings: LearningsSection

  // Alerts
  alerts: PippenAlert[]
}

// ---- Builder ----

export async function buildDailyIntakeReport(date?: Date): Promise<PippenDailyReport> {
  const reportDate = date ?? new Date()
  const startOfDay = new Date(reportDate)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(reportDate)
  endOfDay.setUTCHours(23, 59, 59, 999)

  // 1. Query documents uploaded that day
  const documents = await prisma.document.findMany({
    where: {
      uploadedAt: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      case: { select: { id: true, tabsNumber: true, clientName: true } },
    },
    orderBy: { uploadedAt: "desc" },
  })

  // 2. Compute stats by category
  const categoryMap = new Map<string, number>()
  const fileTypeMap = new Map<string, number>()
  const uploaderMap = new Map<string, { name: string; count: number }>()

  let withText = 0
  let withoutText = 0
  const freshnessBreakdown: FreshnessBreakdown = {
    current: 0,
    expiring_soon: 0,
    expired: 0,
    no_expiration: 0,
    unknown: 0,
  }

  for (const doc of documents) {
    // Category stats
    categoryMap.set(doc.documentCategory, (categoryMap.get(doc.documentCategory) ?? 0) + 1)

    // File type stats
    fileTypeMap.set(doc.fileType, (fileTypeMap.get(doc.fileType) ?? 0) + 1)

    // Uploader stats
    const existing = uploaderMap.get(doc.uploadedById)
    if (existing) {
      existing.count++
    } else {
      uploaderMap.set(doc.uploadedById, { name: doc.uploadedBy.name, count: 1 })
    }

    // Extraction quality
    if (doc.extractedText && doc.extractedText.trim().length > 0) {
      withText++
    } else {
      withoutText++
    }

    // Freshness
    const freshness = getDocumentFreshness(doc.documentCategory, doc.uploadedAt)
    freshnessBreakdown[freshness.status]++
  }

  const statsByCategory: DocumentIntakeStat[] = Array.from(categoryMap.entries()).map(
    ([category, count]) => ({ category, fileType: "", count })
  )

  const statsByFileType: DocumentIntakeStat[] = Array.from(fileTypeMap.entries()).map(
    ([fileType, count]) => ({ category: "", fileType, count })
  )

  const statsByUploader: UploaderStat[] = Array.from(uploaderMap.entries()).map(
    ([uploaderId, { name, count }]) => ({ uploaderId, uploaderName: name, count })
  )

  const extractionQuality: ExtractionQualityStat = {
    total: documents.length,
    withText,
    withoutText,
    extractionRate: documents.length > 0 ? withText / documents.length : 0,
  }

  // 3. Group by case
  const caseMap = new Map<string, CaseDocumentGroup>()
  for (const doc of documents) {
    let group = caseMap.get(doc.caseId)
    if (!group) {
      group = {
        caseId: doc.case.id,
        caseNumber: doc.case.tabsNumber,
        clientName: doc.case.clientName,
        documents: [],
      }
      caseMap.set(doc.caseId, group)
    }
    const freshness = getDocumentFreshness(doc.documentCategory, doc.uploadedAt)
    group.documents.push({
      id: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      documentCategory: doc.documentCategory,
      uploadedAt: doc.uploadedAt.toISOString(),
      uploaderName: doc.uploadedBy.name,
      freshness: { status: freshness.status, daysRemaining: freshness.daysRemaining },
      hasExtractedText: !!(doc.extractedText && doc.extractedText.trim().length > 0),
    })
  }
  const caseGroups = Array.from(caseMap.values())

  // 4. Generate alerts
  const alerts: PippenAlert[] = []

  // IRS rejection alerts
  const rejections = documents.filter((d) => d.documentCategory === "IRS_REJECTION")
  for (const rej of rejections) {
    alerts.push({
      type: "irs_rejection",
      severity: "critical",
      message: `IRS rejection received: ${rej.fileName}`,
      caseId: rej.case.id,
      caseNumber: rej.case.tabsNumber,
    })
  }

  // Extraction failure alerts
  const failedExtractions = documents.filter(
    (d) => !d.extractedText && d.fileType !== "IMAGE" && d.fileType !== "AUDIO"
  )
  if (failedExtractions.length > 0) {
    alerts.push({
      type: "extraction_failure",
      severity: "warning",
      message: `${failedExtractions.length} document(s) uploaded without text extraction`,
    })
  }

  // 5. Authority digest (wrapped in try/catch — tables may not exist)
  let authorityDigest: AuthorityDigestSummary = {
    available: false,
    newAuthorities: 0,
    changedAuthorities: 0,
    supersededItems: 0,
    benchmarkDrifts: 0,
    knowledgeGaps: 0,
    summary: "",
  }

  try {
    const { buildDailyDigest } = await import("@/lib/tax-authority/digest/builder")
    const digest = await buildDailyDigest(reportDate)
    authorityDigest = {
      available: true,
      newAuthorities: digest.newAuthorities,
      changedAuthorities: digest.changedAuthorities,
      supersededItems: digest.supersededItems,
      benchmarkDrifts: digest.benchmarkDrifts,
      knowledgeGaps: digest.knowledgeGaps,
      summary: digest.summary,
    }

    // Add drift alerts
    if (digest.benchmarkDrifts > 0) {
      alerts.push({
        type: "drift",
        severity: "warning",
        message: `${digest.benchmarkDrifts} benchmark drift(s) detected in authority data`,
      })
    }

    // Stale authority alerts
    if (digest.knowledgeGaps > 0) {
      alerts.push({
        type: "stale_authority",
        severity: "info",
        message: `${digest.knowledgeGaps} stale authorities need reverification`,
      })
    }
  } catch {
    // Authority tables may not be migrated yet — silently degrade
  }

  // 6. Compiled learnings (from the Pippen pipeline)
  let learnings: LearningsSection = {
    available: false,
    date: startOfDay.toISOString().split("T")[0],
    topTakeaway: "",
    learnings: [],
  }

  try {
    const { compileDailyLearnings } = await import("@/lib/pippen/compile-learnings")
    const compiled = await compileDailyLearnings(reportDate)
    if (compiled.learnings.length > 0) {
      learnings = {
        available: true,
        date: compiled.date,
        topTakeaway: compiled.topTakeaway,
        learnings: compiled.learnings.map((l) => ({
          title: l.title,
          summary: l.summary,
          source: l.source,
          sourceUrl: l.sourceUrl,
          relevance: l.relevance,
          actionItems: l.actionItems,
          publicationDate: l.publicationDate,
          issueCategory: l.issueCategory,
        })),
      }
    }
  } catch {
    // Compiled learnings pipeline may not be available — silently degrade
  }

  return {
    reportDate: startOfDay.toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
    totalDocuments: documents.length,
    totalCasesAffected: caseGroups.length,
    statsByCategory,
    statsByFileType,
    statsByUploader,
    extractionQuality,
    freshnessBreakdown,
    caseGroups,
    authorityDigest,
    learnings,
    alerts,
  }
}
