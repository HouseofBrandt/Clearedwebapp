import { describe, it, expect } from "vitest"
import { redactLeakedPII, redactLeakedPIIWithFlag } from "./redact-leaked-pii"

describe("redactLeakedPII — encryption envelopes", () => {
  it("redacts a v1: envelope with three hex segments", () => {
    const leaked =
      "Approved for v1:25a3a3081eb8fa6e35545ab9:213ee59cea1b78a2fb2a63c9d04fa90d:c698dfa1d68bad4db23850e989be960837ff2511f8 review."
    const out = redactLeakedPII(leaked)
    expect(out).toBe("Approved for [redacted] review.")
  })

  it("handles the envelope appearing inside a #CaseTag", () => {
    const leaked =
      "Tagged #v1:1234567890abcdef1234:abcdef1234567890abcd:fedcba0987654321fedc for review"
    const out = redactLeakedPII(leaked)
    expect(out).toContain("[redacted]")
    expect(out).not.toMatch(/v1:[0-9a-f]{16}/)
  })

  it("ignores short hex strings that aren't envelopes", () => {
    // Practitioner-entered references, TABS numbers, short IDs — untouched.
    expect(redactLeakedPII("IRC § 6651")).toBe("IRC § 6651")
    expect(redactLeakedPII("CP2000 notice")).toBe("CP2000 notice")
    expect(redactLeakedPII("TABS 12345.6789")).toBe("TABS 12345.6789")
    expect(redactLeakedPII("v1: rollout notes")).toBe("v1: rollout notes")
  })

  it("does not match v1: without three hex segments", () => {
    expect(redactLeakedPII("v1:hello:world")).toBe("v1:hello:world")
    expect(redactLeakedPII("v1:abc:def")).toBe("v1:abc:def")
  })
})

describe("redactLeakedPII — tokenizer output", () => {
  it("redacts [NAME-<hash>]", () => {
    expect(redactLeakedPII("Spoke with [NAME-A1B2C3] today")).toBe(
      "Spoke with [redacted] today"
    )
  })

  it("redacts [SSN-<hash>] and [EIN-<hash>]", () => {
    expect(redactLeakedPII("Verified [SSN-ABCDEF] and [EIN-123456] match")).toBe(
      "Verified [redacted] and [redacted] match"
    )
  })

  it("redacts custom token names with hyphens", () => {
    expect(redactLeakedPII("See [CLIENT-NAME-A1B2C3] file")).toBe(
      "See [redacted] file"
    )
  })

  it("does not redact bracketed text that isn't a tokenizer output", () => {
    expect(redactLeakedPII("See [foo] and [Bar-baz]")).toBe("See [foo] and [Bar-baz]")
    expect(redactLeakedPII("Note: [TODO] follow up")).toBe("Note: [TODO] follow up")
    expect(redactLeakedPII("Amount [$1,200]")).toBe("Amount [$1,200]")
  })
})

describe("redactLeakedPIIWithFlag", () => {
  it("flags when something was redacted", () => {
    const r = redactLeakedPIIWithFlag("[NAME-A1B2C3] filed")
    expect(r.wasRedacted).toBe(true)
    expect(r.text).toBe("[redacted] filed")
  })

  it("does not flag when nothing changed", () => {
    const r = redactLeakedPIIWithFlag("Normal post content")
    expect(r.wasRedacted).toBe(false)
    expect(r.text).toBe("Normal post content")
  })
})

describe("redactLeakedPII — edge cases", () => {
  it("handles empty / null-ish input", () => {
    expect(redactLeakedPII("")).toBe("")
  })

  it("redacts multiple occurrences in one string", () => {
    const out = redactLeakedPII(
      "[NAME-A1B2C3] paid [NAME-D4E5F6] via v1:1234567890abcdef1234:1234567890abcdef1234:1234567890abcdef1234"
    )
    expect(out).toBe("[redacted] paid [redacted] via [redacted]")
  })
})
