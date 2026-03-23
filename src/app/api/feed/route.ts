import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { generateJunebugReply } from "@/lib/feed/junebug-reply"
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
 * GET /api/feed — paginated feed posts
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

  const where: any = { archived: false }
  if (caseId) where.caseId = caseId
  if (postType === "post") where.postType = { in: ["post", "file_share", "junebug_insight"] }
  else if (postType === "task") where.postType = "task"
  else if (postType === "my_tasks") {
    where.postType = "task"
    where.taskAssigneeId = assigneeId || auth.userId
    where.taskCompleted = false
  } else if (postType) {
    where.postType = postType
  }

  if (after) {
    where.createdAt = { gt: new Date(after) }
  }

  if (cursor) {
    where.createdAt = { ...(where.createdAt || {}), lt: new Date(cursor) }
  }

  const posts = await prisma.feedPost.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    where,
    include: {
      author: { select: { id: true, name: true, role: true } },
      case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
      taskAssignee: { select: { id: true, name: true } },
      replies: {
        take: 3,
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
      _count: { select: { replies: true, likes: true } },
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
    liked: post.likes.length > 0,
    likes: undefined,
    _count: undefined,
  }))

  const nextCursor =
    posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null

  return NextResponse.json({ posts: transformed, nextCursor })
}

/**
 * POST /api/feed — create a new feed post
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

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

    // If @Junebug is mentioned, trigger async reply
    const hasJunebugMention = mentions?.some((m) => m.type === "junebug")
    if (hasJunebugMention) {
      generateJunebugReply(post.id, content, caseId).catch((err) => {
        console.error("[Feed] Junebug reply failed:", err.message)
      })
    }

    return NextResponse.json(post, { status: 201 })
  } catch (error: any) {
    console.error("[Feed] Create post failed:", error.message)
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 })
  }
}
