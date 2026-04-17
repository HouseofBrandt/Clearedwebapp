import { describe, it, expect } from "vitest"
import {
  parseCurrency,
  formatCurrencyForPdf,
  parseDate,
  formatDateForPdf,
  parsePhoneDigits,
  formatPhone,
  formatPhoneForPdf,
  parseSsnDigits,
  formatSsn,
  formatSsnRedacted,
  parseEinDigits,
  formatEin,
  formatZip,
  parseYesNo,
} from "./value-normalizers"

/**
 * Financial + identity normalizers. Bugs here would mis-report dollar
 * amounts to the IRS or expose full SSNs in places expected to be
 * redacted — both are production-critical. These tests lock the
 * behavior.
 */

describe("parseCurrency", () => {
  it("parses plain numbers", () => {
    expect(parseCurrency(1500)).toBe(1500)
    expect(parseCurrency("1500")).toBe(1500)
    expect(parseCurrency("1500.50")).toBe(1500.5)
  })

  it("strips currency symbols and commas", () => {
    expect(parseCurrency("$1,500.00")).toBe(1500)
    expect(parseCurrency("£1000")).toBe(1000)
    expect(parseCurrency("1,500.00 USD")).toBe(1500)
  })

  it("treats '.' as decimal, not thousands separator (US convention)", () => {
    // European format like "1.000" meaning 1000 is NOT supported — we
    // assume US convention where . is decimal. Documenting by test.
    expect(parseCurrency("1.000")).toBe(1)
  })

  it("handles accounting parens for negatives", () => {
    expect(parseCurrency("(500)")).toBe(-500)
    expect(parseCurrency("($1,200.50)")).toBe(-1200.5)
  })

  it("handles trailing-minus convention", () => {
    expect(parseCurrency("1500-")).toBe(-1500)
  })

  it("returns null for empty / invalid input", () => {
    expect(parseCurrency("")).toBeNull()
    expect(parseCurrency(null)).toBeNull()
    expect(parseCurrency(undefined)).toBeNull()
    expect(parseCurrency("not a number")).toBeNull()
    expect(parseCurrency(NaN)).toBeNull()
    expect(parseCurrency(Infinity)).toBeNull()
  })
})

describe("formatCurrencyForPdf", () => {
  it("formats whole numbers without decimals", () => {
    expect(formatCurrencyForPdf(1500)).toBe("1,500")
  })

  it("formats fractional numbers with cents", () => {
    expect(formatCurrencyForPdf(1500.5)).toBe("1,500.50")
  })

  it("forces cents when showCents: true", () => {
    expect(formatCurrencyForPdf(1500, { showCents: true })).toBe("1,500.00")
  })

  it("returns empty string for unparseable input", () => {
    expect(formatCurrencyForPdf(null)).toBe("")
    expect(formatCurrencyForPdf("garbage")).toBe("")
  })
})

describe("parseDate", () => {
  it("parses ISO dates", () => {
    const d = parseDate("2024-01-15")
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(2024)
    expect(d?.getMonth()).toBe(0)
    expect(d?.getDate()).toBe(15)
  })

  it("parses US-style 4-digit year", () => {
    const d = parseDate("01/15/2024")
    expect(d?.getFullYear()).toBe(2024)
    expect(d?.getMonth()).toBe(0)
    expect(d?.getDate()).toBe(15)
  })

  it("expands 2-digit years: <50 → 2000s, ≥50 → 1900s", () => {
    expect(parseDate("01/15/24")?.getFullYear()).toBe(2024)
    expect(parseDate("01/15/98")?.getFullYear()).toBe(1998)
  })

  it("preserves an existing Date object", () => {
    const src = new Date("2024-06-01T00:00:00Z")
    expect(parseDate(src)?.getTime()).toBe(src.getTime())
  })

  it("rejects invalid input", () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate("")).toBeNull()
    expect(parseDate("not a date")).toBeNull()
    expect(parseDate(new Date("invalid"))).toBeNull()
  })
})

describe("formatDateForPdf", () => {
  it("formats as MM/DD/YYYY (IRS standard)", () => {
    expect(formatDateForPdf("2024-01-15")).toMatch(/^01\/15\/2024$/)
  })
  it("returns empty string for invalid", () => {
    expect(formatDateForPdf("")).toBe("")
    expect(formatDateForPdf("not a date")).toBe("")
  })
})

describe("phone helpers", () => {
  it("parsePhoneDigits strips all non-digits", () => {
    expect(parsePhoneDigits("(555) 123-4567")).toBe("5551234567")
    expect(parsePhoneDigits("555.123.4567")).toBe("5551234567")
  })

  it("parsePhoneDigits strips leading 1 country code", () => {
    expect(parsePhoneDigits("+1 (555) 123-4567")).toBe("5551234567")
  })

  it("formatPhone returns parens-style for 10-digit", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567")
  })

  it("formatPhoneForPdf returns dashed-style", () => {
    expect(formatPhoneForPdf("5551234567")).toBe("555-123-4567")
  })

  it("passes through non-10-digit input verbatim", () => {
    expect(formatPhone("abc")).toBe("abc")
    expect(formatPhoneForPdf("x")).toBe("x")
  })
})

describe("SSN helpers", () => {
  it("parseSsnDigits extracts exactly 9 digits", () => {
    expect(parseSsnDigits("123-45-6789")).toBe("123456789")
    expect(parseSsnDigits("123 45 6789")).toBe("123456789")
  })

  it("parseSsnDigits returns empty for non-9-digit input (no silent truncation)", () => {
    expect(parseSsnDigits("12345678")).toBe("")
    expect(parseSsnDigits("1234567890")).toBe("")
    expect(parseSsnDigits("")).toBe("")
  })

  it("formatSsn formats as XXX-XX-XXXX", () => {
    expect(formatSsn("123456789")).toBe("123-45-6789")
    expect(formatSsn("123-45-6789")).toBe("123-45-6789")
  })

  it("formatSsnRedacted exposes only the last 4", () => {
    expect(formatSsnRedacted("123456789")).toBe("***-**-6789")
  })

  it("formatSsnRedacted returns empty for invalid (does NOT leak partial)", () => {
    expect(formatSsnRedacted("")).toBe("")
    expect(formatSsnRedacted("not a ssn")).toBe("")
  })
})

describe("EIN helpers", () => {
  it("formatEin formats as XX-XXXXXXX", () => {
    expect(formatEin("123456789")).toBe("12-3456789")
    expect(formatEin("12-3456789")).toBe("12-3456789")
  })

  it("parseEinDigits requires exactly 9 digits", () => {
    expect(parseEinDigits("12345678")).toBe("")
    expect(parseEinDigits("1234567890")).toBe("")
  })
})

describe("formatZip", () => {
  it("formats 5-digit zip", () => {
    expect(formatZip("90210")).toBe("90210")
    expect(formatZip("90210-0000")).toBe("90210-0000")
  })

  it("formats 9-digit zip as ZIP+4", () => {
    expect(formatZip("902100000")).toBe("90210-0000")
  })

  it("passes odd lengths through", () => {
    expect(formatZip("1234")).toBe("1234")
  })

  it("handles null", () => {
    expect(formatZip(null)).toBe("")
  })
})

describe("parseYesNo", () => {
  it("parses common truthy strings", () => {
    expect(parseYesNo("yes")).toBe(true)
    expect(parseYesNo("Y")).toBe(true)
    expect(parseYesNo("TRUE")).toBe(true)
    expect(parseYesNo("1")).toBe(true)
    expect(parseYesNo("checked")).toBe(true)
    expect(parseYesNo("X")).toBe(true)
  })

  it("parses common falsy strings", () => {
    expect(parseYesNo("no")).toBe(false)
    expect(parseYesNo("N")).toBe(false)
    expect(parseYesNo("false")).toBe(false)
    expect(parseYesNo("0")).toBe(false)
    expect(parseYesNo("unchecked")).toBe(false)
  })

  it("passes through booleans", () => {
    expect(parseYesNo(true)).toBe(true)
    expect(parseYesNo(false)).toBe(false)
  })

  it("returns null for ambiguous input", () => {
    expect(parseYesNo("")).toBeNull()
    expect(parseYesNo(null)).toBeNull()
    expect(parseYesNo("maybe")).toBeNull()
  })
})
