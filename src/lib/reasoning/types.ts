/**
 * Reasoning Layer — Type Definitions
 *
 * Core types for the generate → evaluate → refine pipeline.
 * Every AI-generated output flows through this pipeline before
 * reaching a practitioner.
 */

import type { TaskType } from "./task-types"

// ── Generation Output ─────────────────────────────────────────────

/** Shape returned by every generation function before evaluation. */
export interface GenerationOutput {
  draft: string
  taskType: TaskType
  originalRequest: string
  sourceContext: string
  model: string
  generatedAt: string
  metadata?: Record<string, unknown>
}

// ── Evaluation Result ─────────────────────────────────────────────

export interface CriterionResult {
  score: number
  pass: boolean
  reason: string
  unsupported_claims?: string[]
  fabricated_items?: string[]
  artifacts_found?: string[]
}

export interface EvaluationCriteria {
  task_fit: CriterionResult
  materiality: CriterionResult
  source_grounding: CriterionResult
  hallucination_check: CriterionResult
  formatting_cleanliness: CriterionResult
  length_appropriateness: CriterionResult
  practitioner_credibility: CriterionResult
}

export interface EvaluationMeta {
  evaluationModel: string
  thinkingContent: string
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
  taskType: TaskType
  timestamp: string
}

export interface EvaluationResult {
  decision: "pass" | "revise" | "human_review"
  overall_score: number
  confidence: number
  safe_to_autorevise: boolean
  criteria: EvaluationCriteria
  issues: string[]
  revision_instructions: string | null
  summary: string
  _meta?: EvaluationMeta
}

// ── Pipeline Result ───────────────────────────────────────────────

export interface PipelineResult {
  finalOutput: string
  decision: "pass" | "revise" | "human_review"
  evaluations: EvaluationResult[]
  revisionAttempted: boolean
  totalLatencyMs: number
  deliveredToUser: boolean
}

// ── Pipeline Log (for database persistence) ───────────────────────

export interface PipelineLog {
  id: string
  caseId?: string
  taskType: TaskType
  originalRequest: string
  generationModel: string
  evaluationModel: string
  originalDraft: string
  revisedDraft?: string
  finalOutput: string
  firstEvaluation: EvaluationResult
  secondEvaluation?: EvaluationResult
  firstThinkingContent: string
  secondThinkingContent?: string
  decision: "pass" | "revise" | "human_review"
  overallScore: number
  revisionAttempted: boolean
  deliveredToUser: boolean
  totalLatencyMs: number
  timestamp: string
  humanReviewResolution?: {
    reviewedBy: string
    reviewedAt: string
    action: "approved" | "rejected" | "edited"
    notes?: string
  }
}
