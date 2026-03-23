/**
 * One-time script to mark 16 implemented items and delete duplicates.
 * Run with: node scripts/mark-implemented.mjs
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const IMPLEMENTED_SUBJECTS = [
  "Document freshness",
  "Smart Document Completeness",
  "Case Document Progress Shows 0%",
  "Inbox UI/UX",
  "Inbox Export",
  "Platform Timezone",
  "Inbox Does Not Auto-Refresh",
  "Numbered lists",
  "Reject Action Failing",
  "Read Access to Codebase",
  "Live Access to Infra Logs",
  "Full Platform Data Access",
  "Live Access to Vercel Logs",
  "Deep Full Access to Case Data",
  "IRS Response Rebuttal",
  "Live Codebase Read Access",
]

async function main() {
  console.log("Scanning for implemented items...")

  // Find all open/null messages matching the subjects
  const allMessages = await prisma.message.findMany({
    where: {
      type: { in: ["BUG_REPORT", "FEATURE_REQUEST"] },
      implementationStatus: { in: ["open", null] },
    },
    select: { id: true, subject: true, type: true, implementationStatus: true },
  })

  console.log(`Found ${allMessages.length} open items total`)

  let implemented = 0
  const now = new Date()

  for (const msg of allMessages) {
    const matches = IMPLEMENTED_SUBJECTS.some(s =>
      msg.subject.toLowerCase().includes(s.toLowerCase())
    )

    if (matches) {
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          implementationStatus: "implemented",
          implementedAt: now,
          implementationNotes: "Verified implemented via code audit — marked by mark-implemented script",
        },
      })
      console.log(`  IMPLEMENTED: ${msg.subject}`)
      implemented++
    }
  }

  console.log(`\nMarked ${implemented} items as implemented`)

  // Delete duplicate "Inbox UI/UX Improvements"
  const inboxDupes = await prisma.message.findMany({
    where: {
      subject: { contains: "Inbox UI/UX", mode: "insensitive" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, createdAt: true },
  })

  if (inboxDupes.length > 1) {
    const toDelete = inboxDupes.slice(1) // keep first, delete rest
    for (const d of toDelete) {
      await prisma.message.delete({ where: { id: d.id } })
      console.log(`  DELETED duplicate: ${d.subject} (${d.id})`)
    }
  }

  // Delete duplicate "Cannot Start New Assignment While Previous Pending Review"
  const banjoDupes = await prisma.message.findMany({
    where: {
      subject: { contains: "Cannot Start New Assignment", mode: "insensitive" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, createdAt: true },
  })

  if (banjoDupes.length > 1) {
    const toDelete = banjoDupes.slice(1)
    for (const d of toDelete) {
      await prisma.message.delete({ where: { id: d.id } })
      console.log(`  DELETED duplicate: ${d.subject} (${d.id})`)
    }
  }

  console.log("\nDone.")
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
