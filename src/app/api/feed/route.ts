import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { generateJunebugReply } from "@/lib/feed/junebug-reply"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { z } from "zod"

const createPostSchema = z.object({
  postType: z.enum(["post", "file_share"]),
  content: z.string().min(1).max(10000),
  caseId: z.string().optional(),
  mentions: z
    .array(
      z.object({
        type: z.enum(["user", "junebug", "case"]),
        id: z.string().optional(),
        display: z.string(),
      })
    )
    .optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string(),
        fileUrl: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
      })
    )
    .optional(),
})

/**
 * GET /api/feed — paginated feed posts (V2 with reactions support)
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get("cursor")
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)
  const caseId = searchParams.get("caseId")
  const postType = searchParams.get("postType")
  const assigneeId = searchParams.get("assigneeId")
  const after = searchParams.get("after") // for polling: get posts after this timestamp
  const authorId = searchParams.get("authorId")

  const where: any = { archived: false }
  if (caseId) where.caseId = caseId
  if (authorId) where.authorId = authorId
  if (postType === "post") where.postType = { in: ["post", "file_share", "junebug_insight"] }
  else if (postType === "task") where.postType = { in: ["task", "task_created", "task_completed"] }
  else if (postType === "my_tasks") {
    where.postType = { in: ["task", "task_created"] }
    where.taskAssigneeId = assigneeId || auth.userId
    where.taskCompleted = false
  } else if (postType === "system_event") {
    where.postType = "system_event"
  } else if (postType) {
    where.postType = postType
  }

  if (after) {
    where.createdAt = { gt: new Date(after) }
  }

  if (cursor) {
    where.createdAt = { ...(where.createdAt || {}), lt: new Date(cursor) }
  }

  try {
    const posts = await prisma.feedPost.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where,
      include: {
        author: { select: { id: true, name: true, role: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        taskAssignee: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
        reactions: {
          where: { userId: auth.userId },
          select: { id: true, type: true },
        },
        _count: { select: { replies: true, likes: true, reactions: true } },
        likes: {
          where: { userId: auth.userId },
          select: { id: true },
        },
      },
    })

    // Transform for client
    const transformed = posts.map((post) => ({
      ...post,
      replyCount: post._count.replies,
      likeCount: post._count.likes,
      reactionCount: post._count.reactions,
      liked: post.likes.length > 0,
      myReactions: post.reactions.map((r) => r.type),
      likes: undefined,
      reactions: undefined,
      _count: undefined,
    }))

    const nextCursor =
      posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null

    return NextResponse.json({ posts: transformed, nextCursor })
  } catch (error: any) {
    // Feed tables may not exist yet
    console.error("[Feed] GET error:", error?.message)
    return NextResponse.json({ posts: [], nextCursor: null })
  }
}

/**
 * POST /api/feed — create a new feed post (V2 with normalized mentions)
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const rateCheck = checkRateLimit(auth.userId, "feed-post", RATE_LIMITS.feedPost)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } }
    )
  }

  try {
    const body = await request.json()
    const parsed = createPostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { postType, content, caseId, mentions, attachments } = parsed.data

    const post = await prisma.feedPost.create({
      data: {
        authorId: auth.userId,
        authorType: "user",
        postType,
        content,
        caseId: caseId || null,
        mentions: mentions || undefined,
        attachments: attachments || undefined,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
      },
    })

    // Create normalized mentions if provided
    if (mentions && mentions.length > 0) {
      try {
        await prisma.feedMention.createMany({
          data: mentions.map((m) => ({
            postId: post.id,
            mentionType: m.type,
            userId: m.type === "user" ? m.id : null,
            display: m.display,
          })),
        })
      } catch {
        // Non-critical: normalized mentions table may not exist yet
      }
    }

    // Create normalized case link if caseId provided
    if (caseId) {
      try {
        await prisma.feedPostCase.create({
          data: { postId: post.id, caseId },
        })
      } catch {
        // Non-critical
      }
    }

    // Create inbox notifications for mentioned users
    if (mentions && mentions.length > 0) {
      const mentionedUserIds = mentions
        .filter((m) => m.type === "user" && m.id && m.id !== auth.userId)
        .map((m) => m.id!)

      if (mentionedUserIds.length > 0) {
        try {
          const authorName = post.author?.name || "Someone"
          const caseLabel = post.case?.tabsNumber
            ? ` on ${post.case.tabsNumber}`
            : ""

          await prisma.message.createMany({
            data: mentionedUserIds.map((uid) => ({
              type: "DIRECT_MESSAGE" as const,
              priority: "NORMAL" as const,
              subject: `${authorName} mentioned you in a feed post${caseLabel}`,
              body: content.length > 200 ? content.slice(0, 200) + "..." : content,
              senderId: auth.userId,
              senderName: authorName,
              recipientId: uid,
              caseId: caseId || null,
              metadata: {
                source: "feed_mention",
                feedPostId: post.id,
              },
            })),
          })
        } catch {
          // Non-critical: notification delivery should not block post creation
        }
      }
    }

    // If @Junebug is mentioned, trigger async reply
    const hasJunebugMention = mentions?.some((m) => m.type === "junebug")
    if (hasJunebugMention) {
      generateJunebugReply(post.id, content, caseId).catch((err) => {
        console.error("[Feed] Junebug reply failed:", err.message)
      })
    }

    // Notify mentioned users
    const userMentions = mentions?.filter((m) => m.type === "user" && m.id) || []
    if (userMentions.length > 0) {
      const mentionNotifications = userMentions.map((m) =>
        prisma.message.create({
          data: {
            type: "DIRECT_MESSAGE",
            priority: "NORMAL",
            subject: `${post.author.name} mentioned you in a post`,
            body: content.substring(0, 300),
            recipientId: m.id!,
            senderId: auth.userId,
            senderName: post.author.name || "Unknown",
            tags: ["feed-mention"],
            metadata: { postId: post.id, caseId: caseId || undefined },
          },
        }).catch((err: any) => {
          console.error("[Feed] Failed to notify mentioned user:", err.message)
        })
      )
      Promise.all(mentionNotifications).catch(() => {})
    }

    return NextResponse.json(post, { status: 201 })
  } catch (error: any) {
    console.error("[Feed] Create post failed:", error.message)
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 })
  }
}
