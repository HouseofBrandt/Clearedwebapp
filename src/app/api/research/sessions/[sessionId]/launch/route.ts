import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { conductResearch } from "@/lib/research/web-research"

export const maxDuration = 300

/**
 * POST /api/research/sessions/[sessionId]/launch
 * Launches the research session — runs the AI research pipeline
 * and updates the session with results.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const { sessionId } = await params

    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        case: { select: { caseType: true, clientName: true } },
      },
    })

    if (!session) {
      return NextResponse.json({ error: "Research session not found" }, { status: 404 })
    }

    if (session.status !== "INTAKE") {
      return NextResponse.json(
        { error: `Cannot launch session in ${session.status} status. Must be INTAKE.` },
        { status: 400 }
      )
    }

    // Transition to RETRIEVING
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { status: "RETRIEVING", retrievalStartedAt: new Date() },
    })

    logAudit({
      userId: auth.userId,
      action: "RESEARCH_SESSION_LAUNCHED",
      caseId: session.caseId ?? undefined,
      resourceId: session.id,
      resourceType: "ResearchSession",
      metadata: { mode: session.mode },
    })

    // Run the research in the background (don't await — return 202 immediately)
    executeResearch(sessionId, session).catch((err) => {
      console.error(`[Research] Background execution failed for ${sessionId}:`, err)
    })

    return NextResponse.json(
      { id: sessionId, status: "RETRIEVING", message: "Research session launched" },
      { status: 202 }
    )
  } catch (error: any) {
    console.error("[Research Launch] POST error:", error.message)
    return NextResponse.json(
      { error: "Failed to launch research session" },
      { status: 500 }
    )
  }
}

/**
 * Execute the research pipeline in the background.
 */
async function executeResearch(
  sessionId: string,
  session: {
    questionText: string
    mode: string
    caseId: string | null
    createdById: string
    case: { caseType: string; clientName: string } | null
  },
) {
  try {
    // Transition to COMPOSING
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: { status: "COMPOSING", compositionStartedAt: new Date() },
    })

    const caseContext = session.case
      ? `${session.case.caseType} case for ${session.case.clientName}`
      : undefined

    const scope = session.mode === "QUICK_ANSWER" ? "narrow" as const : "broad" as const

    const result = await conductResearch({
      topic: session.questionText,
      context: caseContext,
      scope,
      saveToKB: true,
      kbCategory: "CUSTOM",
      kbTags: ["research", session.mode.toLowerCase()],
      userId: session.createdById,
    })

    // Store sources
    for (const source of result.sources.slice(0, 20)) {
      await prisma.researchSource.create({
        data: {
          sessionId,
          sourceType: "KB_INTERNAL",
          citation: source.title,
          title: source.title,
          url: source.url,
          snippet: source.snippet,
          authorityScore: 0.5,
          relevanceScore: 0.7,
        },
      }).catch(() => {})
    }

    // Transition to READY_FOR_REVIEW with output
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: {
        status: "READY_FOR_REVIEW",
        output: result.fullText,
        executiveSummary: result.summary,
        webResultCount: result.sources.length,
        completedAt: new Date(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Research] Execution failed for ${sessionId}:`, message)

    // Mark as ready for review with error message so the UI stops polling
    await prisma.researchSession.update({
      where: { id: sessionId },
      data: {
        status: "READY_FOR_REVIEW",
        output: `## Research Failed\n\nAn error occurred while conducting this research:\n\n${message}\n\nPlease try again or contact support if the issue persists.`,
        completedAt: new Date(),
      },
    }).catch(() => {})
  }
}
