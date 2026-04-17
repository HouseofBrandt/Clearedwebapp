import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

/**
 * GET /api/health — liveness + readiness probe.
 *
 * Public (no auth) by design — this is the endpoint uptime monitors,
 * load balancers, and the Vercel deployment verifier hit. We do NOT
 * return sensitive data here: no secrets, no user info, no row counts.
 * Just:
 *   - overall status: "ok" | "degraded"
 *   - component health: database reachable? required env vars present?
 *     Anthropic API key configured?
 *   - the Git SHA of the running build (truncated) so you can tell which
 *     commit is live without asking Vercel
 *
 * Response shape is stable — treat this as a public contract. Uptime
 * monitors will pin to the `status` field.
 *
 * Never caches — always a fresh check, even at the CDN layer.
 *
 * Returns 200 when everything is healthy, 503 when any required check
 * is failing. This lets load balancers take the instance out of
 * rotation automatically.
 */

export const dynamic = "force-dynamic"
export const revalidate = 0

interface CheckResult {
  status: "ok" | "degraded" | "error" | "configured" | "missing"
  detail?: string
  durationMs?: number
}

export async function GET(_request: NextRequest) {
  const startedAt = Date.now()
  const checks: Record<string, CheckResult> = {}

  // ─────────────────────────────────────────────────────────────────
  // Database — a trivial round-trip proves the pool is alive.
  // ─────────────────────────────────────────────────────────────────
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`
    checks.database = { status: "ok", durationMs: Date.now() - dbStart }
  } catch (err: any) {
    checks.database = {
      status: "error",
      detail: err?.message?.slice(0, 200) ?? "Database unreachable",
      durationMs: Date.now() - dbStart,
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Env — the minimum set of required env vars for the app to work.
  // Reports "configured" / "missing" individually so ops can see
  // exactly which one is wrong without having to exec into the box.
  // ─────────────────────────────────────────────────────────────────
  checks.env = requiredEnvStatus([
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "ENCRYPTION_KEY",
  ])

  // ─────────────────────────────────────────────────────────────────
  // Anthropic — presence check only; we don't hit the API here (that
  // would cost a token and get rate-limited by a healthy-looking
  // uptime monitor). If the key's unset, AI features are broken and
  // we should know.
  // ─────────────────────────────────────────────────────────────────
  checks.anthropic = {
    status: process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
  }

  const ok = Object.values(checks).every(
    (c) => c.status === "ok" || c.status === "configured"
  )

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      region: process.env.VERCEL_REGION ?? "unknown",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks,
    },
    {
      // 503 tells load balancers to take us out of rotation when any
      // required check fails. A single bad env var gets us pulled
      // within one health-check interval.
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    }
  )
}

function requiredEnvStatus(keys: string[]): CheckResult {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length === 0) return { status: "ok" }
  return {
    status: "error",
    // Keys (not values) are safe to report — they're not secrets, and
    // telling ops "NEXTAUTH_SECRET is missing" is actionable.
    detail: `missing: ${missing.join(", ")}`,
  }
}
