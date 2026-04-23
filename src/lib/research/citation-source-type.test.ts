import { describe, it, expect } from "vitest"
import { citationKindToSourceType } from "./citation-source-type"

describe("citationKindToSourceType", () => {
  it("maps IRC kinds to IRC_STATUTE", () => {
    expect(citationKindToSourceType("irc")).toBe("IRC_STATUTE")
  })

  it("maps Treas. Reg. to TREASURY_REGULATION", () => {
    expect(citationKindToSourceType("treas_reg")).toBe("TREASURY_REGULATION")
  })

  it("maps IRM to IRM_SECTION", () => {
    expect(citationKindToSourceType("irm")).toBe("IRM_SECTION")
  })

  it("maps both Tax Court kinds to TAX_COURT", () => {
    expect(citationKindToSourceType("tc_regular")).toBe("TAX_COURT")
    expect(citationKindToSourceType("tc_memo")).toBe("TAX_COURT")
  })

  it("routes federal cases to SUPREME_COURT when courtOrAgency names Supreme Court", () => {
    expect(citationKindToSourceType("federal_case", "Supreme Court of the United States")).toBe("SUPREME_COURT")
  })

  it("routes federal cases to CIRCUIT_COURT by default", () => {
    expect(citationKindToSourceType("federal_case", "8th Cir.")).toBe("CIRCUIT_COURT")
    expect(citationKindToSourceType("federal_case")).toBe("CIRCUIT_COURT")
  })

  it("maps rev_rul / rev_proc / notice to their IRB groupings", () => {
    expect(citationKindToSourceType("rev_rul")).toBe("REVENUE_RULING")
    expect(citationKindToSourceType("rev_proc")).toBe("REVENUE_PROCEDURE")
    // Notice has no dedicated enum; fall-through to REVENUE_PROCEDURE.
    expect(citationKindToSourceType("notice")).toBe("REVENUE_PROCEDURE")
  })

  it("maps PLR to PLR_CCA", () => {
    expect(citationKindToSourceType("plr")).toBe("PLR_CCA")
  })

  it("falls back to WEB_GENERAL for unknown", () => {
    expect(citationKindToSourceType("unknown")).toBe("WEB_GENERAL")
  })
})
