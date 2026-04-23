import { describe, it, expect, vi, beforeEach } from "vitest"
import type { MemoDraft } from "@/lib/memo-renderer/types"

/**
 * Two-pass generator tests. Anthropic + citation-verifier are both
 * mocked; we exercise: JSON parsing from model response, header default
 * application, verification stat counting, backfill logic, and
 * revise-if-unverified branching.
 */

const anthropicCreateMock = vi.fn()
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: (...args: any[]) => anthropicCreateMock(...args) }
  },
}))

const verifyCitationMock = vi.fn()
vi.mock("./citation-verifier", () => ({
  verifyCitation: (...args: any[]) => verifyCitationMock(...args),
  VERIFY_CITATION_TOOL: { name: "verify_citation" },
}))

vi.mock("@/lib/ai/model-capabilities", () => ({
  buildMessagesRequest: (input: any) => input,
}))

vi.mock("@/lib/ai/model-selection", () => ({
  preferredOpusModel: () => "claude-opus-4-7",
}))

import { generateMemo } from "./memo-generator"

function validDraft(): MemoDraft {
  return {
    header: {
      to: "Jane Doe",
      from: "John Smith",
      re: "IRC § 1402(a)(13) and LLP members",
      date: "April 23, 2026",
    },
    facts: [
      {
        runs: [{ kind: "text", text: "The Taxpayer is a member of an LLP that provides legal services." }],
      },
    ],
    questionsPresented: [
      {
        number: 1,
        runs: [{ kind: "text", text: "Whether the Taxpayer must treat distributive share as SE income under § 1402(a)(13)." }],
      },
    ],
    shortAnswer: [
      {
        number: 1,
        runs: [{ kind: "text", text: "Likely yes." }, { kind: "citation", ref: { citationId: "c1" } }],
      },
    ],
    discussion: {
      paragraphs: [
        { runs: [{ kind: "text", text: "Under § 1402(a)(13), the distributive share of a 'limited partner' is excluded from SE income." }] },
      ],
    },
    conclusion: [
      { runs: [{ kind: "text", text: "The Taxpayer's distributive share is likely SE income." }] },
    ],
    citations: [
      {
        id: "c1",
        fullCitation: "Renkemeyer, Campbell & Weaver, LLP v. Comm'r, 136 T.C. 137 (2011)",
      },
    ],
    bodyOfLaw: "federal tax law",
  }
}

function endTurnResponse(text: string) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 500 },
  }
}

beforeEach(() => {
  anthropicCreateMock.mockReset()
  verifyCitationMock.mockReset()
})

describe("generateMemo — happy path", () => {
  it("parses a JSON draft, verifies citations, renders a buffer", async () => {
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(JSON.stringify(validDraft())))
    verifyCitationMock.mockResolvedValue({
      raw: "Renkemeyer, Campbell & Weaver, LLP v. Comm'r, 136 T.C. 137 (2011)",
      status: "verified",
      verifiedTitle: "Renkemeyer v. Commissioner",
      sourceOfTruth: "courtlistener",
      sourceUrl: "https://courtlistener.com/...",
    })

    const result = await generateMemo({
      prompt: "Analyze whether LLP members owe SE tax on distributive share.",
    })

    expect(Buffer.isBuffer(result.buffer)).toBe(true)
    expect(result.buffer.byteLength).toBeGreaterThan(1000)
    expect(result.verification.total).toBe(1)
    expect(result.verification.verified).toBe(1)
    expect(result.verification.notFound).toBe(0)
    expect(result.draft.citations[0]?.verification?.status).toBe("verified")
  })

  it("strips markdown fences around the JSON draft", async () => {
    const fenced = "```json\n" + JSON.stringify(validDraft()) + "\n```"
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(fenced))
    verifyCitationMock.mockResolvedValue({
      raw: "Renkemeyer, Campbell & Weaver, LLP v. Comm'r, 136 T.C. 137 (2011)",
      status: "verified",
      sourceOfTruth: "courtlistener",
    })

    const result = await generateMemo({ prompt: "test" })
    expect(result.draft.questionsPresented[0]?.number).toBe(1)
  })

  it("applies today's date when header.date is missing from draft and request", async () => {
    const d = validDraft()
    d.header.date = "" // model forgot
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(JSON.stringify(d)))
    verifyCitationMock.mockResolvedValue({
      raw: "X", status: "verified", sourceOfTruth: "courtlistener",
    })

    const result = await generateMemo({ prompt: "test" })
    // Should be a "Month D, YYYY" string — just verify non-empty + matches pattern.
    expect(result.draft.header.date).toMatch(/^\w+ \d{1,2}, \d{4}$/)
  })
})

describe("generateMemo — verification paths", () => {
  it("marks a citation as not_found when verifier says so and triggers revise pass", async () => {
    const bad = validDraft()
    // Draft pass: produce a draft that references an unverifiable citation.
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(JSON.stringify(bad)))

    // Verifier returns not_found.
    verifyCitationMock.mockResolvedValueOnce({
      raw: bad.citations[0].fullCitation,
      status: "not_found",
      sourceOfTruth: "none",
      note: "not found",
    })

    // Revision pass: model returns a draft that drops the bad citation.
    const revised: MemoDraft = {
      ...bad,
      shortAnswer: [
        { number: 1, runs: [{ kind: "text", text: "Likely yes, but the authority could not be confirmed." }] },
      ],
      citations: [],
    }
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(JSON.stringify(revised)))

    const result = await generateMemo({ prompt: "test" })

    expect(result.verification.total).toBe(0) // revised draft has no citations
    expect(result.verification.notFound).toBe(0)
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2) // draft + revise
  })

  it("backfills verification for citations the model wrote without calling the tool", async () => {
    const d = validDraft()
    // Add a second citation. The draft pass will only have "verified" the first
    // via the tool — the second needs backfill verification.
    d.citations.push({
      id: "c2",
      fullCitation: "IRC § 704(b)",
    })
    d.discussion.paragraphs![0]!.runs.push({ kind: "citation", ref: { citationId: "c2" } })
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(JSON.stringify(d)))

    // Two verification calls: one per citation (both called during backfill
    // because neither was called during draft via the tool-use mock).
    verifyCitationMock.mockImplementation(async (raw: string) => {
      if (raw.includes("IRC")) {
        return { raw, status: "verified", sourceOfTruth: "canonical_authority" }
      }
      return { raw, status: "verified", sourceOfTruth: "courtlistener" }
    })

    const result = await generateMemo({ prompt: "test" })
    expect(result.verification.total).toBe(2)
    expect(result.verification.verified).toBe(2)
    expect(verifyCitationMock).toHaveBeenCalledTimes(2)
  })
})

describe("generateMemo — error paths", () => {
  it("throws a clear error when draft response is not JSON", async () => {
    anthropicCreateMock.mockResolvedValueOnce(
      endTurnResponse("I think this is a great question. Let me explain...")
    )
    await expect(generateMemo({ prompt: "test" })).rejects.toThrow(/did not contain a JSON object/)
  })

  it("throws when the draft JSON is malformed", async () => {
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse("{ this is broken: json, }"))
    await expect(generateMemo({ prompt: "test" })).rejects.toThrow(/parse failed/)
  })
})

describe("generateMemo — tool-use multi-turn", () => {
  it("handles a draft pass that calls verify_citation before producing JSON", async () => {
    // Turn 1: model calls verify_citation on one authority.
    anthropicCreateMock.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "verify_citation",
          input: { citation: "Renkemeyer, Campbell & Weaver, LLP v. Comm'r, 136 T.C. 137 (2011)" },
        },
      ],
      usage: { input_tokens: 50, output_tokens: 10 },
    })
    verifyCitationMock.mockResolvedValueOnce({
      raw: "Renkemeyer, Campbell & Weaver, LLP v. Comm'r, 136 T.C. 137 (2011)",
      status: "verified",
      verifiedTitle: "Renkemeyer v. Commissioner",
      sourceOfTruth: "courtlistener",
    })

    // Turn 2: model produces the JSON draft.
    anthropicCreateMock.mockResolvedValueOnce(endTurnResponse(JSON.stringify(validDraft())))

    const result = await generateMemo({ prompt: "test" })
    expect(result.verification.verified).toBe(1)
    // Second verify call should NOT happen — the draft pass already verified
    // this citation, so backfill is a no-op.
    expect(verifyCitationMock).toHaveBeenCalledTimes(1)
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2)
  })
})
