import { prisma } from "@/lib/db"
import { runJunebug } from "@/lib/junebug/runtime"

/**
 * Generates a Junebug reply to a feed post that tagged @Junebug.
 *
 * Uses the Junebug Agent Runtime so the feed gets the same tool access,
 * context assembly, and personality as every other surface.
 *
 * 1. Creates a placeholder reply (content: null) so UI shows "thinking"
 * 2. Calls the runtime with surface="feed" and case context
 * 3. Updates the placeholder with the response
 * 4. Increments replyCount on the parent post
 */
export async function generateJunebugReply(
  postId: string,
  userMessage: string,
  caseId?: string | null
) {
  // Create placeholder reply
  const placeholder = await prisma.feedReply.create({
    data: {
      postId,
      authorType: "junebug",
      content: null,
    },
  })

  try {
    const result = await runJunebug({
      surface: "feed",
      userId: "system",
      message: userMessage,
      caseId: caseId || undefined,
    })

    // Update placeholder with response
    await prisma.feedReply.update({
      where: { id: placeholder.id },
      data: { content: result.text },
    })

    // Increment reply count
    await prisma.feedPost.update({
      where: { id: postId },
      data: { replyCount: { increment: 1 } },
    })

    return placeholder.id
  } catch (err: any) {
    console.error("[JunebugReply] Failed:", err.message)
    // Update placeholder with error message
    await prisma.feedReply.update({
      where: { id: placeholder.id },
      data: {
        content:
          "Sorry, I tripped over my own paws on that one. Try tagging me again?",
      },
    })
    await prisma.feedPost.update({
      where: { id: postId },
      data: { replyCount: { increment: 1 } },
    })
    return placeholder.id
  }
}
