import { describe, it, expect } from "vitest"
import { parseCitation, scanCitations } from "./citation-normalizer"

describe("parseCitation — Tax Court regular opinions", () => {
  it("parses '136 T.C. 137' as tc_regular", () => {
    const p = parseCitation("136 T.C. 137")
    expect(p.kind).toBe("tc_regular")
    expect(p.normalized).toBe("tc:regular:136:137")
  })

  it("parses '136 T.C. 137 (2011)' and extracts year", () => {
    const p = parseCitation("136 T.C. 137 (2011)")
    expect(p.kind).toBe("tc_regular")
    expect(p.normalized).toBe("tc:regular:136:137")
    expect(p.year).toBe(2011)
  })

  it("parses 'Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)' — the regression case", () => {
    const raw = "Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)"
    const p = parseCitation(raw)
    expect(p.kind).toBe("tc_regular")
    expect(p.normalized).toBe("tc:regular:136:137")
    expect(p.year).toBe(2011)
    expect(p.partyName).toBeDefined()
    expect(p.partyName).toContain("Renkemeyer")
    expect(p.partyName).toContain("v. Commissioner")
  })
})

describe("parseCitation — Tax Court memo opinions", () => {
  it("parses 'T.C. Memo. 2013-54' as tc_memo", () => {
    const p = parseCitation("T.C. Memo. 2013-54")
    expect(p.kind).toBe("tc_memo")
    expect(p.normalized).toBe("tc:memo:2013-54")
    expect(p.year).toBe(2013)
  })

  it("parses 'T.C. Memo 2013-54' (no period after Memo)", () => {
    const p = parseCitation("T.C. Memo 2013-54")
    expect(p.kind).toBe("tc_memo")
    expect(p.normalized).toBe("tc:memo:2013-54")
  })
})

describe("parseCitation — federal reporter", () => {
  it("parses '668 F.3d 1008 (8th Cir. 2012)'", () => {
    const p = parseCitation("668 F.3d 1008 (8th Cir. 2012)")
    expect(p.kind).toBe("federal_case")
    expect(p.normalized).toBe("fed:668:F.3d:1008")
    expect(p.year).toBe(2012)
  })

  it("parses '500 U.S. 72' (Supreme Court)", () => {
    const p = parseCitation("500 U.S. 72")
    expect(p.kind).toBe("federal_case")
    expect(p.normalized).toBe("fed:500:U.S:72")
  })

  it("parses '919 F. Supp. 2d 1140'", () => {
    const p = parseCitation("919 F. Supp. 2d 1140 (D.N.M. 2013)")
    expect(p.kind).toBe("federal_case")
    expect(p.year).toBe(2013)
    expect(p.normalized).toMatch(/^fed:919:F\.?Supp\.?2d:1140$/)
  })
})

describe("parseCitation — agency guidance", () => {
  it("parses 'IRC § 1402(a)(13)'", () => {
    const p = parseCitation("IRC § 1402(a)(13)")
    expect(p.kind).toBe("irc")
    expect(p.normalized).toBe("irc:1402:a:13")
  })

  it("parses '26 U.S.C. § 6015'", () => {
    const p = parseCitation("26 U.S.C. § 6015")
    expect(p.kind).toBe("irc")
    expect(p.normalized).toBe("irc:6015")
  })

  it("parses 'Treas. Reg. § 301.7701-2(c)(2)(iv)'", () => {
    const p = parseCitation("Treas. Reg. § 301.7701-2(c)(2)(iv)")
    expect(p.kind).toBe("treas_reg")
    expect(p.normalized).toBe("reg:301.7701-2:c:2:iv")
  })

  it("parses 'IRM 5.8.4.3.1'", () => {
    const p = parseCitation("IRM 5.8.4.3.1")
    expect(p.kind).toBe("irm")
    expect(p.normalized).toBe("irm:5.8.4.3.1")
  })

  it("parses 'Rev. Rul. 69-184'", () => {
    const p = parseCitation("Rev. Rul. 69-184")
    expect(p.kind).toBe("rev_rul")
    expect(p.normalized).toBe("irb:rev_rul:69-184")
  })

  it("parses 'Rev. Proc. 2023-34'", () => {
    const p = parseCitation("Rev. Proc. 2023-34")
    expect(p.kind).toBe("rev_proc")
    expect(p.normalized).toBe("irb:rev_proc:2023-34")
  })

  it("parses 'Notice 2023-10'", () => {
    const p = parseCitation("Notice 2023-10")
    expect(p.kind).toBe("notice")
    expect(p.normalized).toBe("irb:notice:2023-10")
  })

  it("parses 'PLR 202301001'", () => {
    const p = parseCitation("PLR 202301001")
    expect(p.kind).toBe("plr")
    expect(p.normalized).toBe("plr:202301001")
  })
})

describe("parseCitation — unknown input", () => {
  it("returns kind='unknown' for gibberish", () => {
    const p = parseCitation("not a real citation")
    expect(p.kind).toBe("unknown")
    expect(p.normalized).toBe("")
  })

  it("handles empty input gracefully", () => {
    const p = parseCitation("")
    expect(p.kind).toBe("unknown")
  })

  it("handles whitespace-only input", () => {
    const p = parseCitation("   ")
    expect(p.kind).toBe("unknown")
  })
})

describe("scanCitations — finds citations inside prose", () => {
  it("finds a single Tax Court cite in a paragraph", () => {
    const memo =
      "The Tax Court held in Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011), that LLP members are not limited partners."
    const hits = scanCitations(memo)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    const tc = hits.find((h) => h.kind === "tc_regular")
    expect(tc).toBeDefined()
    expect(tc!.normalized).toBe("tc:regular:136:137")
  })

  it("finds multiple distinct cites in a memo", () => {
    const memo = `
## Summary
The applicable authorities include IRC § 1402(a)(13), Treas. Reg. § 301.7701-2(c)(2)(iv),
and the Tax Court's reasoning in 136 T.C. 137. See also Rev. Rul. 69-184 and T.C. Memo. 2013-54.
    `.trim()
    const hits = scanCitations(memo)
    const kinds = new Set(hits.map((h) => h.kind))
    expect(kinds.has("irc")).toBe(true)
    expect(kinds.has("treas_reg")).toBe(true)
    expect(kinds.has("tc_regular")).toBe(true)
    expect(kinds.has("rev_rul")).toBe(true)
    expect(kinds.has("tc_memo")).toBe(true)
  })

  it("deduplicates the same citation mentioned twice", () => {
    const memo = "See 136 T.C. 137. Later the court in 136 T.C. 137 reaffirmed..."
    const hits = scanCitations(memo)
    const tcHits = hits.filter((h) => h.normalized === "tc:regular:136:137")
    expect(tcHits.length).toBe(1)
  })

  it("returns [] for text with no citations", () => {
    const hits = scanCitations("This is prose with no legal citations at all.")
    expect(hits).toEqual([])
  })

  it("returns [] for empty input", () => {
    expect(scanCitations("")).toEqual([])
  })
})
