import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { encryptField } from "@/lib/encryption"
import { z } from "zod"
import { formatDate } from "@/lib/date-utils"
import { scrubForKnowledgeBase } from "@/lib/knowledge/scrub"
import { searchKnowledge } from "@/lib/knowledge/search"
import { canAccessCase } from "@/lib/auth/case-access"

const VALID_KB_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
] as const
type KnowledgeCategory = typeof VALID_KB_CATEGORIES[number]

const actionSchema = z.object({
  action: z.enum([
    "GENERATE_DOCUMENT_REQUEST",
    "UPDATE_CASE_STATUS",
    "CREATE_DEADLINE",
    "UPDATE_IRS_STATUS",
    "ADD_CASE_NOTE",
    "CREATE_BANJO_ASSIGNMENT",
    "ADD_TO_KNOWLEDGE_BASE",
    "SEARCH_KNOWLEDGE_BASE",
  ]),
  caseId: z.string().optional(),
  payload: z.record(z.string(), z.any()),
})

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { action, caseId, payload } = parsed.data

  // Case verification — only required for case-specific actions
  const CASE_REQUIRED_ACTIONS = [
    "GENERATE_DOCUMENT_REQUEST", "UPDATE_CASE_STATUS", "CREATE_DEADLINE",
    "UPDATE_IRS_STATUS", "ADD_CASE_NOTE", "CREATE_BANJO_ASSIGNMENT",
  ]

  if (CASE_REQUIRED_ACTIONS.includes(action)) {
    if (!caseId) {
      return NextResponse.json({ error: "caseId is required for this action" }, { status: 400 })
    }
    const caseExists = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } })
    if (!caseExists) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }
    const hasAccess = await canAccessCase(auth.userId, caseId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Narrowed caseId for case-specific actions (validated above).
  // Only used in case-requiring branches where the guard has already returned if undefined.
  const resolvedCaseId = caseId ?? ""

  try {
    switch (action) {
      case "GENERATE_DOCUMENT_REQUEST": {
        const { clientName, missingDocs, message } = payload as any

        let letterContent = `DOCUMENT REQUEST\n\n`
        letterContent += `To: ${clientName || "Client"}\n`
        letterContent += `From: ${auth.name}\n`
        letterContent += `Date: ${formatDate(new Date())}\n`
        letterContent += `Re: Documents Needed for Tax Resolution\n\n`
        letterContent += `Dear ${(clientName || "Client").split(" ")[0]},\n\n`
        letterContent += `In order to proceed with your tax resolution case, we need the following documents at your earliest convenience:\n\n`

        const docs = Array.isArray(missingDocs) ? missingDocs : []
        let num = 1
        for (const doc of docs.filter((d: any) => d.critical)) {
          letterContent += `${num}. ${doc.label} — REQUIRED\n`
          num++
        }
        const optional = docs.filter((d: any) => !d.critical)
        if (optional.length > 0) {
          letterContent += `\nThe following would also be helpful if available:\n\n`
          for (const doc of optional) {
            letterContent += `${num}. ${doc.label}\n`
            num++
          }
        }

        letterContent += `\nPlease send these documents to our secure portal or bring them to your next appointment.\n\n`
        letterContent += `If you have questions about any item on this list, please don't hesitate to call.\n\n`
        letterContent += `Sincerely,\n${auth.name}\n`

        const task = await prisma.aITask.create({
          data: {
            caseId: resolvedCaseId,
            taskType: "CASE_MEMO",
            status: "APPROVED",
            detokenizedOutput: encryptField(letterContent),
            modelUsed: "practitioner-generated",
            createdById: auth.userId,
          },
        })

        await prisma.reviewAction.create({
          data: {
            aiTaskId: task.id,
            practitionerId: auth.userId,
            action: "APPROVE",
            reviewNotes: "Auto-approved: Document request generated via Junebug",
            reviewStartedAt: new Date(),
            reviewCompletedAt: new Date(),
          },
        })

        await prisma.caseActivity.create({
          data: {
            caseId: resolvedCaseId,
            userId: auth.userId,
            action: "DOCUMENT_REQUESTED",
            description: `${auth.name} generated a document request list with ${docs.length} items via Junebug`,
            metadata: { taskId: task.id, missingDocs: docs },
          },
        })

        await prisma.caseIntelligence.upsert({
          where: { caseId: resolvedCaseId },
          create: {
            caseId: resolvedCaseId,
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: "Generated document request list",
          },
          update: {
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: "Generated document request list",
          },
        })

        return NextResponse.json({
          success: true,
          taskId: task.id,
          message: `Document request created with ${docs.length} items — added to Deliverables`,
        })
      }

      case "UPDATE_CASE_STATUS": {
        const { phase, notes } = payload as any

        await prisma.caseIntelligence.upsert({
          where: { caseId: resolvedCaseId },
          create: {
            caseId: resolvedCaseId,
            resolutionPhase: phase,
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: `Status updated to ${phase}`,
          },
          update: {
            resolutionPhase: phase,
            lastActivityDate: new Date(),
            lastActivityBy: auth.name,
            lastActivityAction: `Status updated to ${phase}`,
          },
        })

        await prisma.caseActivity.create({
          data: {
            caseId: resolvedCaseId,
            userId: auth.userId,
            action: "STATUS_CHANGED",
            description: `${auth.name} updated case phase to "${phase}"${notes ? `: ${notes}` : ""}`,
            metadata: { newPhase: phase, notes },
          },
        })

        return NextResponse.json({ success: true })
      }

      case "CREATE_DEADLINE": {
        const deadline = await prisma.deadline.create({
          data: {
            caseId: resolvedCaseId,
            type: (payload.type || "CUSTOM") as any,
            title: payload.title,
            dueDate: new Date(payload.dueDate),
            priority: (payload.priority || "MEDIUM") as any,
            description: payload.description,
            status: "UPCOMING",
            assignedToId: auth.userId,
            createdById: auth.userId,
          },
        })

        await prisma.caseActivity.create({
          data: {
            caseId: resolvedCaseId,
            userId: auth.userId,
            action: "DEADLINE_CREATED",
            description: `${auth.name} created deadline: ${payload.title} (due ${payload.dueDate})`,
            metadata: { deadlineId: deadline.id },
          },
        })

        return NextResponse.json({ success: true, deadlineId: deadline.id })
      }

      case "UPDATE_IRS_STATUS": {
        const irsUpdates: any = {}
        if (payload.irsLastAction) irsUpdates.irsLastAction = payload.irsLastAction
        if (payload.irsLastActionDate) irsUpdates.irsLastActionDate = new Date(payload.irsLastActionDate)
        if (payload.irsAssignedUnit) irsUpdates.irsAssignedUnit = payload.irsAssignedUnit
        if (payload.irsAssignedEmployee) irsUpdates.irsAssignedEmployee = payload.irsAssignedEmployee

        await prisma.caseIntelligence.upsert({
          where: { caseId: resolvedCaseId },
          create: { caseId: resolvedCaseId, ...irsUpdates },
          update: irsUpdates,
        })

        await prisma.caseActivity.create({
          data: {
            caseId: resolvedCaseId,
            userId: auth.userId,
            action: "STATUS_CHANGED",
            description: `${auth.name} updated IRS status: ${payload.irsLastAction || payload.notes || "updated"}`,
            metadata: payload,
          },
        })

        return NextResponse.json({ success: true })
      }

      case "ADD_CASE_NOTE": {
        await prisma.caseActivity.create({
          data: {
            caseId: resolvedCaseId,
            userId: auth.userId,
            action: "NOTE_ADDED",
            description: `${auth.name}: ${payload.note}`,
            metadata: { note: payload.note },
          },
        })

        return NextResponse.json({ success: true })
      }

      case "CREATE_BANJO_ASSIGNMENT": {
        const { assignmentText, casePosture } = payload as any

        // Create the Banjo assignment via the plan API
        const planRes = await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/banjo/plan`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({ caseId: resolvedCaseId, assignmentText, casePosture }),
        })

        if (!planRes.ok) {
          const err = await planRes.json()
          return NextResponse.json({ error: err.error || "Banjo plan failed" }, { status: 500 })
        }

        const planData = await planRes.json()

        return NextResponse.json({
          success: true,
          assignmentId: planData.assignmentId,
          status: planData.status,
          plan: planData.plan,
          questions: planData.questions,
          message: planData.status === "clarifying"
            ? `Banjo has ${planData.questions?.length || 0} question(s) before it starts. Opening the Banjo tab...`
            : `Banjo has a plan with ${planData.plan?.deliverables?.length || 0} deliverable(s). Opening the Banjo tab for your approval...`,
          redirectTo: `/cases/${resolvedCaseId}#banjo`,
        })
      }

      case "ADD_TO_KNOWLEDGE_BASE": {
        const { title, category, content, tags } = payload as any
        const scrubbed = scrubForKnowledgeBase(content || "", "", "")

        const doc = await prisma.knowledgeDocument.create({
          data: {
            title: title || "Untitled KB Entry",
            category: (VALID_KB_CATEGORIES.includes(category as KnowledgeCategory) ? category : "CUSTOM") as KnowledgeCategory,
            sourceText: scrubbed,
            sourceType: "JUNEBUG_CURATED",
            tags: tags || [],
            uploadedById: auth.userId,
          },
        })

        // Chunk and embed (fire-and-forget)
        try {
          const { ingestDocument } = await import("@/lib/knowledge/ingest")
          await ingestDocument(doc.id, scrubbed)
        } catch { /* non-fatal */ }

        return NextResponse.json({
          success: true,
          documentId: doc.id,
          message: `Added "${title}" to the Knowledge Base.`,
        })
      }

      case "SEARCH_KNOWLEDGE_BASE": {
        const results = await searchKnowledge(payload.query || "", { topK: 5 })
        return NextResponse.json({
          success: true,
          results: results.map((r) => ({
            title: r.documentTitle,
            category: r.documentCategory,
            preview: r.content.substring(0, 300),
            score: r.score,
          })),
          message: results.length > 0
            ? `Found ${results.length} relevant KB entries.`
            : `No relevant results. This might be a knowledge gap worth filling.`,
        })
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[ChatActions] Error:", error.message)
    return NextResponse.json({ error: "Action failed" }, { status: 500 })
  }
}
