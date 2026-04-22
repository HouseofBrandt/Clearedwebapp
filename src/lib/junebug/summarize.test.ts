import { describe, it, expect } from "vitest"
import {
  shouldRegenerateSummary,
  shouldRegenerateSummaryOnTurn,
  SUMMARY_THRESHOLD,
  RAW_TAIL_SIZE,
  SUMMARY_INTERVAL,
} from "./summarize"

describe("shouldRegenerateSummary", () => {
  it("does not fire below the threshold", () => {
    for (let n = 0; n < SUMMARY_THRESHOLD; n++) {
      expect(shouldRegenerateSummary(n)).toBe(false)
    }
  })

  it("fires exactly at the threshold (40)", () => {
    expect(shouldRegenerateSummary(SUMMARY_THRESHOLD)).toBe(true)
  })

  it("fires every SUMMARY_INTERVAL past the threshold", () => {
    expect(shouldRegenerateSummary(SUMMARY_THRESHOLD + SUMMARY_INTERVAL)).toBe(true)
    expect(shouldRegenerateSummary(SUMMARY_THRESHOLD + 2 * SUMMARY_INTERVAL)).toBe(true)
    expect(shouldRegenerateSummary(SUMMARY_THRESHOLD + 4 * SUMMARY_INTERVAL)).toBe(true)
  })

  it("does not fire between intervals", () => {
    // 41-59 are between 40 and 60 — must all be false
    for (let n = SUMMARY_THRESHOLD + 1; n < SUMMARY_THRESHOLD + SUMMARY_INTERVAL; n++) {
      expect(shouldRegenerateSummary(n)).toBe(false)
    }
  })

  it("does not fire one short of an interval", () => {
    expect(shouldRegenerateSummary(SUMMARY_THRESHOLD + SUMMARY_INTERVAL - 1)).toBe(false)
  })

  it("turn counts increment by 2 (USER + ASSISTANT) — verify trigger pattern", () => {
    // Real life: each turn adds 2 messages, so counts go ... 38, 40, 42, ...
    // 40 must trigger; 42 must not; 60 must trigger again.
    expect(shouldRegenerateSummary(38)).toBe(false)
    expect(shouldRegenerateSummary(40)).toBe(true)
    expect(shouldRegenerateSummary(42)).toBe(false)
    expect(shouldRegenerateSummary(58)).toBe(false)
    expect(shouldRegenerateSummary(60)).toBe(true)
  })
})

describe("shouldRegenerateSummaryOnTurn", () => {
  it("does not fire below the threshold", () => {
    expect(shouldRegenerateSummaryOnTurn(36, 38)).toBe(false)
    expect(shouldRegenerateSummaryOnTurn(0, 2)).toBe(false)
  })

  it("fires when a turn crosses 40 exactly (even sequence, no errors)", () => {
    expect(shouldRegenerateSummaryOnTurn(38, 40)).toBe(true)
  })

  it("fires when an odd sequence steps OVER 40 (error-polluted thread)", () => {
    // Real-world case: an earlier errored assistant drops the errorless
    // count by 1. Sequence of post-turn counts is ..., 37, 39, 41, 43 —
    // never 40. Must still trigger on the 39 -> 41 step.
    expect(shouldRegenerateSummaryOnTurn(39, 41)).toBe(true)
  })

  it("fires when an odd sequence crosses 60 via 59 -> 61", () => {
    expect(shouldRegenerateSummaryOnTurn(59, 61)).toBe(true)
  })

  it("does not fire on non-boundary steps (42 -> 44)", () => {
    expect(shouldRegenerateSummaryOnTurn(42, 44)).toBe(false)
  })

  it("does not fire on steps well below the next boundary (45 -> 47)", () => {
    expect(shouldRegenerateSummaryOnTurn(45, 47)).toBe(false)
  })

  it("fires exactly once per boundary — subsequent turns in the same bucket don't re-fire", () => {
    // Turn that crosses 40 fires; the next turn (40 -> 42) must not.
    expect(shouldRegenerateSummaryOnTurn(38, 40)).toBe(true)
    expect(shouldRegenerateSummaryOnTurn(40, 42)).toBe(false)
    // Jump further inside the bucket — still no fire until 60
    expect(shouldRegenerateSummaryOnTurn(56, 58)).toBe(false)
  })

  it("handles a large turn delta that spans two boundaries (fires once, not twice)", () => {
    // Unlikely in production (turns are always 2) but should be correct
    // for any positive delta.
    expect(shouldRegenerateSummaryOnTurn(35, 65)).toBe(true)
  })
})

describe("summarize constants", () => {
  it("threshold is 40 per spec §6.5.1", () => {
    expect(SUMMARY_THRESHOLD).toBe(40)
  })
  it("raw tail is 20", () => {
    expect(RAW_TAIL_SIZE).toBe(20)
  })
  it("re-summary interval matches the raw tail (must keep summary covering everything except the tail)", () => {
    expect(SUMMARY_INTERVAL).toBe(RAW_TAIL_SIZE)
  })
})
