import { describe, it, expect } from "vitest"
import { flattenValues } from "./flatten-values"

describe("flattenValues", () => {
  it("passes through scalars unchanged", () => {
    expect(flattenValues({ taxpayer_name: "Jane", ssn: "123-45-6789" })).toEqual({
      taxpayer_name: "Jane",
      ssn: "123-45-6789",
    })
  })

  it("flattens repeating groups into dot-notation", () => {
    const flat = flattenValues({
      bank_accounts: [
        { bank_name: "Chase", balance: 2400 },
        { bank_name: "Ally",  balance: 850  },
      ],
    })
    expect(flat["bank_accounts.0.bank_name"]).toBe("Chase")
    expect(flat["bank_accounts.0.balance"]).toBe(2400)
    expect(flat["bank_accounts.1.bank_name"]).toBe("Ally")
    expect(flat["bank_accounts.1.balance"]).toBe(850)
    expect(flat.bank_accounts).toBeUndefined()
  })

  it("preserves scalar + array coexistence", () => {
    const flat = flattenValues({
      taxpayer_name: "Jane",
      dependents: [{ name: "Alex", age: 8 }],
    })
    expect(flat.taxpayer_name).toBe("Jane")
    expect(flat["dependents.0.name"]).toBe("Alex")
  })

  it("skips non-object array entries", () => {
    const flat = flattenValues({
      tags: ["a", "b", "c"],
    })
    // No group keys produced; the original array is also gone.
    expect(Object.keys(flat)).toEqual([])
  })

  it("handles empty input", () => {
    expect(flattenValues({})).toEqual({})
  })
})
