import { describe, it, expect } from "vitest"
import { sanitizeForPostgres, sanitizeForPostgresOrNull } from "./sanitize-text"

describe("sanitizeForPostgres", () => {
  it("strips NUL bytes (the specific cause of SQLSTATE 22021)", () => {
    const leaked = "Hello\u0000World\u0000!"
    expect(sanitizeForPostgres(leaked)).toBe("HelloWorld!")
  })

  it("strips NUL bytes from pdf-parse-style extraction artifacts", () => {
    const pdfStyle = "Invoice #1234\u0000\u0000Amount: $5,432.00\u0000"
    expect(sanitizeForPostgres(pdfStyle)).toBe("Invoice #1234Amount: $5,432.00")
  })

  it("strips lone high surrogates", () => {
    const loneHigh = "Hello \uD800World"
    expect(sanitizeForPostgres(loneHigh)).toBe("Hello World")
  })

  it("strips lone low surrogates", () => {
    const loneLow = "Hello \uDC00World"
    expect(sanitizeForPostgres(loneLow)).toBe("Hello World")
  })

  it("preserves valid surrogate pairs (emoji, astral Unicode)", () => {
    // "👋" is U+1F44B encoded as surrogate pair \uD83D\uDC4B
    const emoji = "Hello 👋 world"
    expect(sanitizeForPostgres(emoji)).toBe("Hello 👋 world")
  })

  it("preserves normal accented text", () => {
    const accented = "Señor Müller — résumé naïve façade"
    expect(sanitizeForPostgres(accented)).toBe("Señor Müller — résumé naïve façade")
  })

  it("preserves newlines, tabs, and normal whitespace", () => {
    const whitespace = "Line 1\n\tLine 2\r\nLine 3"
    expect(sanitizeForPostgres(whitespace)).toBe("Line 1\n\tLine 2\r\nLine 3")
  })

  it("does not trim — that's a presentation concern for the caller", () => {
    expect(sanitizeForPostgres("  padded  ")).toBe("  padded  ")
  })

  it("handles null / undefined / empty", () => {
    expect(sanitizeForPostgres(null)).toBe("")
    expect(sanitizeForPostgres(undefined)).toBe("")
    expect(sanitizeForPostgres("")).toBe("")
  })

  it("handles a string of only NULs", () => {
    expect(sanitizeForPostgres("\u0000\u0000\u0000")).toBe("")
  })
})

describe("sanitizeForPostgresOrNull", () => {
  it("returns null when result is empty after trimming", () => {
    expect(sanitizeForPostgresOrNull("")).toBeNull()
    expect(sanitizeForPostgresOrNull(null)).toBeNull()
    expect(sanitizeForPostgresOrNull("\u0000\u0000")).toBeNull()
    expect(sanitizeForPostgresOrNull("   \t\n  ")).toBeNull()
  })

  it("returns trimmed sanitized text when non-empty", () => {
    expect(sanitizeForPostgresOrNull("  hello\u0000 world  ")).toBe("hello world")
  })
})
