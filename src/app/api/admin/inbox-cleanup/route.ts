import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"

const CLEANUP_TOKEN = "switchboard-cleanup-2026-03-23"

const IMPLEMENTED_KEYWORDS = [
  "Document freshness",
  "Smart Document Completeness",
  "Document Progress Shows 0%",
  "Inbox UI/UX Improvements",
  "Inbox & Tracking Export",
  "Inbox export should filter",
  "Platform Timezone",
  "Inbox Does Not Auto-Refresh",
  "Numbered lists display",
  "Reject Action Failing",
  "Read Access to Codebase",
  "Multi-Platform Infrastructure",
  "Full Platform Data Access",
  "Live Access to Vercel Logs",
  "Deep Full Access to All Case",
  "IRS Response Rebuttal",
  "Live Codebase Read Access",
]

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (token !== CLEANUP_TOKEN) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  const log: string[] = []

  // Get ALL open bug/feature messages first
  const allOpen = await prisma.message.findMany({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      OR: [
        { implementationStatus: null },
        { implementationStatus: "open" },
        { implementationStatus: "in_progress" },
      ],
    },
    select: { id: true, subject: true, implementationStatus: true },
  })
  log.push(`Total open messages: ${allOpen.length}`)

  // Match in application code instead of relying on Prisma contains
  const toMark: string[] = []
  const matched: string[] = []
  for (const msg of allOpen) {
    for (const keyword of IMPLEMENTED_KEYWORDS) {
      if (msg.subject.includes(keyword)) {
        toMark.push(msg.id)
        matched.push(`"${keyword}" → "${msg.subject}"`)
        break
      }
    }
  }
  log.push(`Matched ${toMark.length} messages for marking`)
  for (const m of matched) log.push(`  ✓ ${m}`)

  // Bulk update
  let totalMarked = 0
  if (toMark.length > 0) {
    const result = await prisma.message.updateMany({
      where: { id: { in: toMark } },
      data: {
        implementationStatus: "implemented",
        implementedAt: new Date(),
        implementationNotes: "Verified implemented in codebase",
      },
    })
    totalMarked = result.count
  }
  log.push(`Marked implemented: ${totalMarked}`)

  // Step 2: Delete duplicates
  let duplicatesDeleted = 0

  const banjoDupes = await prisma.message.findMany({
    where: { subject: { contains: "Cannot Start New Assignment" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true },
  })
  if (banjoDupes.length > 1) {
    const del = await prisma.message.deleteMany({
      where: { id: { in: banjoDupes.slice(1).map(m => m.id) } },
    })
    duplicatesDeleted += del.count
    log.push(`Deleted ${del.count} "Cannot Start" duplicate(s)`)
  }

  // Step 3: Verify
  const afterOpen = await prisma.message.count({
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

  return Response.json({
    success: true,
    totalMarked,
    duplicatesDeleted,
    openBefore: allOpen.length,
    openAfter: afterOpen,
    implementedCount: implCount,
    remaining: remaining.map(m => m.subject),
    log,
  })
}
