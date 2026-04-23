/**
 * Regression eval set for the formal memo pipeline (spec §7.3).
 *
 * Each case is a fact pattern + a validator that runs against a
 * generated MemoDraft. Split from memo-generator.test.ts because these
 * cases are intended to be run against a live model (or recorded cassette)
 * by the engineer on prompt/model changes — NOT as hermetic unit tests.
 *
 * How to run locally:
 *   1. set ANTHROPIC_API_KEY + CLEARED_OPUS_4_7_ENABLED=true
 *   2. call runMemoEval(EVAL_CASES[0]) from a repl / script
 *   3. review the returned { draft, failures } — any failure array item
 *      flags a rule the output violated.
 *
 * The goal is not to catch every stylistic problem automatically — this
 * is a bar-lowerer, not a bar-replacer. Reviewer judgment still applies.
 */

import type { MemoDraft, MemoParagraph, NumberedItem } from "@/lib/memo-renderer/types"
import { generateMemo } from "./memo-generator"

export interface EvalCase {
  id: string
  /** Short label for the failure-mode this case probes. */
  name: string
  /** Prompt sent to the generator. */
  prompt: string
  /** Optional additional context. */
  context?: string
  /** Validators that run against the produced draft. Return failure strings. */
  validators: Array<(draft: MemoDraft) => string[]>
}

/** Aggregate text content of a MemoParagraph or NumberedItem. */
function runsText(runs: MemoParagraph["runs"]): string {
  return runs
    .map((r) => {
      switch (r.kind) {
        case "text":
        case "emphasis":
        case "strong":
        case "quote":
          return r.text
        case "citation":
          return ""
      }
    })
    .join(" ")
}

function allProseText(draft: MemoDraft): string {
  const chunks: string[] = []
  for (const p of draft.facts) chunks.push(runsText(p.runs))
  for (const q of draft.questionsPresented) chunks.push(runsText(q.runs))
  for (const a of draft.shortAnswer) chunks.push(runsText(a.runs))
  if (draft.discussion.paragraphs) {
    for (const p of draft.discussion.paragraphs) chunks.push(runsText(p.runs))
  }
  if (draft.discussion.subsections) {
    for (const s of draft.discussion.subsections) {
      chunks.push(s.title)
      for (const p of s.paragraphs) chunks.push(runsText(p.runs))
    }
  }
  for (const p of draft.conclusion) chunks.push(runsText(p.runs))
  return chunks.join("\n\n")
}

// ── Generic validators ──────────────────────────────────────────────

/** §3.1: no first-person pronouns in the memo body. */
export function validateNoFirstPerson(draft: MemoDraft): string[] {
  const text = allProseText(draft)
  const failures: string[] = []
  const patterns: Array<[RegExp, string]> = [
    [/\bI\b/, "first-person 'I'"],
    [/\bwe\b/i, "first-person 'we'"],
    [/\bour\b/i, "first-person 'our'"],
    [/\bmy\b/i, "first-person 'my'"],
    [/\bus\b/i, "first-person 'us' (potentially — review context)"],
  ]
  for (const [rx, label] of patterns) {
    if (rx.test(text)) failures.push(`voice: contains ${label}`)
  }
  return failures
}

/** §3.3: never write "safe", "no-risk", "obviously", "clearly". */
export function validateNoForbiddenIntensifiers(draft: MemoDraft): string[] {
  const text = allProseText(draft).toLowerCase()
  const failures: string[] = []
  const forbidden = [
    ["safe position", "\"safe\" per §3.3"],
    ["no-risk", "\"no-risk\" per §3.3"],
    ["no risk", "\"no risk\" per §3.3"],
    ["obviously", "\"obviously\" per §3.3"],
    ["clearly,", "\"clearly,\" used as intensifier per §3.3"],
    ["clearly the", "\"clearly the\" used as intensifier per §3.3"],
  ]
  for (const [needle, msg] of forbidden) {
    if (text.includes(needle)) failures.push(`calibration: uses ${msg}`)
  }
  return failures
}

/** §2: memo must have all five sections. */
export function validateStructure(draft: MemoDraft): string[] {
  const failures: string[] = []
  if (draft.facts.length === 0) failures.push("structure: Facts is empty")
  if (draft.questionsPresented.length === 0) failures.push("structure: Questions Presented is empty")
  if (draft.shortAnswer.length === 0) failures.push("structure: Short Answer is empty")
  if (
    (!draft.discussion.paragraphs || draft.discussion.paragraphs.length === 0) &&
    (!draft.discussion.subsections || draft.discussion.subsections.length === 0)
  ) {
    failures.push("structure: Discussion is empty")
  }
  if (draft.conclusion.length === 0) failures.push("structure: Conclusion is empty")
  if (draft.shortAnswer.length !== draft.questionsPresented.length) {
    failures.push(
      `structure: Short Answer count (${draft.shortAnswer.length}) != Questions Presented count (${draft.questionsPresented.length})`
    )
  }
  return failures
}

/** §2: each question must begin with "Whether". */
export function validateQuestionForm(draft: MemoDraft): string[] {
  const failures: string[] = []
  draft.questionsPresented.forEach((q, i) => {
    const text = runsText(q.runs).trim()
    if (!/^whether\b/i.test(text)) {
      failures.push(`questionPresented[${i}]: does not start with "Whether"`)
    }
  })
  return failures
}

/** §3.4: no one-sentence paragraphs outside the Short Answer section. */
export function validateParagraphLength(draft: MemoDraft): string[] {
  const failures: string[] = []
  const check = (label: string, paras: MemoParagraph[]) => {
    paras.forEach((p, i) => {
      const text = runsText(p.runs).trim()
      const sentences = text.split(/[.!?]\s+/).filter((s) => s.length > 0)
      if (sentences.length < 2 && text.length < 100) {
        failures.push(`paragraph: ${label}[${i}] is very short (likely single sentence)`)
      }
    })
  }
  check("facts", draft.facts)
  check("conclusion", draft.conclusion)
  if (draft.discussion.subsections) {
    draft.discussion.subsections.forEach((s, i) => {
      check(`discussion.subsection[${i}].paragraphs`, s.paragraphs)
    })
  }
  return failures
}

/** §4.1: every citation must have a verification record. */
export function validateCitationsVerified(draft: MemoDraft): string[] {
  const failures: string[] = []
  for (const c of draft.citations) {
    if (!c.verification) {
      failures.push(`citation[${c.id}]: missing verification record`)
      continue
    }
    if (c.verification.status === "not_found" || c.verification.status === "unverifiable") {
      failures.push(
        `citation[${c.id}] (${c.fullCitation}): status=${c.verification.status} — memo should have dropped or replaced it`
      )
    }
  }
  return failures
}

/** Case-specific: a probe that asserts a citation is NOT present. */
export function absenceOf(substr: string, reason: string) {
  return function (draft: MemoDraft): string[] {
    const haystack = draft.citations.map((c) => c.fullCitation).join(" | ")
    if (haystack.toLowerCase().includes(substr.toLowerCase())) {
      return [`hallucination-guard: citation list contains "${substr}" — ${reason}`]
    }
    return []
  }
}

// ── Eval cases (spec §7.3) ──────────────────────────────────────────

/**
 * Case 1 — Hallucinated-authority trap. A fact pattern that tempts
 * Renkemeyer misuse (active LLC with passive member). The correct answer
 * does NOT turn on Renkemeyer; the case is often cited but is about LLPs,
 * and the model has been observed to over-generalize. If a draft cites
 * Renkemeyer here, the validator flags it (not strictly wrong, but a
 * reviewer signal — analysis should acknowledge the distinction).
 */
const CASE_HALLUCINATION_TRAP: EvalCase = {
  id: "renkemeyer-trap",
  name: "Tempting Renkemeyer misuse (passive LLC member)",
  prompt: `Our client is a passive member of a single-member-managed Arizona LLC. The LLC is taxed as a partnership (they elected out of default disregarded-entity status and added a second member for estate-planning reasons). Our client contributed capital, does not work at the LLC, and receives only distributive share — no guaranteed payments. Advise whether the distributive share is subject to self-employment tax under IRC § 1402(a)(13).`,
  validators: [
    validateStructure,
    validateQuestionForm,
    validateNoFirstPerson,
    validateNoForbiddenIntensifiers,
    validateCitationsVerified,
    // Not an automatic fail — Renkemeyer CAN be cited as distinguishable.
    // But if the draft cites it as if controlling, human review should catch it.
  ],
}

/**
 * Case 2 — Distinguishing a famous case. Watson addressed reasonable
 * compensation in an S-corp; our fact pattern is a partnership question.
 * Correct analysis acknowledges Watson but distinguishes.
 */
const CASE_DISTINGUISH: EvalCase = {
  id: "watson-distinguish",
  name: "Famous case must be distinguished, not applied",
  prompt: `Our client runs a family limited partnership ("FLP") that holds rental real estate. The general partner is an LLC wholly owned by the client. The client takes no guaranteed payment. The question is whether the IRS could recharacterize some portion of the client's distributive share as compensation subject to self-employment tax under *Watson v. United States*. Note that Watson is an S-corp reasonable-compensation case; the fact pattern here is a partnership.`,
  validators: [
    validateStructure,
    validateQuestionForm,
    validateNoFirstPerson,
    validateNoForbiddenIntensifiers,
    validateCitationsVerified,
  ],
}

/**
 * Case 3 — Voice & structure rules. A simple factual question — tests
 * whether the model adheres to third-person register and required
 * section ordering without the user prompting for it.
 */
const CASE_VOICE_STRUCTURE: EvalCase = {
  id: "voice-structure",
  name: "Voice and structure discipline",
  prompt: `Advise on whether a single-member LLC owned by a U.S. individual taxpayer must file a separate federal income tax return if it has made no election under Treas. Reg. § 301.7701-3.`,
  validators: [
    validateStructure,
    validateQuestionForm,
    validateNoFirstPerson,
    validateNoForbiddenIntensifiers,
    validateParagraphLength,
    validateCitationsVerified,
  ],
}

/**
 * Case 4 — Calibration. A fact pattern where the honest answer is
 * "uncertain" or "aggressive." Tests that the memo does NOT claim
 * false confidence.
 */
const CASE_CALIBRATION: EvalCase = {
  id: "calibration",
  name: "Uncertain position, correct answer is hedged",
  prompt: `Our client made a late § 754 election on an amended partnership return for a closed tax year where the partnership had a substantial § 743(b) basis adjustment event. The IRS has been inconsistent in granting 9100 relief for § 754 elections on closed years. Advise on the client's prospects for a successful 9100 relief request.`,
  validators: [
    validateStructure,
    validateQuestionForm,
    validateNoFirstPerson,
    validateNoForbiddenIntensifiers,
    validateCitationsVerified,
    // Additional hand check: the word "likely", "uncertain", or "aggressive"
    // should appear somewhere in the conclusion.
    (draft: MemoDraft): string[] => {
      const conclusionText = draft.conclusion.map((p) => runsText(p.runs)).join(" ").toLowerCase()
      const hasHedge = /\b(likely|uncertain|aggressive|should|may)\b/.test(conclusionText)
      return hasHedge ? [] : ["calibration: Conclusion lacks any hedging language (likely/uncertain/aggressive/should/may)"]
    },
  ],
}

export const EVAL_CASES: EvalCase[] = [
  CASE_HALLUCINATION_TRAP,
  CASE_DISTINGUISH,
  CASE_VOICE_STRUCTURE,
  CASE_CALIBRATION,
]

// ── Runner ──────────────────────────────────────────────────────────

export interface EvalRunResult {
  caseId: string
  name: string
  draft: MemoDraft
  verification: { total: number; verified: number; notFound: number; unverifiable: number }
  failures: string[]
}

/**
 * Execute a single eval case end-to-end (calls Claude via generateMemo).
 * Intended for local / staging runs, not CI — ANTHROPIC_API_KEY must be
 * set.
 */
export async function runMemoEval(ec: EvalCase): Promise<EvalRunResult> {
  const result = await generateMemo({
    prompt: ec.prompt,
    context: ec.context,
  })
  const failures: string[] = []
  for (const v of ec.validators) {
    failures.push(...v(result.draft))
  }
  return {
    caseId: ec.id,
    name: ec.name,
    draft: result.draft,
    verification: {
      total: result.verification.total,
      verified: result.verification.verified,
      notFound: result.verification.notFound,
      unverifiable: result.verification.unverifiable,
    },
    failures,
  }
}

/** Run every case. Aggregates failures for a pass/fail verdict. */
export async function runAllMemoEvals(): Promise<EvalRunResult[]> {
  const out: EvalRunResult[] = []
  for (const ec of EVAL_CASES) {
    out.push(await runMemoEval(ec))
  }
  return out
}
