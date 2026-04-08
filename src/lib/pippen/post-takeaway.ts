/**
 * Stage 4: Post the top takeaway to the firm newsfeed.
 *
 * Creates a FeedPost attributed to the first admin user (or the "Pippen" user if one exists).
 */

import { prisma } from "@/lib/db"
import { humanizeText } from "@/lib/ai/humanizer"
import type { CompiledReport } from "./compile-learnings"

export async function postDailyTakeaway(
  report: CompiledReport,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // Skip posting if there are no learnings
    if (report.learnings.length === 0 || report.topTakeaway === "No new materials today.") {
      return { success: true, error: "No takeaway to post — no new materials" }
    }

    // Find a user to attribute the post to (required for feed rendering)
    const authorId = await findAuthorId()
    if (!authorId) {
      return { success: false, error: "No user found to attribute the feed post to" }
    }

    // Check for duplicate — don't post twice on the same day
    const existing = await prisma.feedPost.findFirst({
      where: {
        content: { contains: `Pippen's Daily Takeaway` },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }).catch(() => null)

    if (existing) {
      return { success: true, postId: existing.id, error: "Already posted today" }
    }

    // Build the post content — short, punchy, practitioner-friendly
    const content = [
      `🐕 **Pippen's Daily Takeaway** — ${report.date}`,
      "",
      humanizeText(report.topTakeaway),
      "",
      `📋 [Full daily learnings report →](/pippen)`,
    ].join("\n")

    const post = await prisma.feedPost.create({
      data: {
        authorId,
        postType: "post",
        content,
      },
    })

    return { success: true, postId: post.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[Pippen] postDailyTakeaway failed:", message, err)
    return { success: false, error: message }
  }
}

/**
 * Find a user ID for feed post attribution.
 * Priority: user named "Pippen" > first ADMIN > first user.
 */
async function findAuthorId(): Promise<string | null> {
  try {
    // Try Pippen user
    const pippen = await prisma.user.findFirst({
      where: { name: { contains: "Pippen", mode: "insensitive" } },
      select: { id: true },
    }).catch(() => null)
    if (pippen) return pippen.id

    // Try first admin
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    }).catch(() => null)
    if (admin) return admin.id

    // Try any user
    const anyUser = await prisma.user.findFirst({
      select: { id: true },
    }).catch(() => null)
    return anyUser?.id ?? null
  } catch {
    return null
  }
}
