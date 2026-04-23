import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { conductResearch } from "@/lib/research/web-research"

// Research with Opus 4.7 + effort="high" + 16k max_tokens + up to 8 tool
// turns + an evaluator pass with extended thinking can legitimately take
// 8-12 minutes on broad-scope questions. 300s (Vercel hobby cap) was
// killing runs mid-flight, leaving sessions stuck in COMPOSING forever.
// 800s is the max Vercel Pro allows.
export const maxDuration = 800

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

        // Phase-to-percent map — lets the client render a real progress
        // bar driven by server events instead of fake creep. Percentages
        // are approximate and ordered so the bar only moves forward.
        const PHASE_PERCENT: Record<string, number> = {
          preparing: 5,
          searching: 15,
          verifying: 35,
          composing: 55,
          backfill: 75,
          evaluating: 85,
          humanizing: 92,
          ingesting: 96,
          complete: 100,
        }

        // Throttle progress DB writes. The SSE stream gets every event in
        // real time; the DB only persists the latest snapshot at most once
        // per interval. Prior behavior (write-per-event) generated 30-80
        // round-trips per research and created connection pressure that
        // could delay the critical final READY_FOR_REVIEW write. A single
        // pending-snapshot object + a timer solves this.
        const PROGRESS_WRITE_INTERVAL_MS = 1500
        let pendingProgress: any = null
        let progressTimer: NodeJS.Timeout | null = null
        const flushProgress = async () => {
          if (!pendingProgress) return
          const snapshot = pendingProgress
          pendingProgress = null
          try {
            await prisma.researchSession.update({
              where: { id: sessionId },
              data: { progress: snapshot },
            })
          } catch { /* non-fatal */ }
        }
        const enqueueProgressWrite = (partial: any) => {
          pendingProgress = { ...(pendingProgress || {}), ...partial }
          if (progressTimer) return
          progressTimer = setTimeout(async () => {
            progressTimer = null
            await flushProgress()
          }, PROGRESS_WRITE_INTERVAL_MS)
        }

        try {
          // Stage 1: RETRIEVING
          send({ status: "RETRIEVING", phase: "preparing", percent: PHASE_PERCENT.preparing, headline: "Preparing research context" })
          await prisma.researchSession.update({
            where: { id: sessionId },
            data: { status: "RETRIEVING", retrievalStartedAt: new Date() },
          })

          // Stage 2: COMPOSING
          send({ status: "COMPOSING", phase: "searching", percent: PHASE_PERCENT.searching, headline: "Searching for authorities" })
          await prisma.researchSession.update({
            where: { id: sessionId },
            data: { status: "COMPOSING", compositionStartedAt: new Date() },
          })

          // Decrypt clientName before composing the research context — the
          // field is stored as an encrypted envelope at rest; injecting
          // `v1:iv:tag:ct` into the LLM prompt would both degrade research
          // quality and persist an unreadable reference. Best-effort: if
          // decrypt fails, fall back to the TABS number for the prompt.
          let caseContext: string | undefined
          if (session.case) {
            let clientNameForPrompt = ""
            try {
              const { decryptField } = await import("@/lib/encryption")
              clientNameForPrompt = decryptField(session.case.clientName) || ""
            } catch {
              clientNameForPrompt = ""
            }
            caseContext = `${session.case.caseType} case for ${
              clientNameForPrompt || "client (name unavailable)"
            }`
          }
          const scope = session.mode === "QUICK_ANSWER" ? "narrow" as const : "broad" as const

          const result = await conductResearch({
            topic: session.questionText,
            context: caseContext,
            scope,
            saveToKB: true,
            kbCategory: "CUSTOM",
            kbTags: ["research", session.mode.toLowerCase()],
            userId: session.createdById,
            onProgress: (event) => {
              // Forward every granular progress event to the SSE stream
              // AND persist a snapshot to the DB so the detail page (which
              // polls) can show the same Claude-style thinking display
              // even when the user reloads mid-flight.
              const updatedAt = new Date().toISOString()
              let payload: any = null
              if (event.kind === "phase") {
                payload = {
                  phase: event.phase,
                  percent: PHASE_PERCENT[event.phase],
                  headline: event.message,
                  updatedAt,
                }
                send({ status: "COMPOSING", ...payload })
              } else if (event.kind === "verify_citation") {
                const verb = event.status === "started" ? "Verifying" : (
                  event.status === "verified" ? "Verified" :
                  event.status === "superseded" ? "Superseded" : "Could not verify"
                )
                payload = { detail: `${verb} ${truncateCite(event.citation)}`, updatedAt }
                send({ status: "COMPOSING", ...payload })
              } else if (event.kind === "source_found") {
                payload = { detail: `Found ${event.total} source${event.total === 1 ? "" : "s"} so far`, updatedAt }
                send({ status: "COMPOSING", ...payload })
              } else if (event.kind === "detail") {
                payload = { detail: event.message, updatedAt }
                send({ status: "COMPOSING", ...payload })
              }
              if (payload) {
                // Merge partial into the pending snapshot. The timer
                // flushes at most once per interval regardless of event
                // burst rate, so detail-only events accumulate into the
                // same write as the preceding phase event.
                enqueueProgressWrite(payload)
              }
            },
          })

          // Flush any pending progress write + cancel the debounce timer
          // so the stuck-session check can't tick one more round after
          // we're done.
          if (progressTimer) { clearTimeout(progressTimer); progressTimer = null }
          await flushProgress()

          // CRITICAL: write READY_FOR_REVIEW + output FIRST. Source rows
          // are metadata — if they fail, the memo is still useable. If the
          // function dies after this write but before source persistence,
          // the session still reads as complete.
          await prisma.researchSession.update({
            where: { id: sessionId },
            data: {
              status: "READY_FOR_REVIEW",
              output: result.fullText,
              executiveSummary: result.summary,
              webResultCount: result.sources.length,
              completedAt: new Date(),
              progress: {
                phase: "complete",
                percent: 100,
                headline: "Research complete",
                updatedAt: new Date().toISOString(),
              },
            },
          })

          // Emit completion to the client immediately — don't make them wait
          // for source persistence to finish.
          send({ status: "READY_FOR_REVIEW", phase: "complete", percent: 100, headline: "Research complete", sessionId })

          // Persist sources (web search + verified citations) after
          // signaling complete. Failures here don't affect the user's
          // ability to read and approve the memo.
          try {
            for (const source of result.sources.slice(0, 20)) {
              await prisma.researchSource.create({
                data: {
                  sessionId,
                  sourceType: "WEB_GENERAL",
                  citation: source.title,
                  title: source.title,
                  url: source.url,
                  snippet: source.snippet,
                  authorityScore: 0.5,
                  relevanceScore: 0.7,
                },
              }).catch(() => {})
            }

            const { parseCitation } = await import("@/lib/research/citation-normalizer")
            const { citationKindToSourceType } = await import("@/lib/research/citation-source-type")
            for (const c of (result.citations || []).slice(0, 50)) {
              const parsed = parseCitation(c.raw)
              const sourceType = citationKindToSourceType(parsed.kind, c.courtOrAgency)
              const isVerified = c.status === "verified"
              await prisma.researchSource.create({
                data: {
                  sessionId,
                  sourceType,
                  citation: c.raw,
                  title: c.verifiedTitle || c.raw,
                  url: c.sourceUrl || null,
                  snippet: c.note || c.summary || null,
                  authorityScore: isVerified ? 0.9 : 0.3,
                  relevanceScore: 0.8,
                  isVerified,
                  dateOfAuthority: c.year
                    ? new Date(Date.UTC(c.year, 0, 1))
                    : null,
                },
              }).catch(() => {})
            }
          } catch (sourceErr: any) {
            console.warn("[Research] Source persistence failed (non-blocking):", sourceErr?.message || sourceErr)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[Research] Execution failed for ${sessionId}:`, message)

          // Cancel any pending progress write so the error-marking write
          // below isn't overwritten by a straggling timer.
          if (progressTimer) { clearTimeout(progressTimer); progressTimer = null }
          pendingProgress = null

          // Store the error in the session so the detail page shows it.
          // progress: null clears the "in flight" snapshot.
          await prisma.researchSession.update({
            where: { id: sessionId },
            data: {
              status: "READY_FOR_REVIEW",
              output: `## Research Failed\n\nAn error occurred while conducting this research:\n\n> ${message}\n\nPlease try again or contact support if the issue persists.`,
              completedAt: new Date(),
              progress: null as any,
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

/** Keep citation strings short enough to fit on one progress line. */
function truncateCite(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim()
  return trimmed.length > 64 ? trimmed.slice(0, 61) + "…" : trimmed
}
