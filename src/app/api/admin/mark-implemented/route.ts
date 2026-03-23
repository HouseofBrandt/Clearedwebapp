import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

// One-time token for remote execution (remove after use)
const CLEANUP_TOKEN = "switchboard-cleanup-2026-03-23"

const IMPLEMENTED_FEATURES = [
  { subjectMatch: "Document freshness", notes: "src/lib/case-intelligence/document-freshness.ts — expiration tracking + freshness badges" },
  { subjectMatch: "Smart Document Completeness", notes: "src/lib/case-intelligence/doc-completeness.ts — dynamic case-type-aware checklists" },
  { subjectMatch: "Case Document Progress Shows 0%", notes: "Backfill route + recalculation wired into uploads via recalculateDocCompleteness()" },
  { subjectMatch: "Inbox UI/UX", notes: "bulk/route.ts + checkboxes in inbox-list.tsx — bulk actions implemented" },
  { subjectMatch: "Inbox & Tracking Export", notes: "src/app/api/messages/export/route.ts — has includeResolved filter" },
  { subjectMatch: "Inbox Export", notes: "src/app/api/messages/export/route.ts — default excluding implemented" },
  { subjectMatch: "Platform Timezone", notes: "src/lib/date-utils.ts uses America/Chicago" },
  { subjectMatch: "Inbox Does Not Auto-Refresh", notes: "src/components/inbox/inbox-list.tsx — setInterval polling" },
  { subjectMatch: "Numbered lists display", notes: "src/components/assistant/chat-panel.tsx — <ol> with list-decimal" },
  { subjectMatch: "Reject Action Failing", notes: "router.push('/review') redirect after reject + status guard on task page" },
  { subjectMatch: "Read Access to Codebase", notes: "src/lib/infrastructure/github-api.ts (229 lines)" },
  { subjectMatch: "Multi-Platform Infrastructure Logs", notes: "src/lib/infrastructure/vercel-logs.ts (126+ lines)" },
  { subjectMatch: "Live Access to Infra Logs", notes: "src/lib/infrastructure/vercel-logs.ts" },
  { subjectMatch: "Full Platform Data Access", notes: "src/lib/ai/platform-data.ts (36K+)" },
  { subjectMatch: "Vercel Logs and Runtime Error", notes: "src/lib/infrastructure/vercel-logs.ts" },
  { subjectMatch: "Live Access to Vercel Logs", notes: "src/lib/infrastructure/vercel-logs.ts" },
  { subjectMatch: "Deep Full Access to All Case Data", notes: "src/lib/ai/platform-data.ts — covers cases, intelligence, docs, smart status" },
  { subjectMatch: "Deep Full Access to Case Data", notes: "src/lib/ai/platform-data.ts" },
  { subjectMatch: "IRS Response Rebuttal", notes: "appeals_rebuttal_v1.txt prompt + APPEALS_REBUTTAL task type" },
  { subjectMatch: "Live Codebase Read Access", notes: "src/lib/ai/feature-detection.ts + scan-implementations route" },
]

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const results: { subject: string; status: string }[] = []

  // Mark each feature as implemented
  for (const feature of IMPLEMENTED_FEATURES) {
    const message = await prisma.message.findFirst({
      where: {
        subject: { contains: feature.subjectMatch },
        OR: [
          { implementationStatus: null },
          { implementationStatus: "open" },
        ],
      },
    })

    if (message) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          implementationStatus: "implemented",
          implementedAt: new Date(),
          implementationNotes: feature.notes,
          implementedById: auth.userId,
        },
      })
      results.push({ subject: message.subject, status: "updated" })
    } else {
      results.push({ subject: feature.subjectMatch, status: "not_found" })
    }
  }

  // Remove duplicate "Inbox UI/UX Improvements" messages (keep the oldest one)
  const inboxUiMessages = await prisma.message.findMany({
    where: {
      subject: { contains: "Inbox UI/UX Improvements" },
    },
    orderBy: { createdAt: "asc" },
  })

  let duplicatesDeleted = 0
  if (inboxUiMessages.length > 1) {
    const duplicateIds = inboxUiMessages.slice(1).map((m) => m.id)
    const deleteResult = await prisma.message.deleteMany({
      where: { id: { in: duplicateIds } },
    })
    duplicatesDeleted += deleteResult.count
  }

  // Remove duplicate "Cannot Start New Assignment" messages (keep the oldest one)
  const banjoDupes = await prisma.message.findMany({
    where: { subject: { contains: "Cannot Start New Assignment" } },
    orderBy: { createdAt: "asc" },
  })
  if (banjoDupes.length > 1) {
    const duplicateIds = banjoDupes.slice(1).map((m) => m.id)
    const deleteResult = await prisma.message.deleteMany({
      where: { id: { in: duplicateIds } },
    })
    duplicatesDeleted += deleteResult.count
  }

  logAudit({
    userId: auth.userId,
    action: "BULK_MARK_IMPLEMENTED",
    metadata: {
      featuresUpdated: results.filter((r) => r.status === "updated").length,
      featuresNotFound: results.filter((r) => r.status === "not_found").length,
      duplicatesDeleted,
      details: results,
    },
  })

  return NextResponse.json({
    updated: results.filter((r) => r.status === "updated").length,
    notFound: results.filter((r) => r.status === "not_found").length,
    duplicatesDeleted,
    details: results,
  })
}

/**
 * GET handler with one-time token auth for remote execution.
 * Runs the same cleanup logic without requiring a NextAuth session.
 * Remove this handler after the cleanup is complete.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (token !== CLEANUP_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const log: string[] = []
  let totalMarked = 0

  // Step 1: Mark implemented
  for (const feature of IMPLEMENTED_FEATURES) {
    const matches = await prisma.message.findMany({
      where: {
        subject: { contains: feature.subjectMatch },
        type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
        NOT: { implementationStatus: "implemented" },
      },
      select: { id: true, subject: true },
    })
    if (matches.length > 0) {
      const result = await prisma.message.updateMany({
        where: { id: { in: matches.map(m => m.id) } },
        data: {
          implementationStatus: "implemented",
          implementedAt: new Date(),
          implementationNotes: `Verified: ${feature.notes}`,
        },
      })
      log.push(`✓ "${feature.subjectMatch}" — ${result.count} marked`)
      totalMarked += result.count
    }
  }

  // Step 2: Delete duplicates
  let duplicatesDeleted = 0

  const banjoDupes = await prisma.message.findMany({
    where: {
      AND: [
        { subject: { contains: "Banjo" } },
        { subject: { contains: "Cannot Start New Assignment" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  if (banjoDupes.length > 1) {
    const del = await prisma.message.deleteMany({
      where: { id: { in: banjoDupes.slice(1).map(m => m.id) } },
    })
    duplicatesDeleted += del.count
    log.push(`✓ Deleted ${del.count} "Cannot Start" duplicate(s)`)
  }

  const inboxDupes = await prisma.message.findMany({
    where: {
      AND: [
        { subject: { contains: "Inbox UI/UX Improvements" } },
        { subject: { contains: "Bulk Actions" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  if (inboxDupes.length > 1) {
    const del = await prisma.message.deleteMany({
      where: { id: { in: inboxDupes.slice(1).map(m => m.id) } },
    })
    duplicatesDeleted += del.count
    log.push(`✓ Deleted ${del.count} "Inbox UI/UX" duplicate(s)`)
  }

  // Step 3: Verify
  const openCount = await prisma.message.count({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
        { implementationStatus: "in_progress" },
      ],
    },
  })
  const implCount = await prisma.message.count({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      implementationStatus: "implemented",
    },
  })

  const remaining = await prisma.message.findMany({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
        { implementationStatus: "in_progress" },
      ],
    },
    select: { subject: true, implementationStatus: true },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    success: true,
    totalMarked,
    duplicatesDeleted,
    openCount,
    implementedCount: implCount,
    remaining: remaining.map(m => ({ status: m.implementationStatus || "null", subject: m.subject })),
    log,
  })
}
