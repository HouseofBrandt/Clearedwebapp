import { prisma } from "@/lib/db"
import { loadPrompt } from "@/lib/ai/prompts"
import { getCaseContextPacket, formatContextForPrompt } from "@/lib/switchboard/context-packet"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

const FEED_SYSTEM_ADDITION = `You are responding in the firm's activity feed. Keep your answer concise — 2-4 sentences for simple questions, more for complex analysis. Use the case data in your context to give specific, actionable answers. Do not use markdown headers. Use plain text with bullet points when listing items.`

/**
 * Generates a Junebug reply to a feed post that tagged @Junebug.
 *
 * 1. Creates a placeholder reply (content: null) so UI shows "thinking"
 * 2. Calls Claude with case context
 * 3. Updates the placeholder with the response
 * 4. Increments replyCount on the parent post
 */
export async function generateJunebugReply(postId: string, userMessage: string, caseId?: string | null) {
  // Create placeholder reply
  const placeholder = await prisma.feedReply.create({
    data: {
      postId,
      authorType: "junebug",
      content: null,
    },
  })

  try {
    // Build system prompt
    let systemPrompt = loadPrompt("research_assistant_v1")
    systemPrompt += "\n\n" + FEED_SYSTEM_ADDITION

    // Add case context if a case is tagged
    if (caseId) {
      try {
        const packet = await getCaseContextPacket(caseId, {
          includeKnowledge: false,
          includeReviewInsights: true,
        })
        if (packet) {
          systemPrompt += "\n\n" + formatContextForPrompt(packet)
        }
      } catch {
        // Continue without case context
      }
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    })

    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n\n")

    // Update placeholder with response
    await prisma.feedReply.update({
      where: { id: placeholder.id },
      data: { content: textContent },
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
      data: { content: "Got distracted by a squirrel. Try asking again?" },
    })
    await prisma.feedPost.update({
      where: { id: postId },
      data: { replyCount: { increment: 1 } },
    })
    return placeholder.id
  }
}
