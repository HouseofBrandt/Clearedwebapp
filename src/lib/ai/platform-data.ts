import { prisma } from "@/lib/db"
import { formatDate, formatDateTime } from "@/lib/date-utils"
import { decryptField } from "@/lib/encryption"
import {
  getNextSteps,
  assessCaseHealth,
  analyzeDocumentGaps,
  DEADLINE_CONSEQUENCES,
} from "@/lib/ai/workflow-intelligence"
import { fetchRecentLogs, fetchDeployments, vercelHealthCheck } from "@/lib/infrastructure/vercel-logs"
import { getFileContents, searchCode, getRecentCommits, getCommitDetails, getFileTree } from "@/lib/infrastructure/github-api"

interface DataQuery {
  deadlines?: boolean
  cases?: boolean
  reviewQueue?: boolean
  caseDetail?: string
  knowledgeBase?: boolean
  inbox?: boolean
  users?: boolean
  errors?: boolean
  briefing?: boolean
  nextSteps?: boolean
  documentGap?: boolean
  compliance?: boolean
  strategyMatch?: boolean
  infrastructure?: boolean
  codebase?: boolean
  banjoData?: boolean
}

function decryptName(val: string | null | undefined): string {
  if (!val) return "Unknown"
  try { return decryptField(val) } catch { return val }
}

export function detectDataNeeds(message: string): DataQuery {
  const m = message.toLowerCase()
  const query: DataQuery = {}

  // ── Morning briefing ──
  if (m.match(/morning|brief|catch me up|what.*going on|daily|summary|what.*know|start.*day|what.*today|what.*attention|priorities/)) {
    query.briefing = true
  }

  // ── Next steps ──
  if (m.match(/what.*next|next step|what.*do now|what.*should|plan|priorit|workflow|what.*order/)) {
    query.nextSteps = true
  }

  // ── Document gap analysis ──
  if (m.match(/missing.*doc|what.*need|document.*gap|what.*upload|checklist|what.*missing|document request/)) {
    query.documentGap = true
  }

  // ── Compliance / practice health ──
  if (m.match(/compliance|practice.*health|all cases|firm.*status|portfolio|caseload|overview.*case/)) {
    query.compliance = true
  }

  // ── Strategy / pattern matching ──
  if (m.match(/similar case|precedent|what.*worked|strategy|how.*handled|past.*case|approach|done before/)) {
    query.strategyMatch = true
  }

  if (m.match(/deadline|calendar|due|overdue|upcoming|cdp.*hear|csed|statute/)) {
    query.deadlines = true
  }

  if (m.match(/case|client|status|liability|how many cases|active case|intake/)) {
    query.cases = true
  }

  const caseNumMatch = m.match(/clr-\d{4}-\d{2}-\d{4}/i)
  if (caseNumMatch) {
    query.caseDetail = caseNumMatch[0]
  }

  const quotedName = m.match(/["']([^"']+)["']/)
  if (quotedName && m.match(/case|client|status/)) {
    query.caseDetail = quotedName[1]
  }

  if (m.match(/review|pending|queue|approve|reject|ready for review/)) {
    query.reviewQueue = true
  }

  if (m.match(/banjo|assignment|deliverable|work product|bundle|what.*generat|status.*output/)) {
    query.banjoData = true
  }

  if (m.match(/knowledge|upload|document.*base|training|how many chunk|embed/)) {
    query.knowledgeBase = true
  }

  if (m.match(/inbox|message|unread|notification|bug report|feature request/)) {
    query.inbox = true
  }

  if (m.match(/implement|shipped|deployed|built|merged|status.*(?:bug|feature|request)|(?:bug|feature).*(?:status|done|fixed|resolved)/)) {
    query.inbox = true
  }

  if (m.match(/team|user|practitioner|who|assign|staff/)) {
    query.users = true
  }

  // ── Infrastructure / debugging ──
  if (m.match(/backend|server|vercel|deploy|log|runtime|500|timeout|not working|broke|crash|what.*happen|debug|diagnos|why.*fail|check.*server|health.*check.*server|infra/)) {
    query.infrastructure = true
    query.errors = true
  }

  // ── Codebase / code inspection ──
  if (m.match(/code|codebase|source|file.*content|show.*file|read.*file|look.*at.*code|implement|built|merged|commit|pull request|what.*changed|recent.*change|diff|branch|github|repo/)) {
    query.codebase = true
  }

  if (m.match(/error|bug|fail|broke|crash|not working|issue|problem/)) {
    query.errors = true
  }

  return query
}

export async function fetchPlatformData(
  query: DataQuery,
  userId: string,
  userMessage?: string
): Promise<string> {
  const sections: string[] = [];
  (query as any)._userMessage = userMessage || ""

  if (query.deadlines) {
    const deadlines = await prisma.deadline.findMany({
      where: { status: { in: ["UPCOMING"] } },
      include: {
        case: { select: { tabsNumber: true, clientName: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
    })

    const now = new Date()
    const overdue = deadlines.filter(d => d.dueDate < now)
    const upcoming = deadlines.filter(d => d.dueDate >= now)

    let text = "DEADLINES & CALENDAR:\n"
    if (overdue.length > 0) {
      text += `⚠ ${overdue.length} OVERDUE:\n`
      for (const d of overdue) {
        const daysOver = Math.floor((now.getTime() - d.dueDate.getTime()) / 86400000)
        text += `  - ${d.title} (${d.case.tabsNumber} · ${decryptName(d.case.clientName)}) — ${daysOver} days overdue · ${d.priority} · Assigned: ${d.assignedTo?.name || "Unassigned"}\n`
        const consequence = DEADLINE_CONSEQUENCES[(d as any).type]
        if (consequence) {
          text += `    ⚠ CONSEQUENCE: ${consequence}\n`
        }
      }
    }
    if (upcoming.length > 0) {
      text += `Upcoming (${upcoming.length}):\n`
      for (const d of upcoming.slice(0, 10)) {
        const daysUntil = Math.floor((d.dueDate.getTime() - now.getTime()) / 86400000)
        text += `  - ${d.title} (${d.case.tabsNumber} · ${decryptName(d.case.clientName)}) — in ${daysUntil} days · ${d.priority} · Assigned: ${d.assignedTo?.name || "Unassigned"}\n`
        const consequence = DEADLINE_CONSEQUENCES[(d as any).type]
        if (consequence && daysUntil <= 7) {
          text += `    ⚠ IF MISSED: ${consequence}\n`
        }
      }
      if (upcoming.length > 10) {
        text += `  ... and ${upcoming.length - 10} more\n`
      }
    }
    if (deadlines.length === 0) {
      text += "No active deadlines.\n"
    }
    sections.push(text)
  }

  if (query.cases) {
    const [total, byStatus, byType, recent] = await Promise.all([
      prisma.case.count(),
      prisma.case.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.case.groupBy({
        by: ["caseType"],
        _count: true,
      }),
      prisma.case.findMany({
        select: {
          tabsNumber: true,
          clientName: true,
          caseType: true,
          status: true,
          totalLiability: true,
          assignedPractitioner: { select: { name: true } },
          updatedAt: true,
          _count: { select: { documents: true, aiTasks: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ])

    let text = "CASES:\n"
    text += `Total: ${total} cases\n`
    text += `By status: ${byStatus.map(s => `${s.status} (${s._count})`).join(", ")}\n`
    text += `By type: ${byType.map(t => `${t.caseType} (${t._count})`).join(", ")}\n`
    text += `Recent cases:\n`
    for (const c of recent) {
      text += `  - ${c.tabsNumber} · ${decryptName(c.clientName)} · ${c.caseType} · ${c.status}`
      if (c.totalLiability) text += ` · $${Number(c.totalLiability).toLocaleString()}`
      text += ` · ${c._count.documents} docs · ${c._count.aiTasks} tasks`
      text += ` · Assigned: ${c.assignedPractitioner?.name || "Unassigned"}\n`
    }
    sections.push(text)
  }

  if (query.caseDetail) {
    const searchTerm = query.caseDetail
    const caseData = await prisma.case.findFirst({
      where: {
        OR: [
          { tabsNumber: { contains: searchTerm, mode: "insensitive" } },
          { tabsNumber: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      include: {
        assignedPractitioner: { select: { name: true } },
        documents: {
          select: {
            id: true,
            fileName: true,
            documentCategory: true,
            fileType: true,
            fileSize: true,
            uploadedAt: true,
            extractedText: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
        aiTasks: {
          select: { taskType: true, status: true, modelUsed: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        deadlines: {
          select: { title: true, type: true, dueDate: true, status: true, priority: true },
          orderBy: { dueDate: "asc" },
        },
        intelligence: {
          select: {
            resolutionPhase: true,
            resolutionType: true,
            irsLastAction: true,
            irsLastActionDate: true,
            irsNextExpectedAction: true,
            irsAssignedUnit: true,
            docsRequired: true,
            docsReceivedCount: true,
            docsRequiredCount: true,
            docCompleteness: true,
            financialsComplete: true,
            rpcEstimate: true,
            offerAmount: true,
            allReturnsFiled: true,
            currentOnEstimates: true,
            poaOnFile: true,
            levyThreatActive: true,
            liensFiledActive: true,
            csedEarliest: true,
            csedLatest: true,
            lastAssessmentSummary: true,
            lastActivityDate: true,
            lastActivityBy: true,
            lastActivityAction: true,
          },
        },
        activities: {
          select: {
            action: true,
            description: true,
            createdAt: true,
            user: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        _count: { select: { documents: true, aiTasks: true } },
      },
    })

    if (caseData) {
      let text = `CASE DETAIL — ${caseData.tabsNumber}:\n`
      text += `Client: ${decryptName(caseData.clientName)}\n`
      text += `Type: ${caseData.caseType} · Status: ${caseData.status}\n`
      if (caseData.filingStatus) text += `Filing Status: ${caseData.filingStatus}\n`
      if (caseData.totalLiability) text += `Total Liability: $${Number(caseData.totalLiability).toLocaleString()}\n`
      if (caseData.clientEmail) text += `Email: ${decryptName(caseData.clientEmail)}\n`
      if (caseData.clientPhone) text += `Phone: ${decryptName(caseData.clientPhone)}\n`
      text += `Assigned: ${caseData.assignedPractitioner?.name || "Unassigned"}\n`

      // Documents — structured manifest grouped by category
      text += `\nDOCUMENTS (${caseData._count.documents} files):\n`
      const docsByCategory: Record<string, any[]> = {}
      for (const d of caseData.documents) {
        const cat = d.documentCategory || "OTHER"
        if (!docsByCategory[cat]) docsByCategory[cat] = []
        docsByCategory[cat].push(d)
      }
      for (const [category, docs] of Object.entries(docsByCategory)) {
        text += `  ${category} (${docs.length}):\n`
        for (const d of docs) {
          const size = d.fileSize ? `${Math.round(d.fileSize / 1024)}KB` : ""
          const date = d.uploadedAt ? formatDate(d.uploadedAt) : ""
          const hasText = d.extractedText && d.extractedText.length > 50 ? "✓ text extracted" : "⚠ no text"
          text += `    - ${d.fileName} [${d.fileType}] ${size} · ${date} · ${hasText}\n`
        }
      }
      const docCategoryCounts = caseData.documents.reduce((acc: Record<string, number>, d: any) => {
        acc[d.documentCategory] = (acc[d.documentCategory] || 0) + 1
        return acc
      }, {})
      text += `Document category summary: ${Object.entries(docCategoryCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}\n`

      // Smart Status / Intelligence
      if (caseData.intelligence) {
        const intel = caseData.intelligence
        text += `\nSMART STATUS:\n`
        text += `Phase: ${intel.resolutionPhase}\n`
        text += `Document completeness: ${Math.round((intel.docCompleteness || 0) * 100)}% (${intel.docsReceivedCount}/${intel.docsRequiredCount})\n`
        if (intel.irsLastAction) {
          text += `IRS position: ${intel.irsLastAction}`
          if (intel.irsLastActionDate) text += ` (${formatDate(intel.irsLastActionDate)})`
          text += `\n`
        }
        if (intel.irsAssignedUnit) text += `IRS unit: ${intel.irsAssignedUnit}\n`

        const risks: string[] = []
        if (intel.levyThreatActive) risks.push("⚠ LEVY THREAT ACTIVE")
        if (intel.liensFiledActive) risks.push("⚠ LIEN FILED")
        if (!intel.allReturnsFiled) risks.push("❌ Returns not fully verified")
        if (!intel.currentOnEstimates) risks.push("❌ Estimated taxes not verified")
        if (!intel.poaOnFile) risks.push("⚠ No POA on file")
        if (risks.length > 0) text += `Risk flags: ${risks.join(" · ")}\n`

        if (intel.csedEarliest && intel.csedLatest) {
          text += `CSED range: ${formatDate(intel.csedEarliest)} — ${formatDate(intel.csedLatest)}\n`
        }
        if (intel.rpcEstimate) text += `Preliminary RCP: $${Number(intel.rpcEstimate).toLocaleString()}\n`
        if (intel.lastActivityAction) text += `Last activity: ${intel.lastActivityAction} by ${intel.lastActivityBy}\n`

        // Missing docs from structured checklist
        if (intel.docsRequired) {
          const required = intel.docsRequired as any[]
          const missing = required.filter((d: any) => !d.received)
          if (missing.length > 0) {
            text += `\nMISSING DOCUMENTS (from Smart Status checklist):\n`
            for (const d of missing) {
              text += `  ${d.critical ? "❌" : "⬜"} ${d.label}${d.critical ? " — REQUIRED" : ""}\n`
            }
          }
        }
      }

      text += `\nAI Tasks (${caseData._count.aiTasks}): ${caseData.aiTasks.map(t => `${t.taskType} (${t.status})`).join(", ")}\n`
      if (caseData.deadlines.length > 0) {
        text += `Deadlines:\n`
        for (const d of caseData.deadlines) {
          text += `  - ${d.title} · ${d.type} · Due: ${formatDate(d.dueDate)} · ${d.status} · ${d.priority}\n`
        }
      }

      if (caseData.activities && caseData.activities.length > 0) {
        text += `\nRECENT ACTIVITY:\n`
        for (const a of caseData.activities.slice(0, 10)) {
          text += `  - ${formatDate(a.createdAt)} · ${a.user?.name || "System"} · ${a.description}\n`
        }
      }

      // ── Case health check (always runs on case detail) ──
      const healthIssues = assessCaseHealth(caseData)
      if (healthIssues.length > 0) {
        text += "\nCASE HEALTH CHECK:\n"
        for (const issue of healthIssues) {
          text += `  ⚠ ${issue}\n`
        }
      } else {
        text += "\n✅ Case health: no issues detected.\n"
      }

      sections.push(text)
    } else {
      sections.push(`No case found matching "${searchTerm}".\n`)
    }
  }

  if (query.reviewQueue) {
    const tasks = await prisma.aITask.findMany({
      where: { status: "READY_FOR_REVIEW" },
      include: {
        case: { select: { tabsNumber: true, clientName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    let text = `REVIEW QUEUE (${tasks.length} pending):\n`
    for (const t of tasks) {
      text += `  - ${t.taskType} · ${t.case.tabsNumber} · ${decryptName(t.case.clientName)} · ${t.modelUsed || "pending"} · ${formatDate(t.createdAt)}\n`
    }
    if (tasks.length === 0) {
      text += "No tasks pending review.\n"
    }
    sections.push(text)
  }

  if (query.banjoData || query.caseDetail) {
    try {
      // Find case ID from caseDetail (tabs number or name) or from first case
      let banjoCase: any = null
      if (query.caseDetail) {
        banjoCase = await prisma.case.findFirst({
          where: {
            OR: [
              { tabsNumber: query.caseDetail },
              { clientName: { contains: query.caseDetail, mode: "insensitive" } },
            ],
          },
          select: { id: true, tabsNumber: true },
        })
      }

      if (banjoCase) {
        const assignments = await prisma.banjoAssignment.findMany({
          where: { caseId: banjoCase.id },
          include: {
            tasks: {
              select: {
                id: true, taskType: true, status: true, banjoStepLabel: true,
                banjoStepNumber: true, verifyFlagCount: true, judgmentFlagCount: true,
                createdAt: true,
                reviewActions: {
                  select: { action: true, practitioner: { select: { name: true } }, reviewCompletedAt: true },
                  orderBy: { reviewCompletedAt: "desc" },
                  take: 1,
                },
              },
              orderBy: { banjoStepNumber: "asc" },
            },
            createdBy: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })

        if (assignments.length > 0) {
          let text = `\nBANJO ASSIGNMENTS:\n`
          for (const a of assignments) {
            text += `\nAssignment: "${a.assignmentText.substring(0, 150)}..."\n`
            text += `   Status: ${a.status} | Created: ${formatDate(a.createdAt)} by ${a.createdBy.name}\n`
            text += `   Model: ${a.model} | Deliverables: ${a.tasks.length}\n`
            if (a.revisionResult) {
              text += `   Quality Review: ${a.revisionResult}\n`
            }
            for (const t of a.tasks) {
              const review = t.reviewActions[0]
              const reviewStatus = review
                ? `${review.action} by ${review.practitioner.name}`
                : t.status
              text += `   ${t.banjoStepNumber || "-"}. ${t.banjoStepLabel || t.taskType} [${reviewStatus}]`
              if (t.verifyFlagCount > 0) text += ` \u26A0 ${t.verifyFlagCount} verify`
              if (t.judgmentFlagCount > 0) text += ` ${t.judgmentFlagCount} judgment`
              text += `\n`
            }
          }
          sections.push(text)
        }
      }
    } catch { /* non-fatal */ }
  }

  if (query.knowledgeBase) {
    const [docCount, chunkCount, topDocs] = await Promise.all([
      prisma.knowledgeDocument.count({ where: { isActive: true } }),
      prisma.knowledgeChunk.count(),
      prisma.knowledgeDocument.findMany({
        where: { isActive: true },
        select: { title: true, category: true, chunkCount: true, hitCount: true },
        orderBy: { hitCount: "desc" },
        take: 10,
      }),
    ])

    let text = `KNOWLEDGE BASE:\n`
    text += `${docCount} documents · ${chunkCount} chunks\n`
    if (topDocs.length > 0) {
      text += `Documents:\n`
      for (const d of topDocs) {
        text += `  - ${d.title} · ${d.category} · ${d.chunkCount} chunks · ${d.hitCount} references\n`
      }
    }
    sections.push(text)
  }

  if (query.inbox) {
    const [unread, bugs, features] = await Promise.all([
      prisma.message.count({
        where: { recipientId: userId, read: false, archived: false },
      }),
      prisma.message.findMany({
        where: { type: "BUG_REPORT" },
        select: {
          subject: true,
          createdAt: true,
          implementationStatus: true,
          implementationNotes: true,
          sender: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.message.findMany({
        where: { type: "FEATURE_REQUEST" },
        select: {
          subject: true,
          createdAt: true,
          implementationStatus: true,
          implementationNotes: true,
          sender: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ])

    let text = `INBOX & TRACKING:\n`
    text += `${unread} unread messages\n`

    if (bugs.length > 0) {
      text += `\nBug Reports (${bugs.length}):\n`
      for (const b of bugs) {
        const status = b.implementationStatus || "open"
        text += `  - ${b.subject} [${status.toUpperCase()}]`
        if (b.implementationNotes) text += ` — ${b.implementationNotes}`
        text += `\n`
      }
    }

    if (features.length > 0) {
      text += `\nFeature Requests (${features.length}):\n`
      for (const f of features) {
        const status = f.implementationStatus || "open"
        text += `  - ${f.subject} [${status.toUpperCase()}]`
        if (f.implementationNotes) text += ` — ${f.implementationNotes}`
        text += `\n`
      }
    }

    const allItems = [...bugs, ...features]
    const open = allItems.filter(i => !i.implementationStatus || i.implementationStatus === "open").length
    const inProgress = allItems.filter(i => i.implementationStatus === "in_progress").length
    const done = allItems.filter(i => i.implementationStatus === "implemented").length
    text += `\nSummary: ${open} open, ${inProgress} in progress, ${done} implemented\n`

    sections.push(text)
  }

  if (query.users) {
    const users = await prisma.user.findMany({
      select: { name: true, role: true, email: true },
      orderBy: { name: "asc" },
    })

    let text = `TEAM (${users.length} users):\n`
    for (const u of users) {
      text += `  - ${u.name} · ${u.role} · ${u.email}\n`
    }
    sections.push(text)
  }

  if (query.errors) {
    const recent = await prisma.appError.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        route: true,
        errorMessage: true,
        statusCode: true,
        createdAt: true,
        metadata: true,
        user: { select: { name: true } },
      },
    })

    let text = `RECENT ERRORS (last ${recent.length}):\n`
    if (recent.length === 0) {
      text += "No errors recorded.\n"
    } else {
      for (const e of recent) {
        const time = formatDateTime(e.createdAt)
        const meta = e.metadata as any
        text += `  - [${time}] ${e.route} — ${e.errorMessage}`
        if (e.statusCode) text += ` (HTTP ${e.statusCode})`
        if (meta?.taskType) text += ` · Task: ${meta.taskType}`
        if (meta?.model) text += ` · Model: ${meta.model}`
        if (meta?.phase) text += ` · Phase: ${meta.phase}`
        if (e.user?.name) text += ` · User: ${e.user.name}`
        text += "\n"
      }
    }
    sections.push(text)
  }

  // ── MORNING BRIEFING ──
  if (query.briefing) {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(startOfToday.getTime() + 86400000)
    const weekFromNow = new Date(now.getTime() + 7 * 86400000)

    const [
      overdueDeadlines,
      todayDeadlines,
      weekDeadlines,
      pendingReviews,
      staleCases,
      recentErrors,
      unreadMessages,
    ] = await Promise.all([
      prisma.deadline.findMany({
        where: { dueDate: { lt: now }, status: "UPCOMING" },
        include: { case: { select: { tabsNumber: true, clientName: true } } },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      prisma.deadline.findMany({
        where: { dueDate: { gte: startOfToday, lt: endOfToday }, status: "UPCOMING" },
        include: { case: { select: { tabsNumber: true, clientName: true } } },
      }),
      prisma.deadline.findMany({
        where: { dueDate: { gte: now, lt: weekFromNow }, status: "UPCOMING" },
        include: { case: { select: { tabsNumber: true, clientName: true } }, assignedTo: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 15,
      }),
      prisma.aITask.count({ where: { status: "READY_FOR_REVIEW" } }),
      prisma.case.findMany({
        where: {
          status: { notIn: ["RESOLVED", "CLOSED"] },
          updatedAt: { lt: new Date(now.getTime() - 14 * 86400000) },
        },
        select: { tabsNumber: true, clientName: true, createdAt: true, status: true },
        take: 10,
      }),
      prisma.appError.count({
        where: { createdAt: { gte: new Date(now.getTime() - 86400000) } },
      }),
      prisma.message.count({
        where: { recipientId: userId, read: false, archived: false },
      }),
    ])

    let text = "DAILY BRIEFING:\n\n"

    if (overdueDeadlines.length > 0) {
      text += `🔴 ${overdueDeadlines.length} OVERDUE DEADLINE(S):\n`
      for (const d of overdueDeadlines) {
        const daysOver = Math.floor((now.getTime() - d.dueDate.getTime()) / 86400000)
        text += `  - ${d.title} (${d.case.tabsNumber} · ${decryptName(d.case.clientName)}) — ${daysOver} days overdue\n`
        const consequence = DEADLINE_CONSEQUENCES[(d as any).type]
        if (consequence) text += `    ⚠ ${consequence}\n`
      }
      text += "\n"
    }

    if (todayDeadlines.length > 0) {
      text += `📅 DUE TODAY (${todayDeadlines.length}):\n`
      for (const d of todayDeadlines) {
        text += `  - ${d.title} (${d.case.tabsNumber} · ${decryptName(d.case.clientName)})\n`
      }
      text += "\n"
    }

    if (weekDeadlines.length > 0) {
      text += `📋 DUE THIS WEEK (${weekDeadlines.length}):\n`
      for (const d of weekDeadlines) {
        const daysUntil = Math.floor((d.dueDate.getTime() - now.getTime()) / 86400000)
        text += `  - ${d.title} (${d.case.tabsNumber}) — in ${daysUntil} day(s) · Assigned: ${d.assignedTo?.name || "Unassigned"}\n`
        const consequence = DEADLINE_CONSEQUENCES[(d as any).type]
        if (consequence && daysUntil <= 3) text += `    ⚠ IF MISSED: ${consequence}\n`
      }
      text += "\n"
    }

    const actions: string[] = []
    if (pendingReviews > 0) actions.push(`${pendingReviews} AI output(s) waiting for review`)
    if (unreadMessages > 0) actions.push(`${unreadMessages} unread message(s)`)
    if (staleCases.length > 0) {
      actions.push(`${staleCases.length} case(s) with no activity in 14+ days:`)
      for (const c of staleCases.slice(0, 5)) {
        actions.push(`    ${c.tabsNumber} · ${decryptName(c.clientName)} · ${c.status}`)
      }
    }
    if (recentErrors > 0) actions.push(`${recentErrors} system error(s) in the last 24 hours`)

    if (actions.length > 0) {
      text += "NEEDS ATTENTION:\n"
      for (const a of actions) text += `  - ${a}\n`
      text += "\n"
    }

    if (overdueDeadlines.length === 0 && todayDeadlines.length === 0 && actions.length === 0) {
      text += "✅ All clear — no urgent items today.\n"
    }

    sections.push(text)
  }

  // ── NEXT STEPS ──
  if (query.nextSteps) {
    let targetCase = null
    if (query.caseDetail) {
      targetCase = await prisma.case.findFirst({
        where: {
          OR: [
            { tabsNumber: { equals: query.caseDetail, mode: "insensitive" } },
            { tabsNumber: { contains: query.caseDetail, mode: "insensitive" } },
          ],
        },
        include: {
          documents: { select: { documentCategory: true, fileName: true } },
          aiTasks: { select: { taskType: true, status: true }, orderBy: { createdAt: "desc" } },
          deadlines: { select: { title: true, type: true, dueDate: true, status: true, priority: true } },
          intelligence: true,
        },
      })
    }

    if (targetCase) {
      const steps = getNextSteps(targetCase)
      if (steps.length > 0) {
        let text = "\nRECOMMENDED NEXT STEPS:\n"
        for (const step of steps) {
          const icon = step.priority === "CRITICAL" ? "🔴" : step.priority === "HIGH" ? "🟡" : "🔵"
          text += `\n${icon} [${step.priority}] ${step.action}\n`
          text += `   ${step.reason}\n`
        }
        sections.push(text)
      }
    }
  }

  // ── DOCUMENT GAP ANALYSIS ──
  if (query.documentGap) {
    let targetCase = null
    if (query.caseDetail) {
      targetCase = await prisma.case.findFirst({
        where: {
          OR: [
            { tabsNumber: { equals: query.caseDetail, mode: "insensitive" } },
            { tabsNumber: { contains: query.caseDetail, mode: "insensitive" } },
          ],
        },
        include: {
          documents: { select: { documentCategory: true, fileName: true } },
        },
      })
    }

    if (targetCase) {
      const gap = analyzeDocumentGaps(targetCase)
      let text = `\nDOCUMENT GAP ANALYSIS — ${(targetCase as any).caseType}:\n`
      text += `Completeness: ${Math.round(gap.completeness * 100)}% · ${gap.summary}\n\n`

      if (gap.missing.length > 0) {
        text += "MISSING:\n"
        for (const m of gap.missing) {
          text += `  ${m.critical ? "❌" : "⬜"} ${m.label}${m.critical ? " — REQUIRED" : ""}\n`
        }
        text += "\n"
      }
      text += "PRESENT:\n"
      for (const p of gap.present) {
        text += `  ✅ ${p.category} (${p.count}): ${p.files.join(", ")}\n`
      }
      sections.push(text)
    }
  }

  // ── COMPLIANCE MONITOR ──
  if (query.compliance) {
    const now = new Date()
    const [
      totalCases,
      casesByStatus,
      casesNoActivity30,
      casesNoDeadlines,
      overdueCount,
      pendingOver48h,
      intakeOver30,
    ] = await Promise.all([
      prisma.case.count({ where: { status: { notIn: ["CLOSED"] } } }),
      prisma.case.groupBy({ by: ["status"], _count: true }),
      prisma.case.count({
        where: {
          status: { notIn: ["RESOLVED", "CLOSED"] },
          updatedAt: { lt: new Date(now.getTime() - 30 * 86400000) },
        },
      }),
      prisma.case.count({
        where: {
          status: { notIn: ["RESOLVED", "CLOSED"] },
          deadlines: { none: {} },
        },
      }),
      prisma.deadline.count({
        where: { dueDate: { lt: now }, status: "UPCOMING" },
      }),
      prisma.aITask.count({
        where: {
          status: "READY_FOR_REVIEW",
          createdAt: { lt: new Date(now.getTime() - 48 * 3600000) },
        },
      }),
      prisma.case.count({
        where: {
          status: "INTAKE",
          createdAt: { lt: new Date(now.getTime() - 30 * 86400000) },
        },
      }),
    ])

    let text = "PRACTICE COMPLIANCE DASHBOARD:\n"
    text += `Total active cases: ${totalCases}\n`
    text += `By status: ${casesByStatus.map(s => `${s.status} (${s._count})`).join(", ")}\n\n`

    const warnings: string[] = []
    if (overdueCount > 0) warnings.push(`${overdueCount} overdue deadline(s) across all cases`)
    if (pendingOver48h > 0) warnings.push(`${pendingOver48h} AI output(s) pending review for 48+ hours`)
    if (casesNoActivity30 > 0) warnings.push(`${casesNoActivity30} active case(s) with no activity in 30+ days`)
    if (intakeOver30 > 0) warnings.push(`${intakeOver30} case(s) stuck in INTAKE for 30+ days`)
    if (casesNoDeadlines > 0) warnings.push(`${casesNoDeadlines} active case(s) with no deadlines set`)

    if (warnings.length > 0) {
      text += "⚠ WARNINGS:\n"
      for (const w of warnings) text += `  - ${w}\n`
    } else {
      text += "✅ No compliance warnings.\n"
    }

    sections.push(text)
  }

  // ── STRATEGY PATTERN MATCHING ──
  if (query.strategyMatch) {
    try {
      const approvedDocs = await prisma.knowledgeDocument.findMany({
        where: {
          category: "APPROVED_OUTPUT",
          isActive: true,
        },
        select: {
          title: true,
          description: true,
          createdAt: true,
          hitCount: true,
          tags: true,
        },
        orderBy: { hitCount: "desc" },
        take: 8,
      })

      if (approvedDocs.length > 0) {
        let text = "SIMILAR APPROVED WORK PRODUCT IN KNOWLEDGE BASE:\n"
        for (const doc of approvedDocs) {
          text += `  - ${doc.title} (${formatDate(doc.createdAt)}) — referenced ${doc.hitCount} times\n`
          if (doc.description) text += `    ${doc.description}\n`
          if (doc.tags.length > 0) text += `    Tags: ${doc.tags.join(", ")}\n`
        }
        text += "\nThe AI analysis engine automatically uses these as reference material for new analyses of the same case type.\n"
        sections.push(text)
      }
    } catch {
      // KB search failed, skip
    }
  }

  // ── INFRASTRUCTURE STATUS ──
  if (query.infrastructure) {
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000
    let text = "INFRASTRUCTURE STATUS:\n\n"

    // Deployments
    try {
      const { deployments, error } = await fetchDeployments(5)
      if (error) {
        text += `⚠ Deployment data unavailable: ${error}\n`
      } else if (deployments.length > 0) {
        text += "RECENT DEPLOYMENTS:\n"
        for (const d of deployments) {
          text += `  - ${d.state.toUpperCase()} · ${d.createdAt}`
          if (d.commitMessage) text += ` · "${d.commitMessage}"`
          if (d.branch) text += ` (${d.branch})`
          text += `\n`
        }
        text += "\n"
      }
    } catch {}

    // Runtime logs
    try {
      const { logs, error } = await fetchRecentLogs({ limit: 40, since: thirtyMinAgo })
      if (error) {
        text += `⚠ Runtime logs unavailable: ${error}\n`
        // Run health check to provide diagnostic context
        try {
          const health = await vercelHealthCheck()
          text += `  Diagnostics: configured=${health.configured}, connected=${health.connected}\n`
          text += `  Env vars: token=${health.envVars.token}, projectId=${health.envVars.projectId}, teamId=${health.envVars.teamId}\n`
          if (health.error) text += `  Health check error: ${health.error}\n`
        } catch {}
        text += "\n"
      } else if (logs.length > 0) {
        const errors = logs.filter(l =>
          l.level === "error" ||
          l.message.toLowerCase().includes("error") ||
          l.message.includes("FATAL") ||
          (l.statusCode && l.statusCode >= 500)
        )
        const warnings = logs.filter(l =>
          l.level === "warning" ||
          l.message.toLowerCase().includes("timeout") ||
          l.message.toLowerCase().includes("rate limit") ||
          (l.statusCode && l.statusCode >= 400 && l.statusCode < 500)
        )

        if (errors.length > 0) {
          text += `🔴 ERRORS IN LAST 30 MIN (${errors.length}):\n`
          for (const e of errors.slice(0, 15)) {
            text += `  [${e.timestamp}] ${e.path || ""} ${e.statusCode ? `(${e.statusCode})` : ""}\n`
            text += `    ${e.message}\n`
          }
          text += "\n"
        }

        if (warnings.length > 0) {
          text += `🟡 WARNINGS (${warnings.length}):\n`
          for (const w of warnings.slice(0, 10)) {
            text += `  [${w.timestamp}] ${w.path || ""}: ${w.message}\n`
          }
          text += "\n"
        }

        if (errors.length === 0 && warnings.length === 0) {
          text += "✅ No errors or warnings in the last 30 minutes.\n\n"
        }

        // Show recent function calls for context
        const recentCalls = logs.filter(l => l.path).slice(0, 10)
        if (recentCalls.length > 0) {
          text += "RECENT API CALLS:\n"
          for (const r of recentCalls) {
            text += `  [${r.timestamp}] ${r.path} → ${r.statusCode || "ok"}\n`
          }
          text += "\n"
        }
      } else {
        text += "No log entries in the last 30 minutes.\n"
      }
    } catch {}

    sections.push(text)
  }

  // ── CODEBASE ACCESS ──
  if (query.codebase) {
    let text = "CODEBASE ACCESS:\n\n"
    const msgRaw = (query as any)._userMessage || ""
    const msgLower = msgRaw.toLowerCase()

    // Always show recent commits for context
    try {
      const { commits, error } = await getRecentCommits({ limit: 10 })
      if (error) {
        text += `⚠ GitHub unavailable: ${error}\n`
      } else if (commits.length > 0) {
        text += "RECENT COMMITS:\n"
        for (const c of commits) {
          text += `  ${c.sha} · ${c.date ? new Date(c.date).toLocaleDateString() : ""} · ${c.author} · ${c.message}\n`
        }
        text += "\n"
      }
    } catch {}

    // If asking about a specific file
    const filePathMatch = msgRaw.match(/(?:src\/[^\s"']+\.tsx?|prisma\/[^\s"']+)/i)
    if (filePathMatch) {
      try {
        const { content, size, error } = await getFileContents(filePathMatch[0], { maxLength: 6000 })
        if (error) {
          text += `⚠ Could not read ${filePathMatch[0]}: ${error}\n`
        } else {
          text += `FILE: ${filePathMatch[0]} (${size} bytes):\n`
          text += "```\n" + content + "\n```\n\n"
        }
      } catch {}
    }

    // If user is asking "was X implemented" or "does the code have X"
    if (msgLower.match(/implement|built|exist|have.*feature|does.*code|was.*added|is.*there/)) {
      const searchQuery = msgRaw
        .replace(/was|is|does|the|code|have|implement|built|feature|added|there|it|a|an|for|in|our/gi, "")
        .trim()
        .split(/\s+/)
        .filter((w: string) => w.length > 3)
        .slice(0, 3)
        .join(" ")

      if (searchQuery.length > 3) {
        try {
          const { results, totalCount, error } = await searchCode(searchQuery, {
            extension: "ts",
            path: "src",
            maxResults: 5,
          })
          if (!error && results.length > 0) {
            text += `CODE SEARCH: "${searchQuery}" (${totalCount} matches):\n`
            for (const r of results) {
              text += `  📄 ${r.file}\n`
              for (const m of r.matches.slice(0, 2)) {
                text += `     ...${m.substring(0, 150)}...\n`
              }
            }
            text += "\n"
          } else if (!error) {
            text += `CODE SEARCH: "${searchQuery}" — no matches found in src/\n\n`
          }
        } catch {}
      }
    }

    // If asking about project structure
    if (msgLower.match(/structure|file tree|how.*organized|what files|project layout/)) {
      try {
        const { files } = await getFileTree()
        if (files.length > 0) {
          const dirs: Record<string, number> = {}
          for (const f of files) {
            const topDir = f.split("/").slice(0, 3).join("/")
            dirs[topDir] = (dirs[topDir] || 0) + 1
          }
          text += `PROJECT STRUCTURE (${files.length} source files):\n`
          const sortedDirs = Object.entries(dirs).sort((a, b) => b[1] - a[1])
          for (const [dir, count] of sortedDirs.slice(0, 30)) {
            text += `  ${dir}${count > 1 ? ` (${count} files)` : ""}\n`
          }
          text += "\n"
        }
      } catch {}
    }

    // If asking about what changed recently
    if (msgLower.match(/what.*changed|recent.*change|diff|what.*deploy|last.*push|last.*commit/)) {
      try {
        const { commits } = await getRecentCommits({ limit: 3 })
        for (const c of commits.slice(0, 2)) {
          const details = await getCommitDetails(c.sha)
          if (details.files.length > 0) {
            text += `COMMIT ${c.sha}: ${details.message}\n`
            text += `  Changed files:\n`
            for (const f of details.files.slice(0, 15)) {
              text += `    ${f.status === "added" ? "+" : f.status === "removed" ? "-" : "~"} ${f.filename}\n`
            }
            if (details.files.length > 15) text += `    ... and ${details.files.length - 15} more\n`
            text += "\n"
          }
        }
      } catch {}
    }

    sections.push(text)
  }

  if (sections.length === 0) return ""

  return "\n\nLIVE PLATFORM DATA (current as of this moment):\n" +
    sections.join("\n") +
    "\nUse this data to answer the practitioner's question accurately. " +
    "Reference specific case numbers, dates, and names from the data.\n"
}
