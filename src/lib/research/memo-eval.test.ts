import { describe, it, expect } from "vitest"
import type { MemoDraft } from "@/lib/memo-renderer/types"
import {
  validateNoFirstPerson,
  validateNoForbiddenIntensifiers,
  validateStructure,
  validateQuestionForm,
  validateCitationsVerified,
  absenceOf,
  EVAL_CASES,
} from "./memo-eval"

function baseDraft(): MemoDraft {
  return {
    header: { re: "Test", date: "April 23, 2026" },
    facts: [{ runs: [{ kind: "text", text: "The Taxpayer is a partner in a partnership. The partnership files Form 1065." }] }],
    questionsPresented: [{ number: 1, runs: [{ kind: "text", text: "Whether the Taxpayer owes SE tax under § 1402(a)(13)." }] }],
    shortAnswer: [{ number: 1, runs: [{ kind: "text", text: "Likely yes." }] }],
    discussion: {
      paragraphs: [{ runs: [{ kind: "text", text: "Under § 1402(a)(13), distributive share of a limited partner is excluded. The regulations address the definition. Case law fills in the details." }] }],
    },
    conclusion: [{ runs: [{ kind: "text", text: "The Taxpayer's distributive share is likely SE income." }] }],
    citations: [
      {
        id: "c1",
        fullCitation: "IRC § 1402(a)(13)",
        verification: { status: "verified" },
      },
    ],
    bodyOfLaw: "federal tax law",
  }
}

describe("validateNoFirstPerson", () => {
  it("passes on a clean memo", () => {
    expect(validateNoFirstPerson(baseDraft())).toEqual([])
  })

  it("flags 'I think'", () => {
    const d = baseDraft()
    d.facts[0]!.runs = [{ kind: "text", text: "I think the Taxpayer owes SE tax." }]
    const failures = validateNoFirstPerson(d)
    expect(failures.length).toBeGreaterThan(0)
    expect(failures[0]).toMatch(/first-person/)
  })

  it("flags 'we recommend'", () => {
    const d = baseDraft()
    d.conclusion[0]!.runs = [{ kind: "text", text: "We recommend treating it as SE income." }]
    const failures = validateNoFirstPerson(d)
    expect(failures.some((f) => f.includes("we"))).toBe(true)
  })
})

describe("validateNoForbiddenIntensifiers", () => {
  it("passes on hedged language", () => {
    expect(validateNoForbiddenIntensifiers(baseDraft())).toEqual([])
  })

  it("flags 'safe position'", () => {
    const d = baseDraft()
    d.conclusion[0]!.runs = [{ kind: "text", text: "This is a safe position for the Taxpayer." }]
    expect(validateNoForbiddenIntensifiers(d).length).toBeGreaterThan(0)
  })

  it("flags 'obviously'", () => {
    const d = baseDraft()
    d.conclusion[0]!.runs = [{ kind: "text", text: "The answer is obviously yes." }]
    expect(validateNoForbiddenIntensifiers(d).length).toBeGreaterThan(0)
  })
})

describe("validateStructure", () => {
  it("passes on a complete memo", () => {
    expect(validateStructure(baseDraft())).toEqual([])
  })

  it("flags empty Facts", () => {
    const d = baseDraft()
    d.facts = []
    const failures = validateStructure(d)
    expect(failures.some((f) => f.includes("Facts"))).toBe(true)
  })

  it("flags mismatched Questions/Short Answer count", () => {
    const d = baseDraft()
    d.questionsPresented.push({ number: 2, runs: [{ kind: "text", text: "Whether X." }] })
    const failures = validateStructure(d)
    expect(failures.some((f) => /count/.test(f))).toBe(true)
  })

  it("flags empty Discussion (no paragraphs and no subsections)", () => {
    const d = baseDraft()
    d.discussion = {}
    const failures = validateStructure(d)
    expect(failures.some((f) => /Discussion/.test(f))).toBe(true)
  })
})

describe("validateQuestionForm", () => {
  it("passes when each question starts with 'Whether'", () => {
    expect(validateQuestionForm(baseDraft())).toEqual([])
  })

  it("flags a question that doesn't start with 'Whether'", () => {
    const d = baseDraft()
    d.questionsPresented[0]!.runs = [{ kind: "text", text: "Does the Taxpayer owe SE tax?" }]
    const failures = validateQuestionForm(d)
    expect(failures.length).toBe(1)
  })
})

describe("validateCitationsVerified", () => {
  it("passes when every citation is verified", () => {
    expect(validateCitationsVerified(baseDraft())).toEqual([])
  })

  it("flags not_found citations as still present in the memo", () => {
    const d = baseDraft()
    d.citations[0]!.verification = { status: "not_found" }
    const failures = validateCitationsVerified(d)
    expect(failures.length).toBe(1)
    expect(failures[0]).toMatch(/not_found/)
  })

  it("flags citations missing a verification record entirely", () => {
    const d = baseDraft()
    delete d.citations[0]!.verification
    expect(validateCitationsVerified(d).length).toBe(1)
  })
})

describe("absenceOf (hallucination probe)", () => {
  it("passes when the forbidden citation is NOT in the citation list", () => {
    const check = absenceOf("Ghost v. Commissioner", "fabricated case test")
    expect(check(baseDraft())).toEqual([])
  })

  it("flags the forbidden citation when present", () => {
    const d = baseDraft()
    d.citations.push({
      id: "c2",
      fullCitation: "Ghost v. Commissioner, 999 T.C. 999 (2099)",
      verification: { status: "not_found" },
    })
    const check = absenceOf("Ghost v. Commissioner", "fabricated case test")
    const failures = check(d)
    expect(failures.length).toBe(1)
  })
})

describe("EVAL_CASES", () => {
  it("exports four cases matching spec §7.3", () => {
    expect(EVAL_CASES.length).toBe(4)
    const ids = EVAL_CASES.map((e) => e.id)
    expect(ids).toContain("renkemeyer-trap")
    expect(ids).toContain("watson-distinguish")
    expect(ids).toContain("voice-structure")
    expect(ids).toContain("calibration")
  })

  it("every case has at least the core validators", () => {
    for (const ec of EVAL_CASES) {
      expect(ec.validators.length).toBeGreaterThanOrEqual(4)
    }
  })
})
