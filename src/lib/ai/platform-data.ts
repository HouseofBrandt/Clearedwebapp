import { prisma } from "@/lib/db"
import { formatDate, formatDateTime } from "@/lib/date-utils"

interface DataQuery {
  deadlines?: boolean
  cases?: boolean
  reviewQueue?: boolean
  caseDetail?: string
  knowledgeBase?: boolean
  inbox?: boolean
  users?: boolean
  errors?: boolean
}

export function detectDataNeeds(message: string): DataQuery {
  const m = message.toLowerCase()
  const query: DataQuery = {}

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

  if (m.match(/error|bug|fail|broke|crash|not working|issue|problem/)) {
    query.errors = true
  }

  return query
}

export async function fetchPlatformData(
  query: DataQuery,
  userId: string
): Promise<string> {
  const sections: string[] = []

  if (query.deadlines) {
    const deadlines = await prisma.deadline.findMany({
      where: { status: { in: ["UPCOMING"] } },
      include: {
        case: { select: { caseNumber: true, clientName: true } },
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
        text += `  - ${d.title} (${d.case.caseNumber} · ${d.case.clientName}) — ${daysOver} days overdue · ${d.priority} · Assigned: ${d.assignedTo?.name || "Unassigned"}\n`
      }
    }
    if (upcoming.length > 0) {
      text += `Upcoming (${upcoming.length}):\n`
      for (const d of upcoming.slice(0, 10)) {
        const daysUntil = Math.floor((d.dueDate.getTime() - now.getTime()) / 86400000)
        text += `  - ${d.title} (${d.case.caseNumber} · ${d.case.clientName}) — in ${daysUntil} days · ${d.priority} · Assigned: ${d.assignedTo?.name || "Unassigned"}\n`
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
          caseNumber: true,
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
      text += `  - ${c.caseNumber}${c.tabsNumber ? ` · TABS ${c.tabsNumber}` : ""} · ${c.clientName} · ${c.caseType} · ${c.status}`
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
          { caseNumber: { equals: searchTerm, mode: "insensitive" } },
          { clientName: { contains: searchTerm, mode: "insensitive" } },
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
      let text = `CASE DETAIL — ${caseData.caseNumber}${caseData.tabsNumber ? ` (TABS: ${caseData.tabsNumber})` : ""}:\n`
      text += `Client: ${caseData.clientName}\n`
      text += `Type: ${caseData.caseType} · Status: ${caseData.status}\n`
      if (caseData.filingStatus) text += `Filing Status: ${caseData.filingStatus}\n`
      if (caseData.totalLiability) text += `Total Liability: $${Number(caseData.totalLiability).toLocaleString()}\n`
      if (caseData.clientEmail) text += `Email: ${caseData.clientEmail}\n`
      if (caseData.clientPhone) text += `Phone: ${caseData.clientPhone}\n`
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

      sections.push(text)
    } else {
      sections.push(`No case found matching "${searchTerm}".\n`)
    }
  }

  if (query.reviewQueue) {
    const tasks = await prisma.aITask.findMany({
      where: { status: "READY_FOR_REVIEW" },
      include: {
        case: { select: { caseNumber: true, clientName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    let text = `REVIEW QUEUE (${tasks.length} pending):\n`
    for (const t of tasks) {
      text += `  - ${t.taskType} · ${t.case.caseNumber} · ${t.case.clientName} · ${t.modelUsed || "pending"} · ${formatDate(t.createdAt)}\n`
    }
    if (tasks.length === 0) {
      text += "No tasks pending review.\n"
    }
    sections.push(text)
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

  if (sections.length === 0) return ""

  return "\n\nLIVE PLATFORM DATA (current as of this moment):\n" +
    sections.join("\n") +
    "\nUse this data to answer the practitioner's question accurately. " +
    "Reference specific case numbers, dates, and names from the data.\n"
}
