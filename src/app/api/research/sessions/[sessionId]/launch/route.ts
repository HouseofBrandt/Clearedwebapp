import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { conductResearch } from "@/lib/research/web-research"

export const maxDuration = 300

/**
 * POST /api/research/sessions/[sessionId]/launch
 * Launches the research session — runs the AI research pipeline
 * and returns results when complete.
 *
 * Previously fire-and-forgot the research in the background, but on
 * Vercel serverless the function gets garbage-collected after the
 * response is sent, killing the research mid-execution. Now we run
 * synchronously and stream status updates via SSE so the client
 * sees progress and the function stays alive until completion.
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

    logAudit({
      userId: auth.userId,
      action: "RESEARCH_SESSION_LAUNCHED",
      caseId: session.caseId ?? undefined,
      resourceId: session.id,
      resourceType: "ResearchSession",
      metadata: { mode: session.mode },
    })

    // Stream status updates so the client knows we're working
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch { /* client disconnected */ }
        }

        try {
          // Stage 1: RETRIEVING
          send({ status: "RETRIEVING", message: "Searching for relevant sources..." })
          await prisma.researchSession.update({
            where: { id: sessionId },
            data: { status: "RETRIEVING", retrievalStartedAt: new Date() },
          })

          // Stage 2: COMPOSING
          send({ status: "COMPOSING", message: "Analyzing sources and composing research memo..." })
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

          // Stage 3: READY_FOR_REVIEW
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

          send({ status: "READY_FOR_REVIEW", message: "Research complete", sessionId })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[Research] Execution failed for ${sessionId}:`, message)

          // Store the error in the session so the detail page shows it
          await prisma.researchSession.update({
            where: { id: sessionId },
            data: {
              status: "READY_FOR_REVIEW",
              output: `## Research Failed\n\nAn error occurred while conducting this research:\n\n> ${message}\n\nPlease try again or contact support if the issue persists.`,
              completedAt: new Date(),
            },
          }).catch(() => {})

          send({ status: "ERROR", error: message })
        }

        try { controller.close() } catch {}
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error: any) {
    console.error("[Research Launch] POST error:", error.message)
    return NextResponse.json(
      { error: "Failed to launch research session" },
      { status: 500 }
    )
  }
}
