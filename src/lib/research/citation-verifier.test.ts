import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Citation-verifier eval harness.
 *
 * Scope: exercise `verifyCitation` across the three resolution paths
 * (canonical authority DB, CourtListener, not found) with Prisma and the
 * CourtListener client both mocked. The hero test is the "Renkemeyer"
 * case — a real Tax Court opinion the model has repeatedly been observed
 * to hallucinate holdings about; we want to prove the verifier correctly
 * confirms it exists AND correctly flags a fabricated citation.
 *
 * These tests are deliberately hermetic. No real Prisma, no real network.
 */

const findFirstMock = vi.fn()
vi.mock("@/lib/db", () => ({
  prisma: {
    canonicalAuthority: {
      findFirst: (args: any) => findFirstMock(args),
    },
  },
}))

const searchByCitationMock = vi.fn()
const searchByNameMock = vi.fn()
vi.mock("./courtlistener-client", () => ({
  searchByCitation: (...args: any[]) => searchByCitationMock(...args),
  searchByName: (...args: any[]) => searchByNameMock(...args),
}))

import { verifyCitation } from "./citation-verifier"

// Mock global fetch — the URL probe uses it for public-URL existence
// checks (Cornell LII, IRS.gov). Unit tests never hit real networks.
const fetchMock = vi.fn()
beforeEach(() => {
  findFirstMock.mockReset()
  searchByCitationMock.mockReset()
  searchByNameMock.mockReset()
  fetchMock.mockReset()
  // Default: URL probe gets 200 OK so tests that don't specifically
  // exercise the probe don't have to configure fetch per-case. Individual
  // tests override as needed.
  fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
  ;(globalThis as any).fetch = fetchMock
})

describe("verifyCitation — canonical authority DB hit", () => {
  it("returns 'verified' when the citation is in CanonicalAuthority", async () => {
    findFirstMock.mockResolvedValue({
      citationString: "IRC § 1402(a)(13)",
      title: "Definitions — Self-Employment Income",
      authorityStatus: "ACTIVE",
      authorityTier: "T1_STATUTE",
      precedentialStatus: "BINDING",
      effectiveDate: new Date("2023-01-01"),
      publicationDate: null,
      jurisdiction: "U.S.",
      supersededBy: null,
      artifact: { sourceUrl: "https://www.law.cornell.edu/uscode/text/26/1402" },
    })

    const r = await verifyCitation("IRC § 1402(a)(13)")
    expect(r.status).toBe("verified")
    expect(r.sourceOfTruth).toBe("canonical_authority")
    expect(r.verifiedTitle).toBe("Definitions — Self-Employment Income")
    expect(r.sourceUrl).toContain("law.cornell.edu")
    expect(r.year).toBe(2023)
    // CourtListener must NOT have been called — canonical hit short-circuits.
    expect(searchByCitationMock).not.toHaveBeenCalled()
  })

  it("returns 'superseded' when the authority has a supersededBy relation", async () => {
    findFirstMock.mockResolvedValue({
      citationString: "Rev. Proc. 2010-4",
      title: "Letter Ruling Procedure (Superseded)",
      authorityStatus: "SUPERSEDED",
      authorityTier: "T3_IRS_GUIDANCE",
      precedentialStatus: "PERSUASIVE",
      effectiveDate: null,
      publicationDate: new Date("2010-01-04"),
      jurisdiction: "U.S.",
      supersededBy: { citationString: "Rev. Proc. 2023-1", title: "Letter Ruling Procedure (Current)" },
      artifact: null,
    })

    const r = await verifyCitation("Rev. Proc. 2010-4")
    expect(r.status).toBe("superseded")
    expect(r.supersededBy).toBe("Rev. Proc. 2023-1")
    expect(r.note).toContain("superseded")
  })
})

describe("verifyCitation — CourtListener fallback", () => {
  it("falls back to CourtListener when canonical DB misses, and returns 'verified'", async () => {
    findFirstMock.mockResolvedValue(null)
    searchByCitationMock.mockResolvedValue({
      kind: "hit",
      opinion: {
        caseName: "Renkemeyer, Campbell & Weaver, LLP v. Commissioner",
        year: 2011,
        court: "United States Tax Court",
        absoluteUrl: "https://www.courtlistener.com/opinion/123456/renkemeyer/",
        summary:
          "The Tax Court held that attorneys who were members of an LLP were not 'limited partners' within the meaning of § 1402(a)(13).",
      },
    })

    const r = await verifyCitation("Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)")
    expect(r.status).toBe("verified")
    expect(r.sourceOfTruth).toBe("courtlistener")
    expect(r.verifiedTitle).toContain("Renkemeyer")
    expect(r.year).toBe(2011)
    expect(r.sourceUrl).toContain("courtlistener.com")
  })

  it("tries party-name search when citation-based lookup misses", async () => {
    findFirstMock.mockResolvedValue(null)
    searchByCitationMock.mockResolvedValue({ kind: "no_hit" })
    searchByNameMock.mockResolvedValue({
      kind: "hit",
      opinion: {
        caseName: "Renkemeyer, Campbell & Weaver, LLP v. Commissioner",
        year: 2011,
        court: "United States Tax Court",
        absoluteUrl: "https://www.courtlistener.com/opinion/123456/renkemeyer/",
        summary: "",
      },
    })

    const r = await verifyCitation("Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)")
    expect(r.status).toBe("verified")
    expect(r.sourceOfTruth).toBe("courtlistener")
    expect(searchByNameMock).toHaveBeenCalled()
    expect(r.note).toContain("name search")
  })

  it("returns 'unverifiable' (not 'not_found') on 403 — so Claude flags real cases instead of dropping them", async () => {
    findFirstMock.mockResolvedValue(null)
    searchByCitationMock.mockResolvedValue({
      kind: "unreachable",
      reason: "auth_required",
      status: 403,
    })
    const r = await verifyCitation("Renkemeyer, Campbell & Weaver, LLP v. Commissioner, 136 T.C. 137 (2011)")
    expect(r.status).toBe("unverifiable")
    expect(r.note).toMatch(/does NOT mean the citation is fabricated/i)
    // Must NOT fall through to party-name search on transport failures
    // (that would almost always fail the same way, wasting a request).
    expect(searchByNameMock).not.toHaveBeenCalled()
  })

  it("returns 'unverifiable' on rate-limit with a clear message", async () => {
    findFirstMock.mockResolvedValue(null)
    searchByCitationMock.mockResolvedValue({
      kind: "unreachable",
      reason: "rate_limited",
      status: 429,
    })
    const r = await verifyCitation("Watson v. United States, 668 F.3d 1008 (8th Cir. 2012)")
    expect(r.status).toBe("unverifiable")
    expect(r.note).toMatch(/rate-limited/i)
  })
})

describe("verifyCitation — not found (fabricated citations)", () => {
  it("returns 'not_found' when neither DB nor CourtListener has the citation — the hallucination guard", async () => {
    findFirstMock.mockResolvedValue(null)
    searchByCitationMock.mockResolvedValue({ kind: "no_hit" })
    searchByNameMock.mockResolvedValue({ kind: "no_hit" })

    // A made-up but plausible-looking Tax Court cite. This is the
    // exact failure mode we're defending against: a model pattern-
    // matches to the Tax Court format and invents a case.
    const r = await verifyCitation("Fictitious LLP v. Commissioner, 999 T.C. 999 (2099)")
    expect(r.status).toBe("not_found")
    expect(r.sourceOfTruth).toBe("none")
    expect(r.note).toMatch(/not found|do NOT describe/i)
  })

  it("returns 'not_found' with a tailored note when citation format is unrecognized", async () => {
    findFirstMock.mockResolvedValue(null)
    const r = await verifyCitation("gibberish that cannot parse")
    expect(r.status).toBe("not_found")
    expect(r.note).toMatch(/format not recognized/i)
  })

  it("does NOT call CourtListener for agency-guidance kinds (IRC/Reg/IRM/RevRul) when canonical DB misses", async () => {
    findFirstMock.mockResolvedValue(null)
    // URL probe also 404s in this test — nothing to verify.
    const r = await verifyCitation("IRC § 99999")
    expect(r.status).toBe("unverifiable")
    // CourtListener is case-law only — agency guidance should never leak to it.
    expect(searchByCitationMock).not.toHaveBeenCalled()
    expect(searchByNameMock).not.toHaveBeenCalled()
  })
})

describe("verifyCitation — non-case-law unverifiable path", () => {
  it("marks IRC as unverifiable (NOT not_found) when DB misses and URL probe fails — real statute must not be dropped", async () => {
    findFirstMock.mockResolvedValue(null)
    // URL probe returns 404 (unexpected, but tests the fallthrough)
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))

    const r = await verifyCitation("IRC § 1402(a)(13)")
    expect(r.status).toBe("unverifiable")
    expect(r.note).toMatch(/Cornell LII|flag as \[UNVERIFIED\]/i)
  })

  it("marks Treas. Reg. as unverifiable when DB misses and probe fails", async () => {
    findFirstMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))

    const r = await verifyCitation("Treas. Reg. § 1.704-1(b)(2)(ii)(d)")
    expect(r.status).toBe("unverifiable")
    expect(r.note).toMatch(/CFR|\[UNVERIFIED\]/i)
  })

  it("marks Rev. Rul. as unverifiable (no public probe exists for IRB)", async () => {
    findFirstMock.mockResolvedValue(null)
    const r = await verifyCitation("Rev. Rul. 69-184")
    expect(r.status).toBe("unverifiable")
    expect(r.note).toMatch(/IRB|\[UNVERIFIED\]/i)
    // No URL probe for IRB — fetch shouldn't be called.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("marks IRC as verified when Cornell LII probe returns 200", async () => {
    findFirstMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    const r = await verifyCitation("IRC § 1402(a)(13)")
    expect(r.status).toBe("verified")
    expect(r.sourceUrl).toContain("law.cornell.edu/uscode/text/26/1402")
    expect(r.courtOrAgency).toContain("U.S. Code")
  })

  it("marks Treas. Reg. as verified when Cornell LII CFR probe returns 200", async () => {
    findFirstMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    const r = await verifyCitation("Treas. Reg. § 301.7701-2")
    expect(r.status).toBe("verified")
    expect(r.sourceUrl).toContain("law.cornell.edu/cfr/text/26/301.7701-2")
  })

  it("marks IRM as verified when IRS.gov probe returns 200", async () => {
    findFirstMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    const r = await verifyCitation("IRM 5.8.4.3.1")
    expect(r.status).toBe("verified")
    expect(r.sourceUrl).toContain("irs.gov/irm/part5/irm_5-8-4-3-1")
  })
})

describe("verifyCitation — resilience", () => {
  it("falls through to unverifiable when Prisma throws on IRC (statute should never be dropped for a DB failure)", async () => {
    findFirstMock.mockRejectedValue(new Error("DB connection lost"))
    fetchMock.mockRejectedValue(new Error("network error"))

    const r = await verifyCitation("IRC § 1402(a)(13)")
    expect(r.status).toBe("unverifiable")
    // IRC is not a case-law kind, so CourtListener shouldn't have been tried.
    expect(searchByCitationMock).not.toHaveBeenCalled()
  })
})
