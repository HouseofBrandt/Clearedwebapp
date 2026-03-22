import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"
import { recalculateDocCompleteness } from "./doc-completeness"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

export interface DocumentTriageResult {
  classified: boolean
  documentType?: string
  correctedCategory?: string | null
  isIrsCorrespondence?: boolean
  irsNoticeType?: string | null
  irsNoticeDate?: string | null
  responseDeadline?: string | null
  responseDeadlineDays?: number | null
  deadlineType?: string | null
  deadlineCritical?: boolean
  taxPeriodsFound?: string[]
  liabilityAmountFound?: number | null
  csedDatesFound?: Array<{ year: string; csed: string }>
  levyThreatDetected?: boolean
  lienMentioned?: boolean
  keyFindings?: string[]
  suggestedAction?: string
  error?: string
}

/**
 * Run a fast AI triage on a newly uploaded document.
 * Uses Sonnet for speed — this runs on EVERY upload (~3-5 seconds).
 */
export async function triageDocument(params: {
  documentId: string
  caseId: string
  fileName: string
  extractedText: string
  documentCategory: string
}): Promise<DocumentTriageResult> {
  if (!params.extractedText || params.extractedText.length < 50) {
    return { classified: false }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { classified: false, error: "API key not configured" }
  }

  const textPreview = params.extractedText.substring(0, 4000)

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0,
      system: "You are a document classifier for a tax resolution firm. Analyze the document and return ONLY a JSON object. No markdown, no explanation.",
      messages: [{
        role: "user",
        content: `Classify this document and extract key data points.

DOCUMENT: ${params.fileName}
CURRENT CATEGORY: ${params.documentCategory}

TEXT:
${textPreview}

Return this exact JSON structure:
{
  "documentType": "IRS_NOTICE | IRS_TRANSCRIPT | BANK_STATEMENT | TAX_RETURN | PAY_STUB | MORTGAGE | INSURANCE | RETIREMENT | VEHICLE_LOAN | STUDENT_LOAN | UTILITY | BILL_OF_SALE | APPRAISAL | LEASE | CORRESPONDENCE | OTHER",
  "correctedCategory": "string or null if current category is correct",
  "isIrsCorrespondence": true/false,
  "irsNoticeType": "CP14 | CP501 | CP503 | CP504 | LT11 | Letter1058 | 30DayLetter | 90DayLetter | AcceptanceLetter | RejectionLetter | null",
  "irsNoticeDate": "YYYY-MM-DD or null",
  "responseDeadline": "YYYY-MM-DD or null",
  "responseDeadlineDays": number or null,
  "deadlineType": "CDP_HEARING | TAX_COURT_PETITION | IRS_RESPONSE | APPEAL | null",
  "deadlineCritical": true/false,
  "taxPeriodsFound": ["2020", "2021"],
  "liabilityAmountFound": number or null,
  "csedDatesFound": [{"year": "2021", "csed": "2032-05-02"}],
  "levyThreatDetected": true/false,
  "lienMentioned": true/false,
  "keyFindings": ["string — 1-3 most important things about this document"],
  "suggestedAction": "string — what the practitioner should do about this document"
}`,
      }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const cleaned = text.replace(/```json|```/g, "").trim()
    const result = JSON.parse(cleaned)

    return { classified: true, ...result }
  } catch (error: any) {
    console.error("[DocumentTriage] Classification failed:", error.message)
    return { classified: false, error: error.message }
  }
}

/**
 * Process triage results: update case intelligence,
 * auto-create deadlines, correct categories, log activity.
 */
export async function processTriageResult(
  triageResult: DocumentTriageResult,
  params: {
    documentId: string
    caseId: string
    fileName: string
    userId: string
    userName: string
  }
) {
  if (!triageResult.classified) return

  const updates: any = {
    lastActivityDate: new Date(),
    lastActivityBy: params.userName,
    lastActivityAction: `Uploaded ${params.fileName}`,
  }

  // 1. Auto-correct document category if AI disagrees
  if (triageResult.correctedCategory) {
    await prisma.document.update({
      where: { id: params.documentId },
      data: { documentCategory: triageResult.correctedCategory as any },
    }).catch(() => {})
  }

  // 2. Detect IRS correspondence and create deadlines
  if (triageResult.isIrsCorrespondence && triageResult.responseDeadline) {
    const existingDeadline = await prisma.deadline.findFirst({
      where: {
        caseId: params.caseId,
        type: (triageResult.deadlineType || "IRS_RESPONSE") as any,
        dueDate: new Date(triageResult.responseDeadline),
      },
    })

    if (!existingDeadline) {
      const priority = triageResult.deadlineCritical ? "CRITICAL" : "HIGH"
      const daysUntil = triageResult.responseDeadlineDays || 30

      await prisma.deadline.create({
        data: {
          caseId: params.caseId,
          type: (triageResult.deadlineType || "IRS_RESPONSE") as any,
          title: `Respond to ${triageResult.irsNoticeType || "IRS Notice"} (${daysUntil}-day deadline)`,
          description: `Auto-detected from uploaded document: ${params.fileName}. ${triageResult.suggestedAction || ""}`,
          dueDate: new Date(triageResult.responseDeadline),
          priority: priority as any,
          status: "UPCOMING",
        },
      }).catch(() => {})

      await prisma.caseActivity.create({
        data: {
          caseId: params.caseId,
          userId: params.userId,
          action: "IRS_LETTER_DETECTED",
          description: `IRS ${triageResult.irsNoticeType || "notice"} detected in ${params.fileName}. ${priority} deadline auto-created for ${triageResult.responseDeadline}.`,
          metadata: {
            documentId: params.documentId,
            noticeType: triageResult.irsNoticeType,
            deadline: triageResult.responseDeadline,
            deadlineDays: triageResult.responseDeadlineDays,
          },
        },
      }).catch(() => {})
    }
  }

  // 3. Update IRS position tracking
  if (triageResult.isIrsCorrespondence) {
    if (triageResult.irsNoticeType) {
      updates.irsLastAction = `${triageResult.irsNoticeType} issued`
    }
    if (triageResult.irsNoticeDate) {
      updates.irsLastActionDate = new Date(triageResult.irsNoticeDate)
    }
    if (triageResult.levyThreatDetected) {
      updates.levyThreatActive = true
    }
    if (triageResult.lienMentioned) {
      updates.liensFiledActive = true
    }
  }

  // 4. Update CSED tracking
  if (triageResult.csedDatesFound && triageResult.csedDatesFound.length > 0) {
    const csedDates = triageResult.csedDatesFound
      .map(c => new Date(c.csed))
      .filter(d => !isNaN(d.getTime()))
    if (csedDates.length > 0) {
      updates.csedEarliest = new Date(Math.min(...csedDates.map(d => d.getTime())))
      updates.csedLatest = new Date(Math.max(...csedDates.map(d => d.getTime())))
    }
  }

  // 5. Update liability if found and higher than current
  if (triageResult.liabilityAmountFound) {
    const currentCase = await prisma.case.findUnique({
      where: { id: params.caseId },
      select: { totalLiability: true },
    })
    if (!currentCase?.totalLiability ||
        Number(currentCase.totalLiability) < triageResult.liabilityAmountFound) {
      await prisma.case.update({
        where: { id: params.caseId },
        data: { totalLiability: triageResult.liabilityAmountFound },
      }).catch(() => {})
    }
  }

  // 6. Update document completeness
  await recalculateDocCompleteness(params.caseId).catch(() => {})

  // 7. Write updates to CaseIntelligence
  await prisma.caseIntelligence.upsert({
    where: { caseId: params.caseId },
    create: { caseId: params.caseId, ...updates },
    update: updates,
  }).catch(() => {})

  // 8. Log the upload activity
  await prisma.caseActivity.create({
    data: {
      caseId: params.caseId,
      userId: params.userId,
      action: "DOCUMENT_UPLOADED",
      description: `${params.userName} uploaded ${params.fileName}`,
      metadata: {
        documentId: params.documentId,
        category: triageResult.correctedCategory || triageResult.documentType,
        keyFindings: triageResult.keyFindings,
      },
    },
  }).catch(() => {})
}
