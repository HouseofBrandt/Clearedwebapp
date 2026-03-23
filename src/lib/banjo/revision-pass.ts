import { prisma } from "@/lib/db"
import { callClaude } from "@/lib/ai/client"
import { loadPrompt } from "@/lib/ai/prompts"

interface CompletedDeliverable {
  step: number
  taskId: string
  output: string
  label: string
}

export async function runRevisionPass(
  assignmentId: string,
  completedTasks: CompletedDeliverable[],
  model: string
): Promise<{ revisedCount: number; summary: string }> {
  const revisionPrompt = loadPrompt("banjo_revision_v1")

  // Build the review message with all deliverable outputs
  let userMessage = "DELIVERABLES TO REVIEW:\n\n"
  for (const task of completedTasks) {
    userMessage += `=== DELIVERABLE ${task.step}: ${task.label} ===\n`
    userMessage += task.output
    userMessage += `\n=== END DELIVERABLE ${task.step} ===\n\n`
  }

  const response = await callClaude({
    systemPrompt: revisionPrompt,
    userMessage,
    model,
    temperature: 0.1,
    maxTokens: 16384,
  })

  let result: any
  try {
    result = JSON.parse(response.content)
  } catch {
    const match = response.content.match(/\{[\s\S]*\}/)
    if (match) {
      result = JSON.parse(match[0])
    } else {
      throw new Error("Revision pass did not return valid JSON")
    }
  }

  const revisedTaskIds: string[] = []

  if (result.overallAssessment === "REVISED" && result.revisions?.length > 0) {
    for (const revision of result.revisions) {
      const task = completedTasks.find((t) => t.step === revision.stepNumber)
      if (!task) continue

      await prisma.aITask.update({
        where: { id: task.taskId },
        data: {
          detokenizedOutput: revision.revisedOutput,
        },
      })

      revisedTaskIds.push(task.taskId)
    }
  }

  await prisma.banjoAssignment.update({
    where: { id: assignmentId },
    data: {
      revisionRan: true,
      revisionResult: result.summary || "No issues found",
      revisedTaskIds: revisedTaskIds.length > 0 ? revisedTaskIds : undefined,
    },
  })

  return {
    revisedCount: revisedTaskIds.length,
    summary: result.summary || "No issues found",
  }
}
