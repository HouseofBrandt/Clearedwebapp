import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from "./rate-limit"

/**
 * Rate-limit test suite. These run against the actual in-memory store
 * so sequencing matters — each test uses a unique endpoint key to
 * avoid cross-test pollution.
 */

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-17T12:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const tinyConfig: RateLimitConfig = { maxRequests: 3, windowMs: 60_000 }

  it("allows the first request and decrements remaining", () => {
    const r = checkRateLimit("user1", "test1-first", tinyConfig)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
    expect(r.resetAt).toBeGreaterThan(Date.now())
  })

  it("counts subsequent requests toward the same window", () => {
    checkRateLimit("user1", "test1-counts", tinyConfig)
    checkRateLimit("user1", "test1-counts", tinyConfig)
    const r = checkRateLimit("user1", "test1-counts", tinyConfig)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(0)
  })

  it("rejects once the limit is reached", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user1", "test1-reject", tinyConfig)
    }
    const r = checkRateLimit("user1", "test1-reject", tinyConfig)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it("resets when the window expires", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user2", "test1-reset", tinyConfig)
    }
    // Advance past the window
    vi.advanceTimersByTime(61_000)
    const r = checkRateLimit("user2", "test1-reset", tinyConfig)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
  })

  it("keys independently per (userId, endpoint) pair", () => {
    // Exhaust user3's limit on endpoint-a
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user3", "test1-keys-a", tinyConfig)
    }
    // user3 on a different endpoint — fresh window
    const r = checkRateLimit("user3", "test1-keys-b", tinyConfig)
    expect(r.allowed).toBe(true)
    // user4 on the same endpoint — also fresh window
    const r2 = checkRateLimit("user4", "test1-keys-a", tinyConfig)
    expect(r2.allowed).toBe(true)
  })

  it("resetAt reflects the window END, not the last-request time", () => {
    const first = checkRateLimit("user5", "test1-resetAt", tinyConfig)
    vi.advanceTimersByTime(10_000)
    const second = checkRateLimit("user5", "test1-resetAt", tinyConfig)
    // resetAt should be the same — anchored to the first request's window
    expect(second.resetAt).toBe(first.resetAt)
  })

  it("includes resetAt in the denial response", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user6", "test1-deny-reset", tinyConfig)
    }
    const denial = checkRateLimit("user6", "test1-deny-reset", tinyConfig)
    expect(denial.allowed).toBe(false)
    expect(denial.resetAt).toBeGreaterThan(Date.now())
  })
})

describe("RATE_LIMITS tiers", () => {
  it("Junebug send tier is 60/hour", () => {
    expect(RATE_LIMITS.junebugSend.maxRequests).toBe(60)
    expect(RATE_LIMITS.junebugSend.windowMs).toBe(60 * 60 * 1000)
  })

  it("Junebug burst tier is 15/minute", () => {
    expect(RATE_LIMITS.junebugBurst.maxRequests).toBe(15)
    expect(RATE_LIMITS.junebugBurst.windowMs).toBe(60 * 1000)
  })

  it("Pippen taste signal is 30 per 5 minutes", () => {
    expect(RATE_LIMITS.tasteSignal.maxRequests).toBe(30)
    expect(RATE_LIMITS.tasteSignal.windowMs).toBe(5 * 60 * 1000)
  })

  it("burst window is at least 10x shorter than the sustained window", () => {
    // If these ever invert, the burst ceiling stops catching bursts
    expect(RATE_LIMITS.junebugBurst.windowMs).toBeLessThan(
      RATE_LIMITS.junebugSend.windowMs / 10
    )
  })
})

describe("rate-limit behavior matrix (realistic Junebug usage)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-17T12:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows a full workday of Junebug sends up to 60/hour", () => {
    // Simulate 60 sends in 60 minutes at 1 per minute
    let allowedCount = 0
    for (let i = 0; i < 60; i++) {
      const r = checkRateLimit("practitioner", "junebug:send:hour:simA", RATE_LIMITS.junebugSend)
      if (r.allowed) allowedCount++
      vi.advanceTimersByTime(60_000) // 1 minute
    }
    expect(allowedCount).toBe(60)
  })

  it("denies the 61st send within an hour", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("practitioner", "junebug:send:hour:simB", RATE_LIMITS.junebugSend)
    }
    const r = checkRateLimit("practitioner", "junebug:send:hour:simB", RATE_LIMITS.junebugSend)
    expect(r.allowed).toBe(false)
  })

  it("catches a burst of 16 rapid sends", () => {
    let allowed = 0
    let denied = 0
    for (let i = 0; i < 16; i++) {
      const r = checkRateLimit("practitioner", "junebug:send:burst:sim", RATE_LIMITS.junebugBurst)
      if (r.allowed) allowed++
      else denied++
    }
    expect(allowed).toBe(15)
    expect(denied).toBe(1)
  })
})
