import { prisma } from "@/lib/db"
import { getBanjoKnowledgeContext } from "@/lib/banjo/knowledge-retrieval"
import { getReviewInsights } from "@/lib/switchboard/review-insights"
import { assembleNoteContext, NoteContextItem } from "@/lib/notes/context-assembly"

export interface CaseContextPacket {
  // Identity
  caseId: string
  tabsNumber: string
  caseType: string
  filingStatus: string | null
  status: string
  totalLiability: number | null

  // Intelligence (from Case Graph — Phase 1)
  digest: string | null
  nextSteps: any[]
  riskScore: number
  riskFactors: any[]
  bundleReadiness: Record<string, string>
  confidenceScore: number
  confidenceFlags: any[]
  isStale: boolean

  // IRS Position
  irsLastAction: string | null
  irsAssignedUnit: string | null
  csedEarliest: string | null
  csedLatest: string | null

  // Documents
  docCompleteness: number
  docsReceivedCount: number
  docsRequiredCount: number
  documentManifest: string

  // Deadlines
  upcomingDeadlines: Array<{ title: string; dueDate: string; daysRemaining: number; priority: string }>

  // Prior work product
  approvedTaskSummary: string
  pendingReviewCount: number

  // Review insights (from Switchboard Module 2)
  reviewInsights: string | null

  // Knowledge context (pre-retrieved for the specific case)
  knowledgeContext: string | null

  // Similar cases
  similarCaseIds: string[]

  // Client notes & conversations
  clientNotes?: string
  noteContextItems?: NoteContextItem[]
}

/**
 * Assembles the complete context packet for a case.
 * Called by Junebug, Banjo, review Junebug, and any future AI surface.
 * This is the single source of truth for "what does the AI need to know about this case?"
 */
export async function getCaseContextPacket(
  caseId: string,
  options?: {
    includeKnowledge?: boolean
    knowledgeQuery?: string
    includeReviewInsights?: boolean
  }
): Promise<CaseContextPacket | null> {
  const opts = {
    includeKnowledge: true,
    includeReviewInsights: true,
    ...options,
  }

  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      intelligence: true,
      documents: { select: { id: true, documentCategory: true, fileName: true } },
      deadlines: {
        where: { status: "UPCOMING" },
        orderBy: { dueDate: "asc" },
        take: 5,
      },
      aiTasks: {
        select: { id: true, taskType: true, status: true, banjoStepLabel: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!caseData) return null

  const intel = caseData.intelligence

  // Build document manifest
  const docsByCategory = new Map<string, number>()
  for (const doc of caseData.documents) {
    const cat = doc.documentCategory || "OTHER"
    docsByCategory.set(cat, (docsByCategory.get(cat) || 0) + 1)
  }
  const documentManifest = `${caseData.documents.length} documents: ${
    Array.from(docsByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `${count} ${cat.replace(/_/g, " ").toLowerCase()}`)
      .join(", ")
  }`

  // Build task summary
  const approved = caseData.aiTasks.filter(t => t.status === "APPROVED")
  const rejected = caseData.aiTasks.filter(t => t.status === "REJECTED")
  const pending = caseData.aiTasks.filter(t => t.status === "READY_FOR_REVIEW")
  const taskParts: string[] = []
  if (approved.length > 0) {
    taskParts.push(`${approved.length} approved: ${approved.map(t => t.banjoStepLabel || t.taskType).join(", ")}`)
  }
  if (rejected.length > 0) {
    taskParts.push(`${rejected.length} rejected: ${rejected.map(t => t.banjoStepLabel || t.taskType).join(", ")}`)
  }
  if (pending.length > 0) {
    taskParts.push(`${pending.length} awaiting review`)
  }
  const approvedTaskSummary = taskParts.join(". ") || "No AI work product yet."

  // Build deadline list
  const now = new Date()
  const upcomingDeadlines = caseData.deadlines.map(d => ({
    title: d.title,
    dueDate: d.dueDate.toISOString().split("T")[0],
    daysRemaining: Math.ceil((d.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    priority: d.priority,
  }))

  // Get review insights (Switchboard Module 2)
  let reviewInsights: string | null = null
  if (opts.includeReviewInsights) {
    try {
      reviewInsights = await getReviewInsights(caseData.caseType)
    } catch { /* non-fatal */ }
  }

  // Get client notes & conversation context
  let clientNotes: string | undefined
  let noteContextItems: NoteContextItem[] | undefined
  try {
    const noteContext = await assembleNoteContext(caseId, {
      featureArea: caseData.caseType === "OIC" ? "OIC"
        : caseData.caseType === "PENALTY" ? "PENALTY_ABATEMENT"
        : undefined,
    })
    if (noteContext.contextText) {
      clientNotes = noteContext.contextText
      noteContextItems = noteContext.usedItems
    }
  } catch { /* non-fatal */ }

  // Get knowledge context
  let knowledgeContext: string | null = null
  if (opts.includeKnowledge) {
    try {
      knowledgeContext = await getBanjoKnowledgeContext({
        assignmentText: opts.knowledgeQuery || `${caseData.caseType} resolution`,
        taskType: "GENERAL_ANALYSIS",
        caseType: caseData.caseType,
        casePosture: intel ? { collectionStage: intel.irsLastAction } : undefined,
        documentCategories: Array.from(docsByCategory.keys()),
      })
    } catch { /* non-fatal */ }
  }

  return {
    caseId,
    tabsNumber: caseData.tabsNumber,
    caseType: caseData.caseType,
    filingStatus: caseData.filingStatus,
    status: caseData.status,
    totalLiability: caseData.totalLiability ? Number(caseData.totalLiability) : null,

    digest: intel?.digest || null,
    nextSteps: (intel?.nextSteps as any[]) || [],
    riskScore: intel?.riskScore || 0,
    riskFactors: (intel?.riskFactors as any[]) || [],
    bundleReadiness: (intel?.bundleReadiness as Record<string, string>) || {},
    confidenceScore: intel?.confidenceScore || 0,
    confidenceFlags: (intel?.confidenceFlags as any[]) || [],
    isStale: intel?.isStale || false,

    irsLastAction: intel?.irsLastAction || null,
    irsAssignedUnit: intel?.irsAssignedUnit || null,
    csedEarliest: intel?.csedEarliest?.toISOString().split("T")[0] || null,
    csedLatest: intel?.csedLatest?.toISOString().split("T")[0] || null,

    docCompleteness: intel?.docCompleteness || 0,
    docsReceivedCount: intel?.docsReceivedCount || 0,
    docsRequiredCount: intel?.docsRequiredCount || 0,
    documentManifest,

    upcomingDeadlines,
    approvedTaskSummary,
    pendingReviewCount: pending.length,

    reviewInsights,
    knowledgeContext,
    similarCaseIds: (intel?.similarCaseIds as string[]) || [],

    clientNotes,
    noteContextItems,
  }
}

/**
 * Formats the context packet as a prompt section for injection into any AI system prompt.
 * Every AI call that involves a case should include this.
 */
export function formatContextForPrompt(packet: CaseContextPacket): string {
  let ctx = `CASE CONTEXT:\n`
  ctx += `Case: ${packet.tabsNumber} | Type: ${packet.caseType} | Status: ${packet.status}`
  if (packet.filingStatus) ctx += ` | Filing: ${packet.filingStatus}`
  if (packet.totalLiability) ctx += ` | Liability: $${packet.totalLiability.toLocaleString()}`
  ctx += `\n`

  if (packet.digest) {
    ctx += `\nSITUATION:\n${packet.digest}\n`
  }

  if (packet.nextSteps.length > 0) {
    ctx += `\nRECOMMENDED NEXT STEPS:\n`
    for (const step of packet.nextSteps.slice(0, 5)) {
      ctx += `- [${String(step.priority).toUpperCase()}] ${step.action}${step.reason ? ` — ${step.reason}` : ""}\n`
    }
  }

  ctx += `\nDOCUMENTS: ${packet.documentManifest}\n`
  ctx += `Completeness: ${Math.round(packet.docCompleteness * 100)}% (${packet.docsReceivedCount}/${packet.docsRequiredCount})\n`

  if (packet.upcomingDeadlines.length > 0) {
    ctx += `\nUPCOMING DEADLINES:\n`
    for (const d of packet.upcomingDeadlines) {
      ctx += `- ${d.title}: ${d.dueDate} (${d.daysRemaining} days, ${d.priority})\n`
    }
  }

  if (packet.irsLastAction) {
    ctx += `\nIRS POSITION:\n`
    ctx += `Last action: ${packet.irsLastAction}\n`
    if (packet.irsAssignedUnit) ctx += `Assigned unit: ${packet.irsAssignedUnit}\n`
    if (packet.csedEarliest) ctx += `CSED window: ${packet.csedEarliest} to ${packet.csedLatest || "unknown"}\n`
  }

  ctx += `\nWORK PRODUCT: ${packet.approvedTaskSummary}\n`

  if (packet.bundleReadiness && Object.keys(packet.bundleReadiness).length > 0) {
    ctx += `\nBUNDLE READINESS:\n`
    for (const [bundle, status] of Object.entries(packet.bundleReadiness)) {
      ctx += `- ${bundle}: ${status}\n`
    }
  }

  if (packet.confidenceScore < 50 || packet.confidenceFlags.length > 0) {
    ctx += `\nCONFIDENCE WARNINGS:\n`
    ctx += `Confidence: ${packet.confidenceScore}/100\n`
    for (const flag of packet.confidenceFlags) {
      ctx += `- ${flag.issue}: ${flag.impact}\n`
    }
    ctx += `When confidence is low, be explicit about what you're uncertain about. Do not present inferred data as fact.\n`
  }

  if (packet.reviewInsights) {
    ctx += `\nREVIEWER PATTERNS (use these to improve output quality):\n`
    ctx += `${packet.reviewInsights}\n`
  }

  if (packet.clientNotes) {
    ctx += `\n${packet.clientNotes}\n`
  }

  return ctx
}
