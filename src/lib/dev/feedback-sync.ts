/**
 * Junebug → Claude Code Feedback Sync Engine
 *
 * Queries 4 sources of feedback:
 * 1. Unsynced bug reports (Message with type BUG_REPORT)
 * 2. Unsynced feature requests (Message with type FEATURE_REQUEST)
 * 3. Rejection clusters from review insights
 * 4. Unsynced auto-observations (JunebugObservation)
 *
 * Maps each to a structured FeedbackItem, deduplicates against TASKS.md,
 * formats as markdown task entries, and commits via GitHub API.
 */

import { prisma } from "@/lib/db"
import { readFile, appendToFile } from "@/lib/infrastructure/github-write"

interface FeedbackItem {
  priority: "P1" | "P2" | "P3"
  title: string
  scope: string
  description: string
  acceptanceCriteria: string[]
  source: string
  sourceId: string
}

export async function syncFeedbackToTasks(
  opts: { dryRun?: boolean; maxItems?: number } = {}
): Promise<{
  itemsSynced: number
  skippedDuplicates: number
  commitSha: string | null
  items: FeedbackItem[]
}> {
  const maxItems = opts.maxItems || 10
  const items: FeedbackItem[] = []

  // Source 1: Unsynced bug reports
  const bugs = await prisma.message
    .findMany({
      where: { type: "BUG_REPORT", implementationStatus: null },
      orderBy: { createdAt: "desc" },
      take: maxItems,
      select: { id: true, subject: true, body: true, metadata: true, createdAt: true },
    })
    .catch(() => [])

  for (const bug of bugs) {
    const meta = (bug.metadata as any) || {}
    const hasErrors = meta.browserContext?.errors?.length > 0
    items.push({
      priority: hasErrors ? "P1" : "P2",
      title: `Bug: ${bug.subject || "Untitled bug report"}`,
      scope: inferScope(bug.body || "", meta),
      description: (bug.body || "").slice(0, 500),
      acceptanceCriteria: ["Bug no longer reproduces", "Error is handled gracefully"],
      source: "Junebug Bug Report",
      sourceId: bug.id,
    })
  }

  // Source 2: Unsynced feature requests
  const features = await prisma.message
    .findMany({
      where: { type: "FEATURE_REQUEST", implementationStatus: null },
      orderBy: { createdAt: "desc" },
      take: maxItems,
      select: { id: true, subject: true, body: true, createdAt: true },
    })
    .catch(() => [])

  for (const feat of features) {
    items.push({
      priority: "P3",
      title: `Feature: ${feat.subject || "Untitled feature request"}`,
      scope: inferScope(feat.body || "", {}),
      description: (feat.body || "").slice(0, 500),
      acceptanceCriteria: ["Feature is implemented and accessible"],
      source: "Junebug Feature Request",
      sourceId: feat.id,
    })
  }

  // Source 3: Unsynced auto-observations
  const observations = await prisma.junebugObservation
    .findMany({
      where: { syncedToTasks: false },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: maxItems,
    })
    .catch(() => [])

  for (const obs of observations) {
    items.push({
      priority: obs.severity === "HIGH" ? "P1" : obs.severity === "MEDIUM" ? "P2" : "P3",
      title: obs.title,
      scope: obs.route || "General",
      description: obs.description,
      acceptanceCriteria: getAcceptanceCriteria(obs.type),
      source: `Junebug Auto-Observation (${obs.type})`,
      sourceId: obs.id,
    })
  }

  if (items.length === 0) {
    return { itemsSynced: 0, skippedDuplicates: 0, commitSha: null, items: [] }
  }

  // Read current TASKS.md and deduplicate
  const tasksFile = await readFile("TASKS.md")
  const existingContent = tasksFile?.content || ""

  const newItems = items.filter((item) => !existingContent.includes(item.title))
  const skippedDuplicates = items.length - newItems.length
  const toSync = newItems.slice(0, maxItems)

  if (toSync.length === 0 || opts.dryRun) {
    return { itemsSynced: 0, skippedDuplicates, commitSha: null, items: toSync }
  }

  // Format as TASKS.md entries
  const taskEntries = toSync
    .map(
      (item) => `
## [TODO] ${item.title}
**Priority:** ${item.priority}
**Source:** ${item.source}
**Scope:** ${item.scope}
**Description:** ${item.description}
**Acceptance Criteria:**
${item.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}
`
    )
    .join("\n---\n")

  // Commit to TASKS.md
  const result = await appendToFile(
    "TASKS.md",
    taskEntries,
    `chore: sync ${toSync.length} Junebug feedback items to TASKS.md`
  )

  // Mark items as synced
  if (result) {
    const bugIds = toSync.filter((i) => i.source.includes("Bug")).map((i) => i.sourceId)
    const featIds = toSync.filter((i) => i.source.includes("Feature")).map((i) => i.sourceId)
    const obsIds = toSync.filter((i) => i.source.includes("Observation")).map((i) => i.sourceId)

    if (bugIds.length) {
      await prisma.message
        .updateMany({
          where: { id: { in: bugIds } },
          data: { implementationStatus: "SYNCED_TO_TASKS" },
        })
        .catch(() => {})
    }
    if (featIds.length) {
      await prisma.message
        .updateMany({
          where: { id: { in: featIds } },
          data: { implementationStatus: "SYNCED_TO_TASKS" },
        })
        .catch(() => {})
    }
    if (obsIds.length) {
      await prisma.junebugObservation
        .updateMany({
          where: { id: { in: obsIds } },
          data: { syncedToTasks: true, syncedAt: new Date() },
        })
        .catch(() => {})
    }
  }

  return {
    itemsSynced: toSync.length,
    skippedDuplicates,
    commitSha: result?.sha || null,
    items: toSync,
  }
}

export async function getFeedbackSummary(): Promise<{
  totalUnsynced: number
  bugs: number
  features: number
  observations: number
  observationBreakdown: Array<{ type: string; _count: number }>
}> {
  const [bugCount, featCount, obsCount, obsBreakdown] = await Promise.all([
    prisma.message
      .count({ where: { type: "BUG_REPORT", implementationStatus: null } })
      .catch(() => 0),
    prisma.message
      .count({ where: { type: "FEATURE_REQUEST", implementationStatus: null } })
      .catch(() => 0),
    prisma.junebugObservation.count({ where: { syncedToTasks: false } }).catch(() => 0),
    prisma.junebugObservation
      .groupBy({ by: ["type"], where: { syncedToTasks: false }, _count: true })
      .catch(() => []),
  ])

  return {
    totalUnsynced: bugCount + featCount + obsCount,
    bugs: bugCount,
    features: featCount,
    observations: obsCount,
    observationBreakdown: obsBreakdown as any,
  }
}

function inferScope(body: string, meta: any): string {
  const route = meta?.browserContext?.route || meta?.route || ""
  if (route.includes("/forms")) return "Form Builder"
  if (route.includes("/review")) return "Review Queue"
  if (route.includes("/cases")) return "Cases"
  if (route.includes("/knowledge")) return "Knowledge Base"
  if (route.includes("/inbox")) return "Inbox"
  if (route.includes("/dashboard")) return "Dashboard"
  if (body.toLowerCase().includes("banjo")) return "Banjo"
  if (body.toLowerCase().includes("junebug")) return "Junebug"
  return "General"
}

function getAcceptanceCriteria(type: string): string[] {
  switch (type) {
    case "CONTEXT_FAILURE":
      return ["Case context loads successfully", "Junebug has access to live case data"]
    case "ERROR_PATTERN":
      return ["Error no longer occurs", "Error is handled gracefully with user feedback"]
    case "MISSING_FEATURE":
      return ["Feature is implemented", "Junebug can assist with this workflow"]
    case "UX_FRICTION":
      return ["User flow is intuitive", "No dead ends or confusing states"]
    case "QUALITY_GAP":
      return ["Junebug can provide specific data for this query"]
    default:
      return ["Issue is resolved"]
  }
}
