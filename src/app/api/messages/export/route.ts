import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/date-utils"
import { logAudit, AUDIT_ACTIONS, getClientIP } from "@/lib/ai/audit"

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Admin only
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  })
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") // BUG_REPORT, FEATURE_REQUEST, or null for both
  const format = searchParams.get("format") || "markdown"
  const days = parseInt(searchParams.get("days") || "0", 10)
  const includeResolved = searchParams.get("includeResolved") === "true"
  const includeArchived = searchParams.get("includeArchived") === "true"
  const readFilter = searchParams.get("readFilter") // "read", "unread", or null for both
  const status = searchParams.get("status") // open, in_progress, resolved, implemented, archived — comma-separated

  const where: any = {}
  if (type) {
    where.type = type
  } else {
    where.type = { in: ["BUG_REPORT", "FEATURE_REQUEST"] }
  }

  if (status) {
    // Explicit status filter overrides includeResolved
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean)
    if (statuses.includes("archived")) {
      where.archived = true
      const nonArchived = statuses.filter((s) => s !== "archived")
      if (nonArchived.length > 0) {
        where.OR = [
          { archived: true },
          { implementationStatus: { in: nonArchived } },
        ]
        delete where.archived
      }
    } else {
      where.archived = false
      where.implementationStatus = { in: statuses.map((s) => s === "open" ? null : s) }
      // Handle null for "open" status
      if (statuses.includes("open")) {
        const nonOpen = statuses.filter((s) => s !== "open")
        where.OR = [
          { implementationStatus: null },
          ...(nonOpen.length > 0 ? [{ implementationStatus: { in: nonOpen } }] : []),
        ]
        delete where.implementationStatus
      }
    }
  } else if (!includeResolved) {
    where.archived = false
    where.OR = [
      { implementationStatus: null },
      { implementationStatus: { in: ["open", "in_progress"] } },
    ]
  }

  // C3: Override archived filter if includeArchived is explicitly set
  if (includeArchived && !status) {
    delete where.archived
  }

  // C3: Read/unread filter
  if (readFilter === "read") {
    where.read = true
  } else if (readFilter === "unread") {
    where.read = false
  }

  if (days > 0) {
    where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
  }

  // Auto-scan for implemented items before export (best-effort, don't block on failure)
  const autoScan = searchParams.get("skipScan") !== "true"
  if (autoScan && !includeResolved && !status) {
    try {
      const { detectImplementation } = await import("@/lib/ai/feature-detection")
      const openItems = await prisma.message.findMany({
        where: {
          type: { in: ["FEATURE_REQUEST", "BUG_REPORT"] },
          OR: [{ implementationStatus: null }, { implementationStatus: "open" }],
        },
        select: { id: true, subject: true, body: true, type: true },
        take: 20, // Cap to avoid timeout
      })
      for (const item of openItems) {
        try {
          const detection = await detectImplementation({ subject: item.subject, body: item.body, type: item.type })
          if (detection.confidence === "HIGH") {
            await prisma.message.update({
              where: { id: item.id },
              data: {
                implementationStatus: "implemented",
                implementedAt: new Date(),
                implementationNotes: `Auto-detected on export: ${detection.evidence}`,
                implementedById: auth.userId,
              },
            })
          }
        } catch { /* skip individual item failures */ }
      }
    } catch { /* scan infrastructure unavailable — continue with export */ }
  }

  logAudit({
    userId: auth.userId,
    action: AUDIT_ACTIONS.MESSAGES_EXPORTED,
    metadata: { type: type || "all", format, count: 0 },
    ipAddress: getClientIP(),
  })

  const messages = await prisma.message.findMany({
    where,
    include: {
      sender: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  if (format === "json") {
    return new NextResponse(JSON.stringify(messages, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cleared-messages-export.json"`,
      },
    })
  }

  // Markdown format
  const bugCount = messages.filter((m) => m.type === "BUG_REPORT").length
  const featureCount = messages.filter((m) => m.type === "FEATURE_REQUEST").length
  const dateStr = formatDate(new Date(), { year: "numeric", month: "long", day: "numeric" })

  const typeSummary = []
  if (bugCount > 0) typeSummary.push(`${bugCount} bug${bugCount !== 1 ? "s" : ""}`)
  if (featureCount > 0) typeSummary.push(`${featureCount} feature request${featureCount !== 1 ? "s" : ""}`)

  const filterParts = []
  if (status) filterParts.push(`Status: ${status}`)
  else if (includeResolved) filterParts.push("All statuses (including resolved)")
  else filterParts.push("Open and In Progress only")
  if (includeArchived) filterParts.push("including archived")
  else filterParts.push("excluding archived")
  if (readFilter === "read") filterParts.push("read only")
  else if (readFilter === "unread") filterParts.push("unread only")
  const filterNote = filterParts.join(" | ")

  let md = `# Cleared Platform — Bug Reports & Feature Requests\n`
  md += `# Exported ${dateStr}\n`
  md += `# Total: ${messages.length} items (${typeSummary.join(", ")})\n`
  md += `# Filter: ${filterNote}\n\n`

  for (const msg of messages) {
    const prefix = msg.type === "BUG_REPORT" ? "BUG" : "FEATURE"
    const msgDate = formatDate(msg.createdAt, { year: "numeric", month: "short", day: "numeric" })
    md += `## ${prefix}: ${msg.subject}\n`
    md += `From: ${msg.sender?.name || msg.senderName || "Unknown"} | ${msgDate} | Priority: ${msg.priority}\n`
    if (msg.tags.length > 0) {
      md += `Tags: ${msg.tags.join(", ")}\n`
    }
    const implStatus = (msg as any).implementationStatus || "open"
    md += `**Status: ${implStatus.charAt(0).toUpperCase() + implStatus.slice(1).replace("_", " ")}**\n`
    if ((msg as any).implementationNotes) {
      md += `Notes: ${(msg as any).implementationNotes}\n`
    }

    // Browser context from metadata (if present)
    const meta = (msg as any).metadata as Record<string, any> | null
    if (meta?.browserContext) {
      const bc = meta.browserContext
      md += `\n**Browser Context:**\n`
      if (bc.route) md += `- Route: \`${bc.route}\`\n`
      if (bc.errors?.length) {
        md += `- Console errors: ${bc.errors.map((e: any) => e.message).join("; ")}\n`
      }
      if (bc.networkFailures?.length) {
        md += `- Network failures: ${bc.networkFailures.map((f: any) => `${f.method} ${f.url} → ${f.status}`).join("; ")}\n`
      }
    }

    // Screenshot attachment note (base64 images can't be embedded in markdown export)
    if (meta?.screenshot) {
      md += `\n> **[Screenshot attached]** — A screenshot was captured with this report. View it in the admin inbox for the full image.\n`
    }

    md += `\n${msg.body}\n\n---\n\n`
  }

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="cleared-messages-export.md"`,
    },
  })
}
