/**
 * Pippen Daily Learnings Pipeline — Orchestrator
 *
 * Runs the full 4-stage pipeline:
 *  1. Harvest (already ran via cron — results are in SourceArtifact)
 *  2. Compile daily learnings report (Claude summarization)
 *  3. Ingest into knowledge base (chunking + embeddings)
 *  4. Post top takeaway to the firm newsfeed
 */

import { compileDailyLearnings, type CompiledReport } from "./compile-learnings"
import { ingestDailyLearnings } from "./ingest-learnings"
import { postDailyTakeaway } from "./post-takeaway"
import { generateDailyNewsArticle, type DailyNewsArticle } from "./daily-news-article"

export interface StageResult {
  stage: string
  success: boolean
  durationMs: number
  detail?: string
  error?: string
}

export interface PipelineResult {
  date: string
  success: boolean
  stages: StageResult[]
  report?: CompiledReport
  article?: DailyNewsArticle
  totalDurationMs: number
}

export async function runPippenPipeline(date?: Date): Promise<PipelineResult> {
  const pipelineStart = Date.now()
  const reportDate = date ?? new Date()
  const dateStr = reportDate.toISOString().split("T")[0]
  const stages: StageResult[] = []
  let report: CompiledReport | undefined
  let article: DailyNewsArticle | undefined

  // Stage 1: Harvest — already ran via cron, just note it
  stages.push({
    stage: "harvest",
    success: true,
    durationMs: 0,
    detail: "Harvest stage runs separately via cron. Using existing SourceArtifact records.",
  })

  // Stage 2: Compile
  const compileStart = Date.now()
  try {
    report = await compileDailyLearnings(reportDate)
    stages.push({
      stage: "compile",
      success: true,
      durationMs: Date.now() - compileStart,
      detail: `Compiled ${report.learnings.length} learning(s)`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    stages.push({
      stage: "compile",
      success: false,
      durationMs: Date.now() - compileStart,
      error: message,
    })
    return {
      date: dateStr,
      success: false,
      stages,
      totalDurationMs: Date.now() - pipelineStart,
    }
  }

  // Stage 2.5: Generate daily news article
  const articleStart = Date.now()
  try {
    article = await generateDailyNewsArticle(report)
    stages.push({
      stage: "article",
      success: true,
      durationMs: Date.now() - articleStart,
      detail: `Generated article: "${article.headline}"`,
    })

    // Store article in DailyDigest details
    try {
      const { prisma } = await import("@/lib/db")
      const startOfDay = new Date(reportDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(reportDate)
      endOfDay.setHours(23, 59, 59, 999)

      const digest = await prisma.dailyDigest.findFirst({
        where: { digestDate: { gte: startOfDay, lte: endOfDay } },
      })

      if (digest) {
        const existingDetails = (digest.details as Record<string, unknown>) ?? {}
        const updatedDetails = { ...existingDetails, newsArticle: article }
        await prisma.dailyDigest.update({
          where: { id: digest.id },
          data: { details: updatedDetails as unknown as import("@prisma/client").Prisma.InputJsonValue },
        })
      }
    } catch {
      // DailyDigest caching is non-critical
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    stages.push({
      stage: "article",
      success: false,
      durationMs: Date.now() - articleStart,
      error: message,
    })
    // Continue — article generation failure should not block the pipeline
  }

  // Stage 3: Ingest
  const ingestStart = Date.now()
  try {
    const ingestResult = await ingestDailyLearnings(report)
    stages.push({
      stage: "ingest",
      success: ingestResult.success,
      durationMs: Date.now() - ingestStart,
      detail: ingestResult.docId ? `Document ID: ${ingestResult.docId}` : undefined,
      error: ingestResult.error,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    stages.push({
      stage: "ingest",
      success: false,
      durationMs: Date.now() - ingestStart,
      error: message,
    })
    // Continue to post stage even if ingest fails
  }

  // Stage 4: Post — use the compiled report OR fall back to DailyDigest data
  const postStart = Date.now()
  try {
    let postResult = await postDailyTakeaway(report)

    // If no takeaway was posted (no SourceArtifact learnings), try posting from DailyDigest
    if (postResult.error?.includes("No takeaway to post")) {
      try {
        const { prisma } = await import("@/lib/db")
        const startOfDay = new Date(reportDate)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(reportDate)
        endOfDay.setHours(23, 59, 59, 999)

        const digest = await prisma.dailyDigest.findFirst({
          where: { digestDate: { gte: startOfDay, lte: endOfDay }, publishedAt: { not: null } },
        })

        if (digest && digest.summary) {
          // Build a report-like structure from the DailyDigest
          const digestReport: CompiledReport = {
            date: dateStr,
            title: `Daily Digest — ${dateStr}`,
            learnings: [{
              title: "Daily Tax Authority Digest",
              summary: digest.summary,
              source: "Tax Authority Monitor",
              sourceUrl: "/admin/tax-authority",
              relevance: "Review for client impact",
            }],
            topTakeaway: digest.summary,
            markdownContent: digest.summary,
          }
          postResult = await postDailyTakeaway(digestReport)
        }
      } catch (digestErr) {
        console.warn("[Pippen] DailyDigest fallback failed:", digestErr)
      }
    }

    stages.push({
      stage: "post",
      success: postResult.success,
      durationMs: Date.now() - postStart,
      detail: postResult.postId ? `Post ID: ${postResult.postId}` : undefined,
      error: postResult.error,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    stages.push({
      stage: "post",
      success: false,
      durationMs: Date.now() - postStart,
      error: message,
    })
  }

  const allSuccess = stages.every((s) => s.success)

  return {
    date: dateStr,
    success: allSuccess,
    stages,
    report,
    article,
    totalDurationMs: Date.now() - pipelineStart,
  }
}
