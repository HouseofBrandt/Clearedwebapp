import { describe, it, expect } from "vitest"
import { applyTransform } from "./value-transforms"

// These transforms run on every PDF field before fill. A regression here
// sends malformed data to the IRS. Lock the behavior.

describe("ssn-format", () => {
  it("formats 9-digit string", () => {
    expect(applyTransform("123456789", "ssn-format")).toBe("123-45-6789")
  })
  it("preserves already-formatted input", () => {
    expect(applyTransform("123-45-6789", "ssn-format")).toBe("123-45-6789")
  })
  it("returns non-9-digit input verbatim (no silent truncation)", () => {
    expect(applyTransform("12345", "ssn-format")).toBe("12345")
  })
  it("handles null/undefined", () => {
    expect(applyTransform(null, "ssn-format")).toBe("")
    expect(applyTransform(undefined, "ssn-format")).toBe("")
  })
})

describe("ein-format", () => {
  it("formats 9-digit EIN as XX-XXXXXXX", () => {
    expect(applyTransform("123456789", "ein-format")).toBe("12-3456789")
  })
  it("accepts pre-formatted", () => {
    expect(applyTransform("12-3456789", "ein-format")).toBe("12-3456789")
  })
})

describe("phone-format", () => {
  it("formats 10-digit US", () => {
    expect(applyTransform("5551234567", "phone-format")).toBe("(555) 123-4567")
  })
  it("strips leading 1", () => {
    expect(applyTransform("15551234567", "phone-format")).toBe("(555) 123-4567")
  })
  it("passes through unusual inputs", () => {
    expect(applyTransform("abc", "phone-format")).toBe("abc")
  })
})

describe("currency-no-symbol", () => {
  it("formats with 2 decimals and commas", () => {
    expect(applyTransform(1500, "currency-no-symbol")).toBe("1,500.00")
    expect(applyTransform(1500.5, "currency-no-symbol")).toBe("1,500.50")
  })
  it("returns non-numeric input unchanged", () => {
    expect(applyTransform("abc", "currency-no-symbol")).toBe("abc")
  })
})

describe("currency-whole-dollars", () => {
  it("rounds to whole dollars with commas", () => {
    expect(applyTransform(1500.49, "currency-whole-dollars")).toBe("1,500")
    expect(applyTransform(1500.5,  "currency-whole-dollars")).toBe("1,501")
  })
})

describe("date-mmddyyyy", () => {
  it("formats ISO date as MM/DD/YYYY", () => {
    expect(applyTransform("2024-01-15", "date-mmddyyyy")).toBe("01/15/2024")
  })
  it("returns empty for empty input", () => {
    expect(applyTransform("", "date-mmddyyyy")).toBe("")
    expect(applyTransform(null, "date-mmddyyyy")).toBe("")
  })
})

describe("date-mm-dd-yyyy", () => {
  it("uses dashes instead of slashes", () => {
    expect(applyTransform("2024-01-15", "date-mm-dd-yyyy")).toBe("01-15-2024")
  })
})

describe("uppercase / lowercase", () => {
  it("transforms text", () => {
    expect(applyTransform("Hello", "uppercase")).toBe("HELLO")
    expect(applyTransform("Hello", "lowercase")).toBe("hello")
  })
})

describe("checkbox-x", () => {
  it("returns X for truthy values", () => {
    expect(applyTransform(true, "checkbox-x")).toBe("X")
    expect(applyTransform("true", "checkbox-x")).toBe("X")
    expect(applyTransform("yes", "checkbox-x")).toBe("X")
    expect(applyTransform(1, "checkbox-x")).toBe("X")
  })
  it("returns empty for falsy", () => {
    expect(applyTransform(false, "checkbox-x")).toBe("")
    expect(applyTransform("", "checkbox-x")).toBe("")
    expect(applyTransform(null, "checkbox-x")).toBe("")
    expect(applyTransform(undefined, "checkbox-x")).toBe("")
  })
})

describe("yes-no", () => {
  it("returns Yes for truthy", () => {
    expect(applyTransform(true, "yes-no")).toBe("Yes")
    expect(applyTransform("yes", "yes-no")).toBe("Yes")
  })
  it("returns No for falsy", () => {
    expect(applyTransform(false, "yes-no")).toBe("No")
    expect(applyTransform("no", "yes-no")).toBe("No")
  })
})

describe("default (no transform)", () => {
  it("coerces to string", () => {
    expect(applyTransform(42)).toBe("42")
    expect(applyTransform("hello")).toBe("hello")
  })
  it("returns empty for null/undefined", () => {
    expect(applyTransform(null)).toBe("")
    expect(applyTransform(undefined)).toBe("")
  })
})

describe("unknown transform falls back to String()", () => {
  it("warns and coerces", () => {
    // @ts-expect-error — intentionally pass unknown transform name
    expect(applyTransform(42, "not-a-real-transform")).toBe("42")
  })
})
