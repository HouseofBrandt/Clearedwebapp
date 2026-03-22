import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"
import { scrubForKnowledgeBase } from "@/lib/knowledge/scrub"
import { formatDate } from "@/lib/date-utils"
import { TASK_TYPE_LABELS, CASE_TYPE_LABELS } from "@/types"

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const body = await request.json()
  const { taskId } = body

  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 })
  }

  const task = await prisma.aITask.findUnique({
    where: { id: taskId },
    include: {
      case: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
    },
  })

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  if (task.status !== "APPROVED") {
    return NextResponse.json({ error: "Only approved tasks can be added to the knowledge base" }, { status: 400 })
  }
  if (!task.detokenizedOutput) {
    return NextResponse.json({ error: "Task has no output" }, { status: 400 })
  }

  // Scrub PII
  const scrubbed = scrubForKnowledgeBase(
    task.detokenizedOutput,
    task.case.clientName,
    task.case.caseNumber
  )

  const taskLabel = TASK_TYPE_LABELS[task.taskType as keyof typeof TASK_TYPE_LABELS] || task.taskType
  const caseTypeLabel = CASE_TYPE_LABELS[task.case.caseType as keyof typeof CASE_TYPE_LABELS] || task.case.caseType
  const date = formatDate(task.createdAt, { month: "short", day: "numeric", year: "numeric" })

  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: `${taskLabel} — ${task.case.caseNumber} (${date})`,
      description: `Approved ${taskLabel.toLowerCase()} for ${caseTypeLabel} case. Added to knowledge base by ${auth.name}.`,
      category: "APPROVED_OUTPUT",
      sourceText: scrubbed,
      tags: [
        task.taskType.toLowerCase().replace(/_/g, "-"),
        task.case.caseType.toLowerCase(),
        "approved-output",
      ],
      uploadedById: auth.userId,
      sourceTaskId: task.id,
      sourceCaseId: task.case.id,
    },
  })

  const result = await ingestDocument(doc.id, scrubbed)

  return NextResponse.json({
    id: doc.id,
    title: doc.title,
    chunksCreated: result.chunksCreated,
    warning: result.error,
  }, { status: 201 })
}
