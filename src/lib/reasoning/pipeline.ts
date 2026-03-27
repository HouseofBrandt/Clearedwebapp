/**
 * Reasoning Layer — Pipeline Orchestrator
 *
 * The main entry point: generate → evaluate → (optionally revise) → deliver.
 * Maximum ONE auto-revision attempt. Hallucinations go straight to human review.
 */

import { evaluateDraft } from "./evaluator"
import { buildRevisionPrompt } from "./refiner"
import { getPipelineConfig, shouldRunPipeline } from "./config"
import { persistPipelineLog } from "./logger"
import type { GenerationOutput, EvaluationResult, PipelineResult } from "./types"

/**
 * Run the full reasoning pipeline on a generation output.
 *
 * @param input - The draft output from the generation phase
 * @param generateRevision - Injected function to regenerate with revision instructions
 * @param caseId - Optional case ID for logging
 */
export async function runReasoningPipeline(
  input: GenerationOutput,
  generateRevision: (prompt: string) => Promise<string>,
  caseId?: string
): Promise<PipelineResult> {
  const config = getPipelineConfig()
  const { shouldRun, shadowMode } = shouldRunPipeline(input.taskType)

  // If pipeline is disabled for this task type, pass through
  if (!shouldRun) {
    return {
      finalOutput: input.draft,
      decision: "pass",
      evaluations: [],
      revisionAttempted: false,
      totalLatencyMs: 0,
      deliveredToUser: true,
    }
  }

  const startTime = Date.now()
  const evaluations: EvaluationResult[] = []

  // ── First evaluation ──────────────────────────────────────────
  let firstEval: EvaluationResult
  try {
    firstEval = await evaluateDraft(input)
  } catch (e: any) {
    console.error("[Reasoning] First evaluation failed:", e.message)
    // If evaluation itself fails, pass through (don't block the user)
    return {
      finalOutput: input.draft,
      decision: "pass",
      evaluations: [],
      revisionAttempted: false,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: true,
    }
  }
  evaluations.push(firstEval)

  // Pass → deliver (or log in shadow mode)
  if (firstEval.decision === "pass") {
    const result: PipelineResult = {
      finalOutput: input.draft,
      decision: "pass",
      evaluations,
      revisionAttempted: false,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: true,
    }

    // Persist log asynchronously (don't block delivery)
    persistPipelineLog(input, result, caseId).catch((e) =>
      console.error("[Reasoning] Log persistence failed:", e.message)
    )

    return result
  }

  // Human review → do not auto-revise
  if (firstEval.decision === "human_review" || !firstEval.safe_to_autorevise) {
    const result: PipelineResult = {
      finalOutput: input.draft,
      decision: "human_review",
      evaluations,
      revisionAttempted: false,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: shadowMode, // in shadow mode, still deliver
    }

    persistPipelineLog(input, result, caseId).catch((e) =>
      console.error("[Reasoning] Log persistence failed:", e.message)
    )

    return result
  }

  // ── Revision attempt ──────────────────────────────────────────
  if (!config.autoReviseEnabled) {
    // Auto-revise disabled — route to human review
    const result: PipelineResult = {
      finalOutput: input.draft,
      decision: "human_review",
      evaluations,
      revisionAttempted: false,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: shadowMode,
    }

    persistPipelineLog(input, result, caseId).catch((e) =>
      console.error("[Reasoning] Log persistence failed:", e.message)
    )

    return result
  }

  let revisedDraft: string
  try {
    const revisionPrompt = buildRevisionPrompt(input, firstEval)
    revisedDraft = await generateRevision(revisionPrompt)
  } catch (e: any) {
    console.error("[Reasoning] Revision generation failed:", e.message)
    // Can't revise — route to human review
    const result: PipelineResult = {
      finalOutput: input.draft,
      decision: "human_review",
      evaluations,
      revisionAttempted: true,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: shadowMode,
    }

    persistPipelineLog(input, result, caseId).catch((e2) =>
      console.error("[Reasoning] Log persistence failed:", e2.message)
    )

    return result
  }

  // Create revised generation output for second evaluation
  const revisedInput: GenerationOutput = {
    ...input,
    draft: revisedDraft,
    generatedAt: new Date().toISOString(),
    metadata: {
      ...input.metadata,
      isRevision: true,
      previousScore: firstEval.overall_score,
    },
  }

  // ── Second evaluation ─────────────────────────────────────────
  let secondEval: EvaluationResult
  try {
    secondEval = await evaluateDraft(revisedInput)
  } catch (e: any) {
    console.error("[Reasoning] Second evaluation failed:", e.message)
    // Deliver the revised draft anyway — it was likely an improvement
    const result: PipelineResult = {
      finalOutput: revisedDraft,
      decision: "pass",
      evaluations,
      revisionAttempted: true,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: true,
    }

    persistPipelineLog(input, result, caseId, revisedDraft).catch((e2) =>
      console.error("[Reasoning] Log persistence failed:", e2.message)
    )

    return result
  }
  evaluations.push(secondEval)

  if (secondEval.decision === "pass") {
    const result: PipelineResult = {
      finalOutput: revisedDraft,
      decision: "pass",
      evaluations,
      revisionAttempted: true,
      totalLatencyMs: Date.now() - startTime,
      deliveredToUser: true,
    }

    persistPipelineLog(input, result, caseId, revisedDraft).catch((e) =>
      console.error("[Reasoning] Log persistence failed:", e.message)
    )

    return result
  }

  // Failed twice → human review regardless
  const result: PipelineResult = {
    finalOutput: revisedDraft,
    decision: "human_review",
    evaluations,
    revisionAttempted: true,
    totalLatencyMs: Date.now() - startTime,
    deliveredToUser: shadowMode,
  }

  persistPipelineLog(input, result, caseId, revisedDraft).catch((e) =>
    console.error("[Reasoning] Log persistence failed:", e.message)
  )

  return result
}
