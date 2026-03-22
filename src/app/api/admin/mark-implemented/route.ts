import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

const IMPLEMENTED_FEATURES = [
  {
    subjectMatch: "Inbox & Tracking Export",
    notes: "src/app/api/messages/export/route.ts",
  },
  {
    subjectMatch: "Platform Timezone",
    notes: "src/lib/date-utils.ts uses America/Chicago",
  },
  {
    subjectMatch: "Inbox Does Not Auto-Refresh",
    notes: "src/components/inbox/inbox-list.tsx polling",
  },
  {
    subjectMatch: "Numbered lists display",
    notes: "src/components/assistant/chat-panel.tsx",
  },
  {
    subjectMatch: "Read Access to Codebase",
    notes: "src/lib/infrastructure/github-api.ts",
  },
  {
    subjectMatch: "Multi-Platform Infrastructure Logs",
    notes: "src/lib/infrastructure/vercel-logs.ts",
  },
  {
    subjectMatch: "Full Platform Data Access",
    notes: "src/lib/ai/platform-data.ts",
  },
  {
    subjectMatch: "Vercel Logs and Runtime Error",
    notes: "src/lib/infrastructure/vercel-logs.ts",
  },
  {
    subjectMatch: "Deep Full Access to All Case Data",
    notes: "src/lib/ai/platform-data.ts",
  },
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
    duplicatesDeleted = deleteResult.count
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
