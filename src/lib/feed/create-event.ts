import { prisma } from "@/lib/db"

interface CreateFeedEventParams {
  eventType: string
  caseId?: string
  eventData?: Record<string, any>
  content: string
  sourceType?: string   // V2: "banjo", "deadline", "review", "document"
  sourceId?: string     // V2: ID of source entity
  pinned?: boolean      // V2: pin to Now strip
}

/**
 * Creates a system-generated feed event post.
 * Called from banjo execution, document upload, review actions, and cron jobs.
 * V2: supports sourceType/sourceId linkage and pinning.
 */
export async function createFeedEvent({
  eventType,
  caseId,
  eventData,
  content,
  sourceType,
  sourceId,
  pinned,
}: CreateFeedEventParams) {
  try {
    const post = await prisma.feedPost.create({
      data: {
        authorType: "system",
        postType: "system_event",
        content,
        caseId: caseId || null,
        eventType,
        eventData: eventData || undefined,
        sourceType: sourceType || null,
        sourceId: sourceId || null,
        pinned: pinned || false,
      },
    })

    // V2: Create normalized case link
    if (caseId) {
      try {
        await prisma.feedPostCase.create({
          data: { postId: post.id, caseId },
        })
      } catch {
        // Non-critical
      }
    }

    return post
  } catch (err: any) {
    // Non-blocking — log and continue
    console.error("[FeedEvent] Failed to create feed event:", err.message)
    return null
  }
}

/**
 * Creates a task-completed feed event (V2).
 */
export async function createTaskCompletedEvent({
  taskId,
  taskTitle,
  completedByName,
  caseId,
}: {
  taskId: string
  taskTitle: string
  completedByName: string
  caseId?: string | null
}) {
  return createFeedEvent({
    eventType: "task_completed",
    caseId: caseId || undefined,
    content: `${completedByName} completed task: ${taskTitle}`,
    sourceType: "task",
    sourceId: taskId,
    eventData: { taskId, taskTitle, completedByName },
  })
}
