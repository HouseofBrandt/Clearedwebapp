/**
 * Reasoning Layer — Configuration
 *
 * Toggleable per task type and globally. Supports shadow mode
 * for rollout (evaluate but still deliver original draft).
 */

import type { TaskType } from "./task-types"

export interface PipelineConfig {
  enabled: boolean
  shadowMode: boolean
  enabledTaskTypes: TaskType[]
  minPassScore: number
  autoReviseEnabled: boolean
  thinkingBudget: number
  evaluatorModel: string
  logThinkingContent: boolean
}

export function getPipelineConfig(): PipelineConfig {
  return {
    enabled: process.env.REASONING_PIPELINE_ENABLED === "true",
    shadowMode: process.env.REASONING_SHADOW_MODE === "true",
    enabledTaskTypes: (process.env.REASONING_ENABLED_TASK_TYPES || "case_summary")
      .split(",")
      .map((s) => s.trim()) as TaskType[],
    minPassScore: parseInt(process.env.REASONING_MIN_PASS_SCORE || "75", 10),
    autoReviseEnabled: process.env.REASONING_AUTO_REVISE_ENABLED !== "false",
    thinkingBudget: parseInt(process.env.REASONING_THINKING_BUDGET || "10000", 10),
    evaluatorModel: process.env.REASONING_EVALUATOR_MODEL || "claude-sonnet-4-20250514",
    logThinkingContent: process.env.REASONING_LOG_THINKING_CONTENT !== "false",
  }
}

/**
 * Check if the pipeline should run for a given task type.
 * Returns { shouldRun, shadowMode } so callers know whether
 * to gate delivery or just log.
 */
export function shouldRunPipeline(taskType: TaskType): {
  shouldRun: boolean
  shadowMode: boolean
} {
  const config = getPipelineConfig()

  if (!config.enabled) {
    return { shouldRun: false, shadowMode: false }
  }

  if (!config.enabledTaskTypes.includes(taskType)) {
    return { shouldRun: false, shadowMode: false }
  }

  return {
    shouldRun: true,
    shadowMode: config.shadowMode,
  }
}
