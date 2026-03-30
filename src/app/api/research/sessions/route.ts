import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { z } from "zod"

// ─── Validation ──────────────────────────────────────────────────

const createSessionSchema = z.object({
  mode: z.enum([
    "QUICK_ANSWER",
    "ISSUE_BRIEF",
    "RESEARCH_MEMORANDUM",
    "AUTHORITY_SURVEY",
    "COUNTERARGUMENT_PREP",
  ]),
  questionText: z.string().min(1, "questionText is required"),
  factsText: z.string().optional(),
  proceduralPosture: z.string().optional(),
  intendedAudience: z.string().optional(),
  knownAuthorities: z.string().optional(),
  specificQuestions: z.string().optional(),
  sourcePriorities: z.record(z.number()).optional(),
  excludedSources: z.array(z.string()).optional(),
  recencyBias: z.number().int().min(0).max(100).optional(),
  caseId: z.string().optional(),
})

// ─── POST /api/research/sessions ─────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = createSessionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = parsed.data

    // If caseId provided, verify it exists
    if (data.caseId) {
      const caseRecord = await prisma.case.findUnique({
        where: { id: data.caseId },
        select: { id: true },
      })
      if (!caseRecord) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 })
      }
    }

    const session = await prisma.researchSession.create({
      data: {
        mode: data.mode,
        questionText: data.questionText,
        factsText: data.factsText ?? null,
        proceduralPosture: data.proceduralPosture ?? null,
        intendedAudience: data.intendedAudience ?? "Internal case file",
        knownAuthorities: data.knownAuthorities ?? null,
        specificQuestions: data.specificQuestions ?? null,
        sourcePriorities: data.sourcePriorities ?? undefined,
        excludedSources: data.excludedSources ?? [],
        recencyBias: data.recencyBias ?? 50,
        caseId: data.caseId ?? null,
        createdById: auth.userId,
        status: "INTAKE",
      },
    })

    logAudit({
      userId: auth.userId,
      action: "RESEARCH_SESSION_CREATED",
      caseId: data.caseId,
      resourceId: session.id,
      resourceType: "ResearchSession",
      metadata: { mode: data.mode },
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error: any) {
    console.error("[Research Sessions] POST error:", error.message)
    return NextResponse.json(
      { error: "Failed to create research session" },
      { status: 500 }
    )
  }
}

// ─── GET /api/research/sessions ──────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { searchParams } = new URL(request.url)

    const mode = searchParams.get("mode")
    const status = searchParams.get("status")
    const caseId = searchParams.get("caseId")
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 100)
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0

    const where: Record<string, any> = {}
    if (mode) where.mode = mode
    if (status) where.status = status
    if (caseId) where.caseId = caseId

    const [sessions, total] = await Promise.all([
      prisma.researchSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          case: { select: { id: true, caseNumber: true, clientName: true } },
          _count: { select: { sources: true, reviewActions: true } },
        },
      }),
      prisma.researchSession.count({ where }),
    ])

    return NextResponse.json({ sessions, total, limit, offset })
  } catch (error: any) {
    console.error("[Research Sessions] GET error:", error.message)
    return NextResponse.json(
      { error: "Failed to list research sessions" },
      { status: 500 }
    )
  }
}
