import type Anthropic from "@anthropic-ai/sdk"

/**
 * Per-model capability checks for the Anthropic API. The Opus 4.7 family
 * removed three parameters we used unconditionally on 4.6:
 *   - temperature
 *   - top_p
 *   - top_k
 * Setting any of these on a 4.7 model returns a 400. This module centralizes
 * the gating so every call site can build its request the same way without
 * re-discovering the rule.
 */

/** Returns false for Opus 4.7 and any future family that matches the same prefix. */
export function supportsSamplingParams(model: string): boolean {
  return !model.startsWith("claude-opus-4-7")
}

/**
 * Opus 4.7 introduces `output_config.effort`. Other model families do not.
 * Use this gate to decide whether to attach an effort level to a request.
 */
export function supportsEffort(model: string): boolean {
  return model.startsWith("claude-opus-4-7")
}

/**
 * Opus 4.7 removed `thinking: { type: "enabled", budget_tokens: N }` and
 * replaced it with `thinking: { type: "adaptive" }`. Use this gate to pick
 * the right shape for the evaluator and any other extended-thinking caller.
 */
export function usesAdaptiveThinking(model: string): boolean {
  return model.startsWith("claude-opus-4-7")
}

export interface BuildMessagesInput {
  model: string
  max_tokens: number
  system?: string
  messages: Anthropic.MessageParam[]
  /** Only attached when the target model supports sampling params. */
  temperature?: number
  /** Only attached when the target model supports sampling params. */
  top_p?: number
  /** Only attached when the target model supports sampling params. */
  top_k?: number
  /** Pass-through. */
  tools?: any[]
  /** Pass-through. */
  tool_choice?: Anthropic.MessageCreateParams["tool_choice"]
  /** Pass-through. */
  thinking?: Anthropic.ThinkingConfigParam
  /** Opus 4.7 only. Ignored on other models. */
  effort?: "low" | "medium" | "high" | "xhigh"
  /** Pass-through. */
  metadata?: Anthropic.MessageCreateParams["metadata"]
  /** Pass-through. Some callers stream. */
  stream?: boolean
}

/**
 * Build a `messages.create` request body with correct per-model gating of
 * sampling params and effort. Use this from every direct-SDK call site so
 * we never pass `temperature` to a 4.7 model by accident.
 *
 * Sampling params are only included when the target model supports them.
 * `effort` is only included when the target model supports it, and only if
 * the caller provided one.
 */
export function buildMessagesRequest(
  input: BuildMessagesInput
): Anthropic.MessageCreateParamsNonStreaming {
  const {
    temperature,
    top_p,
    top_k,
    effort,
    ...rest
  } = input

  const out: any = { ...rest }

  if (supportsSamplingParams(input.model)) {
    if (typeof temperature === "number") out.temperature = temperature
    if (typeof top_p === "number") out.top_p = top_p
    if (typeof top_k === "number") out.top_k = top_k
  }

  if (supportsEffort(input.model) && effort) {
    out.output_config = { effort }
  }

  // Narrow to the non-streaming overload — the caller picks streaming by
  // using `anthropic.messages.stream(...)` (which accepts the same param
  // shape) rather than by setting `stream: true` on the body.
  return out as Anthropic.MessageCreateParamsNonStreaming
}
