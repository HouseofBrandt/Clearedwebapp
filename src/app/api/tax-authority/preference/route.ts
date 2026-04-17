import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

/**
 * Pippen Phase 3 — practitioner "more / less like this" signals on
 * (source × issueCategory) pairs.
 *
 * Populates HarvestPreference. The harvester gate and retrieval scorer
 * both read this table:
 *   - At harvest time: `weight < 1` de-emphasizes the pair; `= 0` drops it.
 *   - At retrieval time: weight is multiplied into the final score.
 *
 * Starting weight is 1.0 (neutral). A delta of +1 multiplies the current
 * weight by 1.15 (cap 2.0). A delta of -1 multiplies by 0.85 (floor 0.0).
 * Keeps the system conservative — one practitioner click never deletes
 * a source.
 */

const WEIGHT_MAX = 2.0
const WEIGHT_MIN = 0.0
const BOOST_FACTOR = 1.15
const DECAY_FACTOR = 0.85

const bodySchema = z.object({
  sourceId: z.string().min(1).max(100),
  issueCategory: z.string().min(1).max(50),
  delta: z.union([z.literal(1), z.literal(-1)]),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = (session.user as any).id as string

  // Cap taste signals at 30 per 5 minutes per practitioner so one user
  // can't reshape the firm's harvest preferences by spamming thumbs-up.
  const limit = checkRateLimit(userId, "pippen:preference", RATE_LIMITS.tasteSignal)
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        detail: "Too many feedback signals. Take a breath, then try again.",
        resetAt: new Date(limit.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
        },
      }
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    const raw = await request.json()
    body = bodySchema.parse(raw)
  } catch (err: any) {
    return NextResponse.json(
      { error: "Invalid body", detail: err?.message },
      { status: 400 }
    )
  }

  const { sourceId, issueCategory, delta } = body
  const now = new Date()

  try {
    // Upsert — create at 1.0 on first signal, then move on each subsequent signal
    const existing = await prisma.harvestPreference.findUnique({
      where: {
        sourceId_issueCategory: { sourceId, issueCategory },
      },
    })

    const current = existing?.weight ?? 1.0
    const factor = delta > 0 ? BOOST_FACTOR : DECAY_FACTOR
    const next = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, current * factor))

    const record = await prisma.harvestPreference.upsert({
      where: {
        sourceId_issueCategory: { sourceId, issueCategory },
      },
      create: {
        sourceId,
        issueCategory,
        weight: next,
        signalCount: 1,
        lastSignalAt: now,
      },
      update: {
        weight: next,
        signalCount: { increment: 1 },
        lastSignalAt: now,
      },
    })

    return NextResponse.json({
      sourceId: record.sourceId,
      issueCategory: record.issueCategory,
      weight: record.weight,
      signalCount: record.signalCount,
    })
  } catch (err: any) {
    console.error("[tax-authority/preference] upsert failed:", err?.message)
    return NextResponse.json(
      { error: "Failed to record preference" },
      { status: 500 }
    )
  }
}

/**
 * List current preferences for the admin/tuning UI.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const sourceId = url.searchParams.get("sourceId") || undefined

  const rows = await prisma.harvestPreference.findMany({
    where: sourceId ? { sourceId } : undefined,
    orderBy: [{ sourceId: "asc" }, { issueCategory: "asc" }],
    take: 500,
  })

  return NextResponse.json({ preferences: rows })
}
