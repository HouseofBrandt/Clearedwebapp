import { prisma } from "@/lib/db"
import { scrubForKnowledgeBase } from "@/lib/knowledge/scrub"

/**
 * Automatically ingests an approved AI task output into the Knowledge Base.
 * Called after a practitioner approves a deliverable.
 * PII is scrubbed before ingestion. Duplicate ingestion is prevented.
 */
export async function autoIngestToKnowledgeBase(
  task: { id: string; taskType: string; caseId: string; detokenizedOutput: string | null },
  userId: string
): Promise<void> {
  // Skip if task has no meaningful output
  if (!task.detokenizedOutput || task.detokenizedOutput.length < 200) return

  // Skip JSON-structured outputs (working papers) — they don't make good KB entries as prose
  if (task.detokenizedOutput.startsWith("{") && task.taskType === "WORKING_PAPERS") return

  // Skip if already in KB (check sourceTaskId)
  const existing = await prisma.knowledgeDocument.findFirst({
    where: { sourceTaskId: task.id, isActive: true },
  })
  if (existing) return

  // Get case info for scrubbing
  const caseInfo = await prisma.case.findUnique({
    where: { id: task.caseId },
    select: { clientName: true, tabsNumber: true, caseType: true },
  })
  if (!caseInfo) return

  // Scrub PII
  const scrubbed = scrubForKnowledgeBase(
    task.detokenizedOutput,
    caseInfo.clientName,
    caseInfo.tabsNumber
  )

  // Create KB document
  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: `${task.taskType.replace(/_/g, " ")} \u2014 ${caseInfo.caseType} Case (auto)`,
      description: `Automatically ingested from approved ${task.taskType.replace(/_/g, " ")} output.`,
      category: "APPROVED_OUTPUT",
      sourceText: scrubbed,
      sourceType: "APPROVED_OUTPUT",
      tags: [
        task.taskType.toLowerCase().replace(/_/g, "-"),
        caseInfo.caseType.toLowerCase(),
        "auto-ingested",
      ],
      uploadedById: userId,
      sourceTaskId: task.id,
      sourceCaseId: task.caseId,
    },
  })

  // Chunk and embed (fire-and-forget)
  try {
    const { ingestDocument } = await import("@/lib/knowledge/ingest")
    await ingestDocument(doc.id, scrubbed)
  } catch (e: any) {
    console.warn("[AutoIngest] KB ingestion failed (non-blocking):", e.message)
  }
}
