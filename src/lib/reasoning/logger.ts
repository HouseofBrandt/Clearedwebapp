/**
 * Reasoning Layer — Pipeline Logger
 *
 * Persists every pipeline run to the database for auditability.
 * Includes thinking content, evaluation results, and timing data.
 */

import { prisma } from "@/lib/db"
import { getPipelineConfig } from "./config"
import type { GenerationOutput, PipelineResult } from "./types"

/**
 * Persist a pipeline run to the ReasoningPipelineLog table.
 * Called asynchronously — should not block delivery.
 */
export async function persistPipelineLog(
  input: GenerationOutput,
  result: PipelineResult,
  caseId?: string,
  revisedDraft?: string
): Promise<string | null> {
  const config = getPipelineConfig()

  const firstEval = result.evaluations[0]
  const secondEval = result.evaluations[1]

  if (!firstEval) {
    // No evaluation was run — nothing to log
    return null
  }

  try {
    const log = await prisma.reasoningPipelineLog.create({
      data: {
        caseId: caseId || null,
        taskType: input.taskType,
        originalRequest: input.originalRequest,
        generationModel: input.model,
        evaluationModel: firstEval._meta?.evaluationModel || config.evaluatorModel,

        originalDraft: input.draft,
        revisedDraft: revisedDraft || null,
        finalOutput: result.finalOutput,

        firstEvaluation: firstEval as any,
        secondEvaluation: secondEval ? (secondEval as any) : undefined,

        firstThinkingContent: config.logThinkingContent
          ? (firstEval._meta?.thinkingContent || "")
          : "[thinking content logging disabled]",
        secondThinkingContent: secondEval && config.logThinkingContent
          ? (secondEval._meta?.thinkingContent || "")
          : secondEval
            ? "[thinking content logging disabled]"
            : null,

        decision: result.decision,
        overallScore: firstEval.overall_score,
        revisionAttempted: result.revisionAttempted,
        deliveredToUser: result.deliveredToUser,
        totalLatencyMs: result.totalLatencyMs,
      },
    })

    console.log(
      `[Reasoning] Pipeline log saved: ${log.id} | ${input.taskType} | ${result.decision} | score=${firstEval.overall_score} | ${result.totalLatencyMs}ms`
    )

    return log.id
  } catch (e: any) {
    console.error("[Reasoning] Failed to persist pipeline log:", e.message)
    return null
  }
}

/**
 * Record a human review resolution on an existing pipeline log.
 */
export async function recordHumanReview(
  logId: string,
  reviewedBy: string,
  action: "approved" | "rejected" | "edited",
  notes?: string,
  editedOutput?: string
): Promise<void> {
  try {
    await prisma.reasoningPipelineLog.update({
      where: { id: logId },
      data: {
        humanReviewedBy: reviewedBy,
        humanReviewedAt: new Date(),
        humanReviewAction: action,
        humanReviewNotes: notes || null,
        deliveredToUser: action === "approved" || action === "edited",
        ...(editedOutput ? { finalOutput: editedOutput } : {}),
      },
    })
  } catch (e: any) {
    console.error("[Reasoning] Failed to record human review:", e.message)
  }
}
