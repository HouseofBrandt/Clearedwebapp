import { prisma } from "@/lib/db"
import { JunebugRequest } from "./runtime"

export interface JunebugTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  requiredRole?: string[]
  execute: (input: any) => Promise<{ data?: string; action?: any }>
}

export function getAvailableTools(request: JunebugRequest): JunebugTool[] {
  const tools: JunebugTool[] = [
    // ── READ tools — always available ──────────────────────────
    {
      name: "get_case_summary",
      description: "Get a summary of a specific case including status, type, liability, deadlines, and document completeness",
      inputSchema: {
        type: "object",
        properties: { caseId: { type: "string", description: "Case ID or TABS number" } },
        required: ["caseId"],
      },
      execute: async (input) => {
        const caseData = await prisma.case.findFirst({
          where: { OR: [{ id: input.caseId }, { tabsNumber: input.caseId }] },
          include: {
            assignedPractitioner: { select: { name: true } },
            intelligence: true,
            _count: { select: { documents: true, aiTasks: true } },
            liabilityPeriods: { orderBy: { taxYear: "asc" } },
          },
        })
        if (!caseData) return { data: "Case not found." }

        const totalLiability = caseData.liabilityPeriods.reduce(
          (s, lp) => s + (Number(lp.totalBalance) || 0),
          0
        )
        const summary = [
          `Case ${caseData.tabsNumber}: ${caseData.clientName}`,
          `Type: ${caseData.caseType}`,
          `Status: ${caseData.status}`,
          `Liability: $${totalLiability.toLocaleString()}`,
          `Documents: ${caseData._count.documents}`,
          `AI Tasks: ${caseData._count.aiTasks}`,
          `Assigned: ${caseData.assignedPractitioner?.name || "Unassigned"}`,
        ].join(" | ")

        if (caseData.intelligence?.digest) {
          return { data: summary + "\n\nCase Intelligence:\n" + caseData.intelligence.digest }
        }
        return { data: summary }
      },
    },

    {
      name: "get_deadlines",
      description: "Get upcoming deadlines for a case or across all cases",
      inputSchema: {
        type: "object",
        properties: {
          caseId: { type: "string", description: "Case ID (optional — omit for all cases)" },
          days: { type: "number", description: "Number of days ahead to look (default 30)" },
        },
      },
      execute: async (input) => {
        const where: any = { status: { not: "COMPLETED" } }
        if (input.caseId) where.caseId = input.caseId
        const cutoff = new Date(Date.now() + (input.days || 30) * 86400000)
        where.dueDate = { lte: cutoff }

        const deadlines = await prisma.deadline.findMany({
          where,
          orderBy: { dueDate: "asc" },
          take: 10,
          include: { case: { select: { tabsNumber: true, clientName: true } } },
        })

        if (deadlines.length === 0) return { data: "No upcoming deadlines found." }
        return {
          data: deadlines
            .map((d) => {
              const days = Math.ceil(
                (new Date(d.dueDate).getTime() - Date.now()) / 86400000
              )
              return `${d.case?.tabsNumber || "?"}: ${d.title} — ${days <= 0 ? "OVERDUE" : `${days} days`} (${new Date(d.dueDate).toLocaleDateString()})`
            })
            .join("\n"),
        }
      },
    },

    {
      name: "get_review_queue",
      description: "Get pending items in the review queue",
      inputSchema: {
        type: "object",
        properties: {
          assigneeId: { type: "string", description: "Filter by assignee (optional)" },
        },
      },
      execute: async (input) => {
        const where: any = { status: "READY_FOR_REVIEW" }
        if (input.assigneeId) where.createdById = input.assigneeId

        const tasks = await prisma.aITask.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { case: { select: { tabsNumber: true, clientName: true } } },
        })

        if (tasks.length === 0) return { data: "No items pending review." }
        return {
          data:
            `${tasks.length} items pending review:\n` +
            tasks
              .map(
                (t) =>
                  `- ${t.case?.tabsNumber}: ${t.taskType} (${t.verifyFlagCount || 0} verify, ${t.judgmentFlagCount || 0} judgment flags)`
              )
              .join("\n"),
        }
      },
    },

    {
      name: "search_knowledge_base",
      description:
        "Search the firm's knowledge base for IRS procedures, case law, IRM citations, or training materials",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          category: {
            type: "string",
            description:
              "Category filter (optional): IRC_STATUTE, IRM_REFERENCE, CASE_LAW, TRAINING_MATERIAL, COURT_FILING, TREATISE",
          },
        },
        required: ["query"],
      },
      execute: async (input) => {
        try {
          const { searchKnowledge } = await import("@/lib/knowledge/search")
          const results = await searchKnowledge(input.query, {
            topK: 5,
            categoryFilter: input.category ? [input.category] : undefined,
          })
          if (!results.length) return { data: "No knowledge base results found." }
          return {
            data: results
              .map(
                (r: any) =>
                  `[${r.documentCategory || r.category}] ${r.documentTitle || r.title}: ${(r.content || "").slice(0, 200)}...`
              )
              .join("\n\n"),
          }
        } catch {
          return { data: "Knowledge base search unavailable." }
        }
      },
    },

    {
      name: "get_case_documents",
      description: "List documents uploaded to a case, including categories and completeness",
      inputSchema: {
        type: "object",
        properties: { caseId: { type: "string" } },
        required: ["caseId"],
      },
      execute: async (input) => {
        const docs = await prisma.document.findMany({
          where: { caseId: input.caseId },
          orderBy: { createdAt: "desc" },
          select: {
            fileName: true,
            documentCategory: true,
            fileType: true,
            createdAt: true,
          },
        })
        if (docs.length === 0) return { data: "No documents uploaded for this case." }
        return {
          data:
            `${docs.length} documents:\n` +
            docs
              .map(
                (d) =>
                  `- ${d.fileName} (${d.documentCategory}, ${d.fileType}, uploaded ${new Date(d.createdAt).toLocaleDateString()})`
              )
              .join("\n"),
        }
      },
    },

    {
      name: "get_client_notes",
      description: "Get notes and journal entries for a case",
      inputSchema: {
        type: "object",
        properties: {
          caseId: { type: "string" },
          noteType: {
            type: "string",
            description:
              "Filter by type: JOURNAL_ENTRY, CALL_LOG, IRS_CONTACT, STRATEGY_NOTE, CLIENT_INTERACTION, RESEARCH, GENERAL",
          },
        },
        required: ["caseId"],
      },
      execute: async (input) => {
        const where: any = { caseId: input.caseId, isDeleted: false }
        if (input.noteType) where.noteType = input.noteType
        const notes = await prisma.clientNote
          .findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { author: { select: { name: true } } },
          })
          .catch(() => [])
        if (notes.length === 0) return { data: "No notes found for this case." }
        return {
          data: notes
            .map(
              (n) =>
                `[${n.noteType}] ${n.title || "Untitled"} by ${n.author?.name} (${new Date(n.createdAt).toLocaleDateString()}):\n${n.content.slice(0, 200)}`
            )
            .join("\n\n"),
        }
      },
    },
  ]

  // ── ACTION tools — require practitioner role ────────────────
  if (["ADMIN", "SENIOR", "PRACTITIONER"].includes(request.userRole || "")) {
    tools.push(
      {
        name: "create_deadline",
        description: "Create a deadline for a case. Requires confirmation.",
        inputSchema: {
          type: "object",
          properties: {
            caseId: { type: "string" },
            title: { type: "string" },
            dueDate: { type: "string", description: "ISO date" },
            deadlineType: { type: "string" },
            priority: {
              type: "string",
              enum: ["LOW", "NORMAL", "HIGH", "CRITICAL"],
            },
          },
          required: ["caseId", "title", "dueDate"],
        },
        execute: async (input) => ({
          action: {
            label: `Create deadline: ${input.title}`,
            description: `Due: ${new Date(input.dueDate).toLocaleDateString()} | Priority: ${input.priority || "NORMAL"}`,
            data: input,
            requiresConfirmation: true,
          },
        }),
      },
      {
        name: "create_task",
        description: "Create a task assigned to a practitioner. Requires confirmation.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            assigneeId: { type: "string" },
            dueDate: { type: "string" },
            caseId: { type: "string" },
            priority: {
              type: "string",
              enum: ["low", "normal", "high", "urgent"],
            },
          },
          required: ["title"],
        },
        execute: async (input) => ({
          action: {
            label: `Create task: ${input.title}`,
            description: input.description || "",
            data: input,
            requiresConfirmation: true,
          },
        }),
      },
      {
        name: "add_case_note",
        description: "Add a note to a case. Requires confirmation.",
        inputSchema: {
          type: "object",
          properties: {
            caseId: { type: "string" },
            noteType: {
              type: "string",
              enum: [
                "JOURNAL_ENTRY",
                "CALL_LOG",
                "IRS_CONTACT",
                "STRATEGY_NOTE",
                "CLIENT_INTERACTION",
                "RESEARCH",
                "GENERAL",
              ],
            },
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["caseId", "content"],
        },
        execute: async (input) => ({
          action: {
            label: `Add ${input.noteType || "GENERAL"} note: ${input.title || "Untitled"}`,
            description: input.content.slice(0, 100),
            data: input,
            requiresConfirmation: true,
          },
        }),
      }
    )
  }

  return tools
}
