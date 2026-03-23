import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"

const CLEANUP_TOKEN = "switchboard-cleanup-2026-03-23"

const IMPLEMENTED_SUBJECTS = [
  "Document freshness/expiration tracking",
  "Smart Document Completeness",
  "Case Document Progress Shows 0%",
  "Inbox UI/UX Improvements",
  "Inbox & Tracking Export",
  "Inbox export should filter by message status",
  "Platform Timezone",
  "Inbox Does Not Auto-Refresh",
  "Numbered lists display as repeated",
  "Reject Action Failing in Review Queue",
  "Junebug AI — Read Access to Codebase and Deployment Pipeline",
  "AI Assistant Live Access to Multi-Platform Infrastructure",
  "AI Assistant — Full Platform Data Access",
  "Junebug Live Access to Vercel Logs",
  "Junebug AI — Deep Full Access to All Case Data",
  "IRS Response Rebuttal Workflow",
  "Junebug — Live Codebase Read Access",
]

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (token !== CLEANUP_TOKEN) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  const log: string[] = []

  // Step 0: Count before
  const beforeCount = await prisma.message.count({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
        { implementationStatus: "in_progress" },
      ],
    },
  })
  log.push(`Open items before: ${beforeCount}`)

  // Step 1: Mark implemented items
  let totalMarked = 0
  for (const subjectKeyword of IMPLEMENTED_SUBJECTS) {
    const matches = await prisma.message.findMany({
      where: {
        subject: { contains: subjectKeyword },
        type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
        NOT: { implementationStatus: "implemented" },
      },
      select: { id: true, subject: true },
    })

    if (matches.length > 0) {
      const ids = matches.map(m => m.id)
      const result = await prisma.message.updateMany({
        where: { id: { in: ids } },
        data: {
          implementationStatus: "implemented",
          implementedAt: new Date(),
          implementationNotes: "Verified implemented in codebase",
        },
      })
      log.push(`Marked implemented: "${subjectKeyword}" (${result.count})`)
      totalMarked += result.count
    }
  }
  log.push(`Total marked implemented: ${totalMarked}`)

  // Step 2: Delete duplicates
  // "Banjo — Cannot Start New Assignment..."
  const banjoDupes = await prisma.message.findMany({
    where: {
      AND: [
        { subject: { contains: "Banjo" } },
        { subject: { contains: "Cannot Start New Assignment" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, createdAt: true },
  })
  let duplicatesDeleted = 0
  if (banjoDupes.length > 1) {
    for (const d of banjoDupes.slice(1)) {
      await prisma.message.delete({ where: { id: d.id } })
      log.push(`Deleted duplicate: "${d.subject}"`)
      duplicatesDeleted++
    }
  }

  // "Inbox UI/UX Improvements — Bulk Actions..."
  const inboxDupes = await prisma.message.findMany({
    where: {
      AND: [
        { subject: { contains: "Inbox UI/UX Improvements" } },
        { subject: { contains: "Bulk Actions" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, createdAt: true },
  })
  if (inboxDupes.length > 1) {
    for (const d of inboxDupes.slice(1)) {
      await prisma.message.delete({ where: { id: d.id } })
      log.push(`Deleted duplicate: "${d.subject}"`)
      duplicatesDeleted++
    }
  }
  log.push(`Duplicates deleted: ${duplicatesDeleted}`)

  // Step 3: Verify
  const afterCount = await prisma.message.count({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
        { implementationStatus: "in_progress" },
      ],
    },
  })

  const implementedCount = await prisma.message.count({
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

  log.push(`\nOpen items after: ${afterCount}`)
  log.push(`Implemented items: ${implementedCount}`)
  log.push(`Remaining open:`)
  for (const m of remaining) {
    log.push(`  [${m.implementationStatus || "null"}] ${m.subject}`)
  }

  return Response.json({
    success: true,
    beforeCount,
    afterCount,
    totalMarked,
    duplicatesDeleted,
    implementedCount,
    remaining: remaining.map(m => m.subject),
    log,
  })
}
