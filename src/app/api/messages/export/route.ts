import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

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

  const where: any = {}
  if (type) {
    where.type = type
  } else {
    where.type = { in: ["BUG_REPORT", "FEATURE_REQUEST"] }
  }
  if (days > 0) {
    where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
  }

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
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const typeSummary = []
  if (bugCount > 0) typeSummary.push(`${bugCount} bug${bugCount !== 1 ? "s" : ""}`)
  if (featureCount > 0) typeSummary.push(`${featureCount} feature request${featureCount !== 1 ? "s" : ""}`)

  let md = `# Cleared Platform — Bug Reports & Feature Requests\n`
  md += `# Exported ${dateStr}\n`
  md += `# Total: ${messages.length} items (${typeSummary.join(", ")})\n\n`

  for (const msg of messages) {
    const prefix = msg.type === "BUG_REPORT" ? "BUG" : "FEATURE"
    const msgDate = new Date(msg.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    md += `## ${prefix}: ${msg.subject}\n`
    md += `From: ${msg.sender?.name || msg.senderName || "Unknown"} | ${msgDate} | Priority: ${msg.priority}\n`
    if (msg.tags.length > 0) {
      md += `Tags: ${msg.tags.join(", ")}\n`
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
