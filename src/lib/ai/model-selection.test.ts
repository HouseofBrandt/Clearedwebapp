import { describe, it, expect, beforeEach, afterEach } from "vitest"

/**
 * Ensure modules are re-evaluated on each call so env changes take effect.
 * `preferredOpusModel()` and `resolveModel()` read env at call-time, not at
 * import-time, so we don't actually need module resets — just clean env.
 */

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.CLEARED_OPUS_4_7_ENABLED
})
afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe("preferredOpusModel", () => {
  it("returns 4.7 when CLEARED_OPUS_4_7_ENABLED=true", async () => {
    process.env.CLEARED_OPUS_4_7_ENABLED = "true"
    const { preferredOpusModel } = await import("./model-selection")
    expect(preferredOpusModel()).toBe("claude-opus-4-7")
  })

  it("returns 4.6 when CLEARED_OPUS_4_7_ENABLED=false", async () => {
    process.env.CLEARED_OPUS_4_7_ENABLED = "false"
    const { preferredOpusModel } = await import("./model-selection")
    expect(preferredOpusModel()).toBe("claude-opus-4-6")
  })

  it("accepts common truthy/falsy synonyms (1/0, yes/no, on/off)", async () => {
    const { preferredOpusModel } = await import("./model-selection")

    process.env.CLEARED_OPUS_4_7_ENABLED = "1"
    expect(preferredOpusModel()).toBe("claude-opus-4-7")
    process.env.CLEARED_OPUS_4_7_ENABLED = "0"
    expect(preferredOpusModel()).toBe("claude-opus-4-6")
    process.env.CLEARED_OPUS_4_7_ENABLED = "on"
    expect(preferredOpusModel()).toBe("claude-opus-4-7")
    process.env.CLEARED_OPUS_4_7_ENABLED = "off"
    expect(preferredOpusModel()).toBe("claude-opus-4-6")
  })

  it("defaults to 4.7 when unset in non-production", async () => {
    process.env.NODE_ENV = "development"
    delete process.env.CLEARED_OPUS_4_7_ENABLED
    const { preferredOpusModel } = await import("./model-selection")
    expect(preferredOpusModel()).toBe("claude-opus-4-7")
  })

  it("defaults to 4.6 when unset in production", async () => {
    process.env.NODE_ENV = "production"
    delete process.env.CLEARED_OPUS_4_7_ENABLED
    const { preferredOpusModel } = await import("./model-selection")
    expect(preferredOpusModel()).toBe("claude-opus-4-6")
  })
})

describe("resolveModel", () => {
  it("coerces 4.7 to 4.6 when flag is off", async () => {
    process.env.CLEARED_OPUS_4_7_ENABLED = "false"
    const { resolveModel } = await import("./model-selection")
    expect(resolveModel("claude-opus-4-7")).toBe("claude-opus-4-6")
  })

  it("keeps 4.7 when flag is on", async () => {
    process.env.CLEARED_OPUS_4_7_ENABLED = "true"
    const { resolveModel } = await import("./model-selection")
    expect(resolveModel("claude-opus-4-7")).toBe("claude-opus-4-7")
  })

  it("passes every other model through unchanged regardless of flag", async () => {
    process.env.CLEARED_OPUS_4_7_ENABLED = "false"
    const { resolveModel } = await import("./model-selection")
    expect(resolveModel("claude-opus-4-6")).toBe("claude-opus-4-6")
    expect(resolveModel("claude-sonnet-4-6")).toBe("claude-sonnet-4-6")
    expect(resolveModel("claude-haiku-4-5-20241022")).toBe("claude-haiku-4-5-20241022")
  })
})
