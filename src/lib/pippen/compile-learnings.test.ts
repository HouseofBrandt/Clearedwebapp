import { describe, it, expect } from "vitest"
import { looksLikeFailureRefusal } from "./compile-learnings"

describe("looksLikeFailureRefusal", () => {
  // Real briefs that landed on the production dashboard and were flagged
  // by the user as unacceptable. These MUST be detected as refusals.
  describe("real-world failure-mode briefs (regression tests)", () => {
    it("detects the May 4 2026 brief — 'No summaries can be responsibly generated'", () => {
      const verdict = looksLikeFailureRefusal(
        {
          topTakeaway:
            "No summaries can be responsibly generated today — the fetch pipeline returned metadata only with no document content; re-run with full text retrieval before requesting practitioner-facing summaries.",
          learnings: [],
        },
        12,
      )
      expect(verdict.refused).toBe(true)
    })

    it("detects the May 3 2026 brief — 'PIPELINE ERROR: Full document content was not retrieved'", () => {
      const verdict = looksLikeFailureRefusal(
        {
          topTakeaway:
            "PIPELINE ERROR: Full document content was not retrieved for any of the 47 source materials — only metadata was provided. Practitioners should not act on inferred summaries; re-run the fetch pipeline with full-text extraction enabled and resubmit to Pippen for accurate, content-based learning items.",
          learnings: [],
        },
        2,
      )
      expect(verdict.refused).toBe(true)
    })

    it("detects the original 'CONTENT RETRIEVAL FAILURE' framing", () => {
      const verdict = looksLikeFailureRefusal(
        {
          topTakeaway:
            "CONTENT RETRIEVAL FAILURE: 49 of 51 source materials could not be summarized because they were delivered without body text and must be re-fetched.",
          learnings: [],
        },
        2,
      )
      expect(verdict.refused).toBe(true)
    })
  })

  describe("fast-path singletons", () => {
    it("flags any takeaway containing 'metadata only'", () => {
      expect(
        looksLikeFailureRefusal(
          { topTakeaway: "Today's batch was metadata only.", learnings: [{}, {}, {}] },
          5,
        ).refused,
      ).toBe(true)
    })

    it("flags any takeaway containing 'fetch pipeline'", () => {
      expect(
        looksLikeFailureRefusal(
          { topTakeaway: "The fetch pipeline returned an unusual result.", learnings: [{}, {}, {}] },
          5,
        ).refused,
      ).toBe(true)
    })

    it("flags any takeaway containing 're-run with full'", () => {
      expect(
        looksLikeFailureRefusal(
          { topTakeaway: "Please re-run with full text retrieval.", learnings: [{}, {}, {}] },
          5,
        ).refused,
      ).toBe(true)
    })
  })

  describe("term co-occurrence (2+ matches)", () => {
    it("flags 'unable to summarize' + 'no document content' co-occurring", () => {
      expect(
        looksLikeFailureRefusal(
          {
            topTakeaway: "We were unable to summarize today's batch — no document content was available.",
            learnings: [{}, {}, {}],
          },
          5,
        ).refused,
      ).toBe(true)
    })

    it("does NOT flag a single benign mention that isn't a fast-path term", () => {
      expect(
        looksLikeFailureRefusal(
          {
            topTakeaway:
              "Tax Court issued an opinion on collection due process; review for active CDP cases.",
            learnings: [{}, {}, {}, {}, {}],
          },
          5,
        ).refused,
      ).toBe(false)
    })
  })

  describe("structural checks", () => {
    it("flags empty learnings array", () => {
      expect(
        looksLikeFailureRefusal(
          { topTakeaway: "Real-looking takeaway about IRC § 7122.", learnings: [] },
          5,
        ).refused,
      ).toBe(true)
    })

    it("flags refused-most: learnings << decodableCount", () => {
      expect(
        looksLikeFailureRefusal(
          { topTakeaway: "Tax Court issued an opinion on CDP appeals.", learnings: [{}, {}] },
          20, // 20 decodable but Claude returned only 2 → refused most
        ).refused,
      ).toBe(true)
    })

    it("does not flag refused-most when ratio is healthy", () => {
      expect(
        looksLikeFailureRefusal(
          {
            topTakeaway: "Tax Court issued an opinion on CDP appeals.",
            learnings: Array.from({ length: 5 }, () => ({})),
          },
          6,
        ).refused,
      ).toBe(false)
    })
  })

  describe("real practitioner takeaways (must NOT be flagged)", () => {
    it("OIC § 7122 reasonable collection potential update", () => {
      expect(
        looksLikeFailureRefusal(
          {
            topTakeaway:
              "IRS published Rev. Proc. 2026-12 updating reasonable collection potential calculations under IRC § 7122; review pending OIC submissions.",
            learnings: [{}, {}, {}, {}, {}, {}],
          },
          7,
        ).refused,
      ).toBe(false)
    })

    it("CDP appeal procedure clarification", () => {
      expect(
        looksLikeFailureRefusal(
          {
            topTakeaway:
              "Tax Court clarified the equivalent hearing standard under IRC § 6320 — applies to lien appeals filed after 30 days.",
            learnings: [{}, {}, {}, {}],
          },
          5,
        ).refused,
      ).toBe(false)
    })

    it("Treasury Regulation update on innocent spouse", () => {
      expect(
        looksLikeFailureRefusal(
          {
            topTakeaway:
              "Treasury issued final regulations under IRC § 6015(c) clarifying allocation requirements for separation-of-liability relief.",
            learnings: [{}, {}, {}, {}, {}],
          },
          6,
        ).refused,
      ).toBe(false)
    })
  })
})
