/**
 * Stage 4: Post the top takeaway to the firm newsfeed.
 *
 * Creates a FeedPost attributed to the Pippen system user.
 */

import { prisma } from "@/lib/db"
import type { CompiledReport } from "./compile-learnings"

export async function postDailyTakeaway(
  report: CompiledReport,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // Skip posting if there are no learnings
    if (report.learnings.length === 0 || report.topTakeaway === "No new materials today.") {
      return { success: true, error: "No takeaway to post" }
    }

    // Find or identify the Pippen system user
    const pippenUser = await findPippenUser()

    // Build the post content
    const learningSummaries = report.learnings
      .slice(0, 3)
      .map((l) => `- **${l.title}**: ${l.relevance}`)
      .join("\n")

    const content = [
      `**Pippen's Daily Takeaway** (${report.date})`,
      "",
      report.topTakeaway,
      "",
      report.learnings.length > 0 ? `Today's ${report.learnings.length} learning(s):` : "",
      learningSummaries,
      "",
      "Full report: /pippen",
    ]
      .filter(Boolean)
      .join("\n")

    const postData: any = {
      authorType: "system",
      postType: "post",
      content,
      sourceType: "pippen",
      sourceId: `pippen-learnings-${report.date}`,
    }

    // Assign author if we found a user
    if (pippenUser) {
      postData.authorId = pippenUser.id
    }

    const post = await prisma.feedPost.create({ data: postData })

    return { success: true, postId: post.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[Pippen] postDailyTakeaway failed:", message)
    return { success: false, error: message }
  }
}

/**
 * Find the Pippen user for feed post attribution.
 * Tries: user named "Pippen" > first ADMIN > null (system post with no author).
 */
async function findPippenUser(): Promise<{ id: string } | null> {
  try {
    const pippen = await prisma.user.findFirst({
      where: { name: { contains: "Pippen", mode: "insensitive" } },
      select: { id: true },
    })
    if (pippen) return pippen

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    })
    return admin
  } catch {
    return null
  }
}
