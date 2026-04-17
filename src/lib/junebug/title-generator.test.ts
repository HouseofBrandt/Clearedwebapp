import { describe, it, expect } from "vitest"
import { cleanTitle, buildFallback } from "./title-generator"

describe("cleanTitle", () => {
  it("returns a clean title unchanged", () => {
    expect(cleanTitle("OIC strategy for self-employed")).toBe("OIC strategy for self-employed")
  })

  it("strips wrapping double quotes", () => {
    expect(cleanTitle('"Penalty abatement question"')).toBe("Penalty abatement question")
  })

  it("strips wrapping smart quotes", () => {
    expect(cleanTitle("\u201cInnocent spouse review\u201d")).toBe("Innocent spouse review")
  })

  it("strips a leading 'Title:' prefix", () => {
    expect(cleanTitle("Title: CDP hearing prep")).toBe("CDP hearing prep")
  })

  it("strips a leading 'Subject:' prefix", () => {
    expect(cleanTitle("Subject: TFRP analysis")).toBe("TFRP analysis")
  })

  it("strips trailing punctuation", () => {
    expect(cleanTitle("CNC qualification check.")).toBe("CNC qualification check")
    expect(cleanTitle("Status of OIC?!")).toBe("Status of OIC")
  })

  it("caps word count at 7", () => {
    const long = "Detailed analysis of complex installment agreement options for high income"
    const out = cleanTitle(long)
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(7)
  })

  it("hard-caps very long titles to 80 chars + ellipsis", () => {
    const huge = "x".repeat(200)
    const out = cleanTitle(huge)
    expect(out.length).toBeLessThanOrEqual(81) // 80 chars + "…"
    expect(out.endsWith("…")).toBe(true)
  })
})

describe("buildFallback", () => {
  it("returns short messages unchanged", () => {
    expect(buildFallback("How does CDP hearing work?")).toBe("How does CDP hearing work?")
  })

  it("normalizes whitespace", () => {
    expect(buildFallback("  Hello   world  ")).toBe("Hello world")
  })

  it("truncates long messages with ellipsis", () => {
    const long = "What is the strategy for handling a complex offer in compromise case with multiple liabilities and a self-employment income stream?"
    const out = buildFallback(long)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeLessThanOrEqual(61) // 60 chars + ellipsis
  })

  it("breaks at word boundary when possible", () => {
    const msg = "How do I qualify for an installment agreement when the balance is over fifty thousand dollars?"
    const out = buildFallback(msg)
    // Should not chop mid-word; the char before "…" should be alphanumeric
    expect(out).toMatch(/[A-Za-z]…$/)
  })

  it("handles a single very long word with no spaces", () => {
    const msg = "supercalifragilisticexpialidocious".repeat(3) // ~100 chars no spaces
    const out = buildFallback(msg)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })

  it("preserves newlines as single spaces", () => {
    expect(buildFallback("line one\nline two")).toBe("line one line two")
  })
})
