import { prisma } from "@/lib/db"

interface CreateFeedEventParams {
  eventType: string
  caseId?: string
  eventData?: Record<string, any>
  content: string
}

/**
 * Creates a system-generated feed event post.
 * Called from banjo execution, document upload, review actions, and cron jobs.
 */
export async function createFeedEvent({
  eventType,
  caseId,
  eventData,
  content,
}: CreateFeedEventParams) {
  try {
    await prisma.feedPost.create({
      data: {
        authorType: "system",
        postType: "system_event",
        content,
        caseId: caseId || null,
        eventType,
        eventData: eventData || undefined,
      },
    })
  } catch (err: any) {
    // Non-blocking — log and continue
    console.error("[FeedEvent] Failed to create feed event:", err.message)
  }
}
