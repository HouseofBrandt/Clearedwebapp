/**
 * System Observability — "Jarvis Mode" for Junebug
 *
 * Gives Junebug deep visibility into every layer of the platform:
 * - Pippen pipeline status and history
 * - Cron job health (last run, success/failure)
 * - AI task pipeline metrics
 * - System error trends
 * - Feed activity stream
 * - Form builder status
 * - User activity summary
 * - Infrastructure health
 *
 * Each function returns a formatted string for system prompt injection.
 */

import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"

// ── Pippen Pipeline Status ──────────────────────────────────────────

export async function getPippenStatus(): Promise<string> {
  const lines: string[] = ["PIPPEN PIPELINE STATUS:"]

  try {
    // Get latest daily digest
    const latestDigest = await prisma.dailyDigest.findFirst({
      orderBy: { digestDate: "desc" },
      select: {
        id: true,
        digestDate: true,
        publishedAt: true,
        summary: true,
        newAuthorities: true,
        changedAuthorities: true,
        details: true,
      },
    }).catch(() => null)

    if (latestDigest) {
      const daysAgo = Math.floor((Date.now() - latestDigest.digestDate.getTime()) / 86400000)
      lines.push(`  Last digest: ${latestDigest.digestDate.toISOString().split("T")[0]} (${daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`})`)
      lines.push(`  Published: ${latestDigest.publishedAt ? "Yes" : "NO — not published"}`)
      lines.push(`  New authorities: ${latestDigest.newAuthorities}`)
      lines.push(`  Changed authorities: ${latestDigest.changedAuthorities}`)
      if (latestDigest.summary) lines.push(`  Summary: ${latestDigest.summary.slice(0, 200)}`)

      // Check if news article was generated
      const details = latestDigest.details as Record<string, any> | null
      if (details?.newsArticle) {
        lines.push(`  News article: Generated ("${(details.newsArticle as any).headline?.slice(0, 80)}")`)
      } else {
        lines.push(`  News article: NOT generated`)
      }
    } else {
      lines.push("  No daily digests found — pipeline may never have run")
    }

    // Get latest Pippen feed post
    const latestPost = await prisma.feedPost.findFirst({
      where: { content: { contains: "Pippen" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, content: true },
    }).catch(() => null)

    if (latestPost) {
      const daysAgo = Math.floor((Date.now() - latestPost.createdAt.getTime()) / 86400000)
      lines.push(`  Last feed post: ${latestPost.createdAt.toISOString().split("T")[0]} (${daysAgo === 0 ? "today" : `${daysAgo}d ago`})`)
    } else {
      lines.push(`  Last feed post: NONE — Pippen has never posted to the feed`)
    }

    // Get source artifact count for today
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayArtifacts = await prisma.sourceArtifact.count({
      where: { fetchedAt: { gte: today } },
    }).catch(() => 0)
    lines.push(`  Source artifacts today: ${todayArtifacts}`)

    // Get total source count
    const totalSources = await prisma.sourceArtifact.count().catch(() => 0)
    lines.push(`  Total source artifacts: ${totalSources}`)
  } catch (err: any) {
    lines.push(`  Error querying Pippen data: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── AI Task Pipeline Metrics ────────────────────────────────────────

export async function getAITaskMetrics(): Promise<string> {
  const lines: string[] = ["AI TASK PIPELINE:"]

  try {
    const [byStatus, recentTasks, reviewCount] = await Promise.all([
      prisma.aITask.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.aITask.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          taskType: true,
          status: true,
          modelUsed: true,
          createdAt: true,
          banjoStepLabel: true,
          case: { select: { tabsNumber: true } },
        },
      }),
      prisma.reviewAction.count().catch(() => 0),
    ])

    lines.push(`  Status breakdown: ${byStatus.map(s => `${s.status}: ${s._count}`).join(", ")}`)

    const processing = byStatus.find(s => s.status === "PROCESSING")
    if (processing && processing._count > 0) {
      lines.push(`  ⚠ ${processing._count} task(s) currently PROCESSING`)
    }

    lines.push(`  Total reviews completed: ${reviewCount}`)

    if (recentTasks.length > 0) {
      lines.push(`  Recent tasks:`)
      for (const t of recentTasks) {
        const age = Math.floor((Date.now() - t.createdAt.getTime()) / 3600000)
        lines.push(`    - [${t.status}] ${t.banjoStepLabel || t.taskType} for ${t.case?.tabsNumber || "unknown"} (${t.modelUsed || "?"}, ${age}h ago)`)
      }
    }
  } catch (err: any) {
    lines.push(`  Error: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── System Error Trends ─────────────────────────────────────────────

export async function getErrorTrends(): Promise<string> {
  const lines: string[] = ["SYSTEM ERRORS (last 24h):"]

  try {
    const since = new Date(Date.now() - 86400000)

    const [recentErrors, byRoute] = await Promise.all([
      prisma.appError.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          errorMessage: true,
          route: true,
          statusCode: true,
          createdAt: true,
        },
      }),
      prisma.appError.groupBy({
        by: ["route"],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
    ])

    if (recentErrors.length === 0) {
      lines.push("  ✓ No errors in the last 24 hours")
    } else {
      lines.push(`  Total: ${recentErrors.length} error(s)`)
      if (byRoute.length > 0) {
        lines.push(`  By route: ${byRoute.map(c => `${c.route}: ${c._count}`).join(", ")}`)
      }
      lines.push(`  Recent:`)
      for (const e of recentErrors.slice(0, 5)) {
        const ago = Math.floor((Date.now() - e.createdAt.getTime()) / 60000)
        lines.push(`    - [${e.statusCode || "ERR"}] ${e.errorMessage.slice(0, 100)} (${e.route}, ${ago < 60 ? `${ago}m` : `${Math.floor(ago / 60)}h`} ago)`)
      }
    }
  } catch (err: any) {
    lines.push(`  Error querying: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── Feed Activity Stream ────────────────────────────────────────────

export async function getRecentActivity(): Promise<string> {
  const lines: string[] = ["RECENT PLATFORM ACTIVITY:"]

  try {
    const posts = await prisma.feedPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        author: { select: { name: true } },
        case: { select: { tabsNumber: true } },
        _count: { select: { replies: true, likes: true } },
      },
    })

    if (posts.length === 0) {
      lines.push("  No recent activity")
    } else {
      for (const p of posts) {
        const ago = Math.floor((Date.now() - p.createdAt.getTime()) / 3600000)
        const caseRef = p.case?.tabsNumber ? ` [${p.case.tabsNumber}]` : ""
        const engagement = (p._count.replies + p._count.likes) > 0 ? ` (${p._count.replies} replies, ${p._count.likes} likes)` : ""
        lines.push(`  - [${p.postType}] ${p.author?.name || "System"}${caseRef}: ${p.content.slice(0, 80)}... (${ago < 1 ? "just now" : `${ago}h ago`})${engagement}`)
      }
    }
  } catch (err: any) {
    lines.push(`  Error: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── Form Builder Status ─────────────────────────────────────────────

export async function getFormBuilderStatus(): Promise<string> {
  const lines: string[] = ["FORM BUILDER:"]

  try {
    const forms = await prisma.formInstance.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        case: { select: { tabsNumber: true, clientName: true } },
      },
    })

    if (forms.length === 0) {
      lines.push("  No form instances found")
    } else {
      const byStatus = forms.reduce((acc, f) => {
        acc[f.status] = (acc[f.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      lines.push(`  Total: ${forms.length} form(s) — ${Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(", ")}`)

      for (const f of forms.slice(0, 5)) {
        let clientName = f.case?.tabsNumber || "unknown"
        try { if (f.case?.clientName) clientName = decryptField(f.case.clientName) } catch {}
        const completedSections = Array.isArray(f.completedSections) ? (f.completedSections as string[]).length : 0
        lines.push(`    - Form ${f.formNumber} for ${clientName} — ${f.status} (${completedSections} sections done, updated ${f.updatedAt.toLocaleDateString()})`)
      }
    }
  } catch (err: any) {
    lines.push(`  Error: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── User Activity Summary ───────────────────────────────────────────

export async function getUserActivitySummary(): Promise<string> {
  const lines: string[] = ["TEAM ACTIVITY (last 24h):"]

  try {
    const since = new Date(Date.now() - 86400000)

    const [recentLogins, recentReviews, recentUploads] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ["practitionerId"],
        where: { action: "CASE_VIEWED", timestamp: { gte: since } },
        _count: true,
      }).catch(() => []),
      prisma.reviewAction.findMany({
        where: { reviewCompletedAt: { gte: since } },
        include: { practitioner: { select: { name: true } } },
        orderBy: { reviewCompletedAt: "desc" },
        take: 10,
      }).catch(() => []),
      prisma.document.count({
        where: { uploadedAt: { gte: since } },
      }).catch(() => 0),
    ])

    lines.push(`  Active users (viewed cases): ${recentLogins.length}`)
    lines.push(`  Documents uploaded: ${recentUploads}`)
    lines.push(`  Reviews completed: ${recentReviews.length}`)

    if (recentReviews.length > 0) {
      lines.push(`  Recent reviews:`)
      for (const r of recentReviews.slice(0, 5)) {
        lines.push(`    - ${r.practitioner?.name || "Unknown"}: ${r.action} (${r.reviewNotes?.slice(0, 60) || "no notes"})`)
      }
    }
  } catch (err: any) {
    lines.push(`  Error: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── Cron/Scheduled Jobs Health ───────────────────────────────────────

export async function getCronHealth(): Promise<string> {
  const lines: string[] = ["CRON / SCHEDULED JOBS:"]

  try {
    // Check Pippen pipeline last run
    const latestDigest = await prisma.dailyDigest.findFirst({
      orderBy: { digestDate: "desc" },
      select: { digestDate: true, publishedAt: true },
    }).catch(() => null)

    if (latestDigest) {
      const daysAgo = Math.floor((Date.now() - latestDigest.digestDate.getTime()) / 86400000)
      const status = daysAgo === 0 ? "✓ ran today" : daysAgo === 1 ? "⚠ last ran yesterday" : `✗ STALE — last ran ${daysAgo} days ago`
      lines.push(`  Tax Authority Digest: ${status}`)
    } else {
      lines.push(`  Tax Authority Digest: ✗ NEVER RAN`)
    }

    // Check data retention cron
    const latestDisposal = await prisma.dataDisposalRecord.findFirst({
      orderBy: { disposedAt: "desc" },
      select: { disposedAt: true },
    }).catch(() => null)

    if (latestDisposal) {
      const daysAgo = Math.floor((Date.now() - latestDisposal.disposedAt.getTime()) / 86400000)
      lines.push(`  Data Retention: last ran ${daysAgo === 0 ? "today" : `${daysAgo}d ago`}`)
    } else {
      lines.push(`  Data Retention: no disposal records found`)
    }

    // Check compliance automation
    const latestHealthCheck = await prisma.healthCheck.findFirst({
      orderBy: { executedAt: "desc" },
      select: { executedAt: true, passed: true },
    }).catch(() => null)

    if (latestHealthCheck) {
      const daysAgo = Math.floor((Date.now() - latestHealthCheck.executedAt.getTime()) / 86400000)
      lines.push(`  Compliance Health Check: last ran ${daysAgo === 0 ? "today" : `${daysAgo}d ago`} (${latestHealthCheck.passed ? "passed" : "FAILED"})`)
    } else {
      lines.push(`  Compliance Health Check: no records`)
    }

    // Knowledge base health
    const [kbDocs, kbChunksWithEmbeddings] = await Promise.all([
      prisma.knowledgeDocument.count().catch(() => 0),
      prisma.knowledgeChunk.count().catch(() => 0),
    ])
    lines.push(`  Knowledge Base: ${kbDocs} documents, ${kbChunksWithEmbeddings} chunks`)
  } catch (err: any) {
    lines.push(`  Error: ${err?.message}`)
  }

  return lines.join("\n")
}

// ── Master Diagnostics (traces a specific issue) ─────────────────────

export async function tracePipelineIssue(description: string): Promise<string> {
  const lines: string[] = [`DIAGNOSTIC TRACE for: "${description.slice(0, 100)}"`]

  // Run all checks in parallel
  const [pippen, tasks, errors, crons, activity] = await Promise.all([
    getPippenStatus().catch(() => "  Pippen: query failed"),
    getAITaskMetrics().catch(() => "  AI Tasks: query failed"),
    getErrorTrends().catch(() => "  Errors: query failed"),
    getCronHealth().catch(() => "  Crons: query failed"),
    getRecentActivity().catch(() => "  Activity: query failed"),
  ])

  lines.push("")
  lines.push(pippen)
  lines.push("")
  lines.push(tasks)
  lines.push("")
  lines.push(errors)
  lines.push("")
  lines.push(crons)
  lines.push("")
  lines.push(activity)

  return lines.join("\n")
}
