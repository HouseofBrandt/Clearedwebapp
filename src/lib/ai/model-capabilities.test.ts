import { describe, it, expect } from "vitest"
import {
  supportsSamplingParams,
  supportsEffort,
  usesAdaptiveThinking,
  buildMessagesRequest,
} from "./model-capabilities"

describe("supportsSamplingParams", () => {
  it("returns false for claude-opus-4-7", () => {
    expect(supportsSamplingParams("claude-opus-4-7")).toBe(false)
  })

  it("returns false for any claude-opus-4-7 suffix variant", () => {
    expect(supportsSamplingParams("claude-opus-4-7-20260101")).toBe(false)
    expect(supportsSamplingParams("claude-opus-4-7[1m]")).toBe(false)
  })

  it("returns true for claude-opus-4-6", () => {
    expect(supportsSamplingParams("claude-opus-4-6")).toBe(true)
  })

  it("returns true for Sonnet and Haiku families", () => {
    expect(supportsSamplingParams("claude-sonnet-4-6")).toBe(true)
    expect(supportsSamplingParams("claude-sonnet-4-20250514")).toBe(true)
    expect(supportsSamplingParams("claude-haiku-4-5-20241022")).toBe(true)
  })
})

describe("supportsEffort", () => {
  it("returns true only for claude-opus-4-7 family", () => {
    expect(supportsEffort("claude-opus-4-7")).toBe(true)
    expect(supportsEffort("claude-opus-4-7-20260101")).toBe(true)
    expect(supportsEffort("claude-opus-4-6")).toBe(false)
    expect(supportsEffort("claude-sonnet-4-6")).toBe(false)
  })
})

describe("usesAdaptiveThinking", () => {
  it("returns true only for 4.7 (which replaces budget_tokens with adaptive)", () => {
    expect(usesAdaptiveThinking("claude-opus-4-7")).toBe(true)
    expect(usesAdaptiveThinking("claude-opus-4-6")).toBe(false)
    expect(usesAdaptiveThinking("claude-sonnet-4-20250514")).toBe(false)
  })
})

describe("buildMessagesRequest", () => {
  const base = {
    model: "claude-opus-4-6",
    max_tokens: 1000,
    messages: [{ role: "user" as const, content: "hi" }],
  }

  it("strips temperature for Opus 4.7 models", () => {
    const r = buildMessagesRequest({
      ...base,
      model: "claude-opus-4-7",
      temperature: 0.2,
    }) as any
    expect(r.temperature).toBeUndefined()
    expect(r.model).toBe("claude-opus-4-7")
  })

  it("strips top_p and top_k for Opus 4.7 models", () => {
    const r = buildMessagesRequest({
      ...base,
      model: "claude-opus-4-7",
      top_p: 0.95,
      top_k: 40,
    }) as any
    expect(r.top_p).toBeUndefined()
    expect(r.top_k).toBeUndefined()
  })

  it("preserves temperature for Opus 4.6", () => {
    const r = buildMessagesRequest({
      ...base,
      model: "claude-opus-4-6",
      temperature: 0.2,
    }) as any
    expect(r.temperature).toBe(0.2)
  })

  it("preserves temperature for Sonnet and Haiku", () => {
    expect((buildMessagesRequest({ ...base, model: "claude-sonnet-4-6", temperature: 0.3 }) as any).temperature).toBe(0.3)
    expect((buildMessagesRequest({ ...base, model: "claude-haiku-4-5-20241022", temperature: 0.7 }) as any).temperature).toBe(0.7)
  })

  it("attaches output_config.effort only when model is 4.7 and effort is provided", () => {
    const withEffort = buildMessagesRequest({
      ...base,
      model: "claude-opus-4-7",
      effort: "high",
    }) as any
    expect(withEffort.output_config).toEqual({ effort: "high" })
  })

  it("omits output_config when model is not 4.7 even if effort is passed", () => {
    const r = buildMessagesRequest({
      ...base,
      model: "claude-opus-4-6",
      effort: "high",
    }) as any
    expect(r.output_config).toBeUndefined()
  })

  it("omits output_config on 4.7 when effort is not passed", () => {
    const r = buildMessagesRequest({
      ...base,
      model: "claude-opus-4-7",
    }) as any
    expect(r.output_config).toBeUndefined()
  })

  it("passes through tools, tool_choice, thinking, system, metadata unchanged", () => {
    const r = buildMessagesRequest({
      ...base,
      system: "you are a bot",
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      tool_choice: { type: "auto" },
      thinking: { type: "enabled", budget_tokens: 1000 },
      metadata: { user_id: "u_1" },
    }) as any
    expect(r.system).toBe("you are a bot")
    expect(Array.isArray(r.tools)).toBe(true)
    expect(r.tool_choice).toEqual({ type: "auto" })
    expect(r.thinking).toEqual({ type: "enabled", budget_tokens: 1000 })
    expect(r.metadata).toEqual({ user_id: "u_1" })
  })

  it("does not mutate the input object", () => {
    const input = {
      ...base,
      model: "claude-opus-4-7",
      temperature: 0.5,
      effort: "high" as const,
    }
    const before = JSON.parse(JSON.stringify(input))
    buildMessagesRequest(input)
    expect(input).toEqual(before)
  })
})
