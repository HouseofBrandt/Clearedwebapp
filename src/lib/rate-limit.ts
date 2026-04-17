/**
 * Simple in-memory rate limiter for API endpoints.
 * In production, replace with Redis-backed solution (e.g., @upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of Array.from(store.entries())) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  maxRequests: number    // Max requests per window
  windowMs: number       // Window size in milliseconds
}

export const RATE_LIMITS = {
  aiAnalysis: { maxRequests: 20, windowMs: 60 * 60 * 1000 } as RateLimitConfig,     // 20/hour
  documentUpload: { maxRequests: 100, windowMs: 60 * 60 * 1000 } as RateLimitConfig, // 100/hour
  caseCreate: { maxRequests: 10, windowMs: 60 * 60 * 1000 } as RateLimitConfig,      // 10/hour
  feedPost: { maxRequests: 50, windowMs: 60 * 60 * 1000 } as RateLimitConfig,        // 50/hour
  // Junebug conversational send — higher ceiling than AI analysis since
  // each turn is smaller but used more frequently during an active
  // research session. Burst and hourly limits in one (short window
  // catches bursts, long window catches sustained abuse).
  junebugSend: { maxRequests: 60, windowMs: 60 * 60 * 1000 } as RateLimitConfig,     // 60/hour
  junebugBurst: { maxRequests: 15, windowMs: 60 * 1000 } as RateLimitConfig,         // 15/minute
  // Pippen "more / less like this" signals. One practitioner shouldn't
  // be reshaping the firm's harvest preferences through spam clicks.
  tasteSignal: { maxRequests: 30, windowMs: 5 * 60 * 1000 } as RateLimitConfig,      // 30 per 5 min
  default: { maxRequests: 200, windowMs: 60 * 60 * 1000 } as RateLimitConfig,        // 200/hour
}

export function checkRateLimit(userId: string, endpoint: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${userId}:${endpoint}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}
