/**
 * Reasoning Layer — Integration Wrappers
 *
 * Convenience functions to wrap existing AI generation points
 * with the reasoning pipeline. Handles task type mapping,
 * shadow mode, and graceful fallback.
 */

import { runReasoningPipeline } from "./pipeline"
import { shouldRunPipeline } from "./config"
import { callClaude } from "@/lib/ai/client"
import type { TaskType } from "./task-types"
import type { GenerationOutput, PipelineResult } from "./types"

// Map Banjo/AITask task types to reasoning task types
const BANJO_TO_REASONING: Record<string, TaskType> = {
  WORKING_PAPERS: "transcript_analysis",
  CASE_MEMO: "case_memo",
  PENALTY_LETTER: "client_letter",
  OIC_NARRATIVE: "form_narrative",
  GENERAL_ANALYSIS: "internal_memo",
  IA_ANALYSIS: "resolution_recommendation",
  CNC_ANALYSIS: "resolution_recommendation",
  TFRP_ANALYSIS: "internal_memo",
  INNOCENT_SPOUSE_ANALYSIS: "internal_memo",
  APPEALS_REBUTTAL: "internal_memo",
  CASE_SUMMARY: "case_summary",
  RISK_ASSESSMENT: "internal_memo",
  WEB_RESEARCH: "general",
}

/**
 * Wrap a completed Banjo deliverable through the reasoning pipeline.
 * Returns the (possibly revised) output and the pipeline decision.
 *
 * If the pipeline is disabled or the task type is excluded,
 * returns the original output unchanged.
 */
export async function evaluateBanjoDeliverable(opts: {
  draft: string
  banjoTaskType: string
  originalRequest: string
  sourceContext: string
  model: string
  caseId?: string
}): Promise<{
  output: string
  pipelineDecision: "pass" | "revise" | "human_review" | "skipped"
  pipelineScore: number | null
  pipelineResult: PipelineResult | null
}> {
  const taskType = BANJO_TO_REASONING[opts.banjoTaskType] || "general"
  const { shouldRun, shadowMode } = shouldRunPipeline(taskType)

  if (!shouldRun) {
    return {
      output: opts.draft,
      pipelineDecision: "skipped",
      pipelineScore: null,
      pipelineResult: null,
    }
  }

  const generationOutput: GenerationOutput = {
    draft: opts.draft,
    taskType,
    originalRequest: opts.originalRequest,
    sourceContext: opts.sourceContext.slice(0, 15000), // cap source context to avoid huge eval prompts
    model: opts.model,
    generatedAt: new Date().toISOString(),
    metadata: { banjoTaskType: opts.banjoTaskType },
  }

  try {
    const result = await runReasoningPipeline(
      generationOutput,
      async (revisionPrompt) => {
        const response = await callClaude({
          systemPrompt: revisionPrompt,
          userMessage: "Produce the revised output now.",
          model: opts.model,
        })
        return response.content
      },
      opts.caseId
    )

    // In shadow mode, always return the original draft
    if (shadowMode) {
      return {
        output: opts.draft,
        pipelineDecision: result.decision,
        pipelineScore: result.evaluations[0]?.overall_score ?? null,
        pipelineResult: result,
      }
    }

    return {
      output: result.finalOutput,
      pipelineDecision: result.decision,
      pipelineScore: result.evaluations[0]?.overall_score ?? null,
      pipelineResult: result,
    }
  } catch (e: any) {
    console.error("[Reasoning] Pipeline failed, passing through:", e.message)
    return {
      output: opts.draft,
      pipelineDecision: "skipped",
      pipelineScore: null,
      pipelineResult: null,
    }
  }
}

/**
 * Wrap a non-streaming AI text output through the reasoning pipeline.
 * Generic version for any integration point.
 */
export async function evaluateAIOutput(opts: {
  draft: string
  taskType: TaskType
  originalRequest: string
  sourceContext: string
  model: string
  caseId?: string
}): Promise<{
  output: string
  pipelineDecision: "pass" | "revise" | "human_review" | "skipped"
  pipelineScore: number | null
}> {
  const { shouldRun, shadowMode } = shouldRunPipeline(opts.taskType)

  if (!shouldRun) {
    return { output: opts.draft, pipelineDecision: "skipped", pipelineScore: null }
  }

  const generationOutput: GenerationOutput = {
    draft: opts.draft,
    taskType: opts.taskType,
    originalRequest: opts.originalRequest,
    sourceContext: opts.sourceContext.slice(0, 15000),
    model: opts.model,
    generatedAt: new Date().toISOString(),
  }

  try {
    const result = await runReasoningPipeline(
      generationOutput,
      async (revisionPrompt) => {
        const response = await callClaude({
          systemPrompt: revisionPrompt,
          userMessage: "Produce the revised output now.",
          model: opts.model,
        })
        return response.content
      },
      opts.caseId
    )

    if (shadowMode) {
      return {
        output: opts.draft,
        pipelineDecision: result.decision,
        pipelineScore: result.evaluations[0]?.overall_score ?? null,
      }
    }

    return {
      output: result.finalOutput,
      pipelineDecision: result.decision,
      pipelineScore: result.evaluations[0]?.overall_score ?? null,
    }
  } catch (e: any) {
    console.error("[Reasoning] Pipeline failed, passing through:", e.message)
    return { output: opts.draft, pipelineDecision: "skipped", pipelineScore: null }
  }
}
