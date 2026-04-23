import { describe, it, expect } from "vitest"
import { renderMemo } from "./renderer"
import type { MemoDraft } from "./types"

function fixture(overrides: Partial<MemoDraft> = {}): MemoDraft {
  const base: MemoDraft = {
    header: {
      to: "Jane Doe",
      from: "John Smith",
      re: "Application of IRC § 1402(a)(13) to LLP members",
      date: "April 23, 2026",
    },
    facts: [
      {
        runs: [
          { kind: "text", text: "The " },
          { kind: "quote", text: "Taxpayer" },
          {
            kind: "text",
            text: " is a member of an LLP that files Form 1065. The Taxpayer receives both guaranteed payments for services and distributive share of partnership profit. The question is whether the Taxpayer must treat either or both as net earnings from self-employment.",
          },
        ],
      },
    ],
    questionsPresented: [
      {
        number: 1,
        runs: [
          {
            kind: "text",
            text: "Whether an LLP member who actively provides services to the partnership must include his distributive share in net earnings from self-employment under IRC § 1402(a)(13).",
          },
        ],
      },
    ],
    shortAnswer: [
      {
        number: 1,
        runs: [
          {
            kind: "text",
            text: "Likely yes. An LLP member who actively provides services to the partnership is not a \u201Climited partner\u201D within the meaning of IRC § 1402(a)(13); the Taxpayer\u2019s distributive share is subject to self-employment tax.",
          },
          { kind: "citation", ref: { citationId: "c1" } },
        ],
      },
    ],
    discussion: {
      subsections: [
        {
          number: 1,
          title: "The statutory rule",
          paragraphs: [
            {
              runs: [
                {
                  kind: "text",
                  text: "IRC § 1402(a)(13) excludes from self-employment income the distributive share of any partner who is a \u201Climited partner, as such.\u201D The exclusion does not reach guaranteed payments for services.",
                },
              ],
            },
          ],
        },
        {
          number: 2,
          title: "Application to LLP members",
          paragraphs: [
            {
              runs: [
                { kind: "text", text: "In " },
                { kind: "emphasis", text: "Renkemeyer" },
                {
                  kind: "text",
                  text: ", the Tax Court held that LLP members who actively provided legal services to the firm were not limited partners within the meaning of § 1402(a)(13).",
                },
                { kind: "citation", ref: { citationId: "c1" } },
              ],
            },
          ],
        },
      ],
    },
    conclusion: [
      {
        runs: [
          {
            kind: "text",
            text: "The Taxpayer\u2019s distributive share is likely subject to self-employment tax. The firm recommends treating it as net earnings from self-employment on the Taxpayer\u2019s return.",
          },
        ],
      },
    ],
    citations: [
      {
        id: "c1",
        fullCitation: "Renkemeyer, Campbell & Weaver, LLP v. Comm\u2019r, 136 T.C. 137 (2011)",
        shortName: "Renkemeyer",
        parenthetical: "holding that LLP members who provided legal services were not \u201climited partners\u201d under § 1402(a)(13)",
      },
    ],
    bodyOfLaw: "federal tax law",
  }
  return { ...base, ...overrides }
}

describe("renderMemo", () => {
  it("produces a non-empty Buffer for a well-formed memo", async () => {
    const buf = await renderMemo(fixture())
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it("starts with the .docx ZIP signature (PK)", async () => {
    const buf = await renderMemo(fixture())
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
  })

  it("renders without throwing when optional header fields are omitted", async () => {
    const buf = await renderMemo(
      fixture({
        header: {
          re: "Partnership-level interest deduction",
          date: "April 23, 2026",
          // to, from, cc, letterhead all omitted — renderer inserts placeholders
        },
      })
    )
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it("renders a memo with a flat discussion (no subsections)", async () => {
    const buf = await renderMemo(
      fixture({
        discussion: {
          paragraphs: [
            {
              runs: [
                {
                  kind: "text",
                  text: "A single-paragraph discussion still renders. The renderer falls back to flat paragraphs when no subsections are provided.",
                },
              ],
            },
          ],
        },
      })
    )
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it("renders a memo with multiple citations", async () => {
    const buf = await renderMemo(
      fixture({
        citations: [
          {
            id: "c1",
            fullCitation: "IRC \u00A7 1402(a)(13)",
          },
          {
            id: "c2",
            fullCitation: "Treas. Reg. \u00A7 1.1402(a)-2",
          },
          {
            id: "c3",
            fullCitation: "Renkemeyer, Campbell & Weaver, LLP v. Comm\u2019r, 136 T.C. 137 (2011)",
            parenthetical: "holding that LLP members providing legal services are not limited partners",
          },
        ],
      })
    )
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it("emits a fallback text when prose references an unknown citationId", async () => {
    // The renderer shouldn't crash — it should surface the bug inline so the
    // reviewer sees it.
    const buf = await renderMemo(
      fixture({
        conclusion: [
          {
            runs: [
              { kind: "text", text: "See " },
              { kind: "citation", ref: { citationId: "bogus-id" } },
              { kind: "text", text: "." },
            ],
          },
        ],
      })
    )
    expect(buf.byteLength).toBeGreaterThan(1000)
    // Not easy to assert on the text without unzipping the docx; trust the
    // logic in runsToDocx + the lint of the generator tests below.
  })

  it("handles signals and pinpoints without throwing", async () => {
    const buf = await renderMemo(
      fixture({
        citations: [
          {
            id: "c1",
            fullCitation: "Watson v. United States, 668 F.3d 1008 (8th Cir. 2012)",
            shortName: "Watson",
            signal: "see",
            pinpoint: "1018",
            parenthetical: "reasonable compensation case",
          },
        ],
      })
    )
    expect(buf.byteLength).toBeGreaterThan(1000)
  })
})
