import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the encryption module — decryption in test env requires a key we
// don't want to fixture. We assert that the helper CALLS decryptField
// and handles its return values correctly.
const decryptFieldMock = vi.fn()
vi.mock("@/lib/encryption", () => ({
  decryptField: (...args: any[]) => decryptFieldMock(...args),
}))

import {
  decryptEmbeddedCaseClientName,
  decryptEmbeddedCaseClientNames,
} from "./decrypt-case-name"

beforeEach(() => {
  decryptFieldMock.mockReset()
})

describe("decryptEmbeddedCaseClientName", () => {
  it("decrypts case.clientName and returns a new object", () => {
    decryptFieldMock.mockReturnValue("Jane Doe")
    const input = {
      id: "t1",
      case: { id: "c1", tabsNumber: "12345.6789", clientName: "v1:abc:def:ghi" },
    }
    const out = decryptEmbeddedCaseClientName(input)
    expect(decryptFieldMock).toHaveBeenCalledWith("v1:abc:def:ghi")
    expect(out.case!.clientName).toBe("Jane Doe")
    // Other fields preserved.
    expect(out.id).toBe("t1")
    expect(out.case!.tabsNumber).toBe("12345.6789")
  })

  it("returns the input unchanged when case is missing", () => {
    const input = { id: "t1", case: null }
    const out = decryptEmbeddedCaseClientName(input)
    expect(out).toBe(input) // same reference
    expect(decryptFieldMock).not.toHaveBeenCalled()
  })

  it("returns the input unchanged when case.clientName is missing", () => {
    const input = { id: "t1", case: { tabsNumber: "12345.6789" } }
    const out = decryptEmbeddedCaseClientName(input)
    expect(out).toBe(input)
    expect(decryptFieldMock).not.toHaveBeenCalled()
  })

  it("blanks clientName when decryption throws (never leaks envelope)", () => {
    decryptFieldMock.mockImplementation(() => {
      throw new Error("decrypt failed")
    })
    const input = {
      case: { tabsNumber: "1234.5678", clientName: "v1:corrupt:envelope:here" },
    }
    const out = decryptEmbeddedCaseClientName(input)
    expect(out.case!.clientName).toBe("")
  })

  it("blanks clientName when decryption returns empty", () => {
    decryptFieldMock.mockReturnValue("")
    const input = { case: { clientName: "v1:empty:envelope:x" } }
    const out = decryptEmbeddedCaseClientName(input)
    expect(out.case!.clientName).toBe("")
  })

  it("handles null/undefined input gracefully", () => {
    expect(decryptEmbeddedCaseClientName(null)).toBe(null)
    expect(decryptEmbeddedCaseClientName(undefined)).toBe(undefined)
  })
})

describe("decryptEmbeddedCaseClientNames", () => {
  it("maps each row", () => {
    decryptFieldMock.mockImplementation((v: string) => v.replace("encrypted:", ""))
    const rows = [
      { id: "1", case: { clientName: "encrypted:Jane" } },
      { id: "2", case: { clientName: "encrypted:John" } },
    ]
    const out = decryptEmbeddedCaseClientNames(rows)
    expect(out[0].case!.clientName).toBe("Jane")
    expect(out[1].case!.clientName).toBe("John")
  })

  it("returns empty array for empty input", () => {
    expect(decryptEmbeddedCaseClientNames([])).toEqual([])
  })
})
