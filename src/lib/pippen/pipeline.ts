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
  totalDurationMs: number
}

export async function runPippenPipeline(date?: Date): Promise<PipelineResult> {
  const pipelineStart = Date.now()
  const reportDate = date ?? new Date()
  const dateStr = reportDate.toISOString().split("T")[0]
  const stages: StageResult[] = []
  let report: CompiledReport | undefined

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

  // Stage 4: Post
  const postStart = Date.now()
  try {
    const postResult = await postDailyTakeaway(report)
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
    totalDurationMs: Date.now() - pipelineStart,
  }
}
