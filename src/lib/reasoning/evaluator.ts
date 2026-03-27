/**
 * Reasoning Layer — Evaluator
 *
 * Calls Claude Sonnet with extended thinking to evaluate a draft
 * against the task-specific rubric. Returns a structured verdict.
 */

import Anthropic from "@anthropic-ai/sdk"
import { TASK_TYPE_CONFIGS } from "./task-types"
import { buildEvaluatorSystemPrompt, buildEvaluatorUserMessage } from "./evaluator-prompt"
import { getPipelineConfig } from "./config"
import type { GenerationOutput, EvaluationResult } from "./types"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

export async function evaluateDraft(input: GenerationOutput): Promise<EvaluationResult> {
  const config = getPipelineConfig()
  const taskConfig = TASK_TYPE_CONFIGS[input.taskType]
  const systemPrompt = buildEvaluatorSystemPrompt(taskConfig)
  const userMessage = buildEvaluatorUserMessage(input)

  const startTime = Date.now()

  const response = await anthropic.messages.create({
    model: config.evaluatorModel,
    max_tokens: 16000,
    thinking: {
      type: "enabled",
      budget_tokens: config.thinkingBudget,
    },
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })

  // Extract thinking blocks for audit logging
  const thinkingBlocks = response.content
    .filter((block): block is Anthropic.ThinkingBlock => block.type === "thinking")
    .map((block) => block.thinking)
    .join("\n\n")

  // Extract the JSON response
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  )

  if (!textBlock) {
    throw new Error("Evaluator returned no text response")
  }

  // Parse JSON — strip any markdown fences if the model wraps them
  const cleaned = textBlock.text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim()

  let evaluation: EvaluationResult

  try {
    evaluation = JSON.parse(cleaned)
  } catch (e) {
    console.error("[Reasoning] Evaluator JSON parse failed:", e)
    console.error("[Reasoning] Raw response:", textBlock.text.slice(0, 500))
    evaluation = {
      decision: "human_review",
      overall_score: 0,
      confidence: 0,
      safe_to_autorevise: false,
      criteria: {
        task_fit: { score: 0, pass: false, reason: "Evaluation parse failed" },
        materiality: { score: 0, pass: false, reason: "Evaluation parse failed" },
        source_grounding: { score: 0, pass: false, reason: "Evaluation parse failed" },
        hallucination_check: { score: 0, pass: false, reason: "Evaluation parse failed" },
        formatting_cleanliness: { score: 0, pass: false, reason: "Evaluation parse failed" },
        length_appropriateness: { score: 0, pass: false, reason: "Evaluation parse failed" },
        practitioner_credibility: { score: 0, pass: false, reason: "Evaluation parse failed" },
      },
      issues: ["Evaluator response could not be parsed — routing to human review"],
      revision_instructions: null,
      summary: "Evaluation failed to parse. Manual review required.",
    }
  }

  // Attach metadata for logging
  return {
    ...evaluation,
    _meta: {
      evaluationModel: config.evaluatorModel,
      thinkingContent: thinkingBlocks,
      latencyMs: Date.now() - startTime,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      taskType: input.taskType,
      timestamp: new Date().toISOString(),
    },
  }
}
