import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { createJunebugPlaceholder } from "@/lib/feed/junebug-reply"
import { z } from "zod"

const replySchema = z.object({
  content: z.string().min(1).max(10000),
  mentions: z
    .array(
      z.object({
        type: z.enum(["user", "junebug", "case"]),
        id: z.string().optional(),
        display: z.string(),
      })
    )
    .optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = replySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { content, mentions } = parsed.data

    // Verify post exists
    const post = await prisma.feedPost.findUnique({
      where: { id: params.postId },
      select: { id: true, caseId: true },
    })
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    const reply = await prisma.feedReply.create({
      data: {
        postId: params.postId,
        authorId: auth.userId,
        authorType: "user",
        content,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    })

    // Increment reply count
    await prisma.feedPost.update({
      where: { id: params.postId },
      data: { replyCount: { increment: 1 } },
    })

    // If @Junebug is mentioned, create the placeholder synchronously and
    // return its ID so the client can invoke POST
    // /api/feed/[postId]/junebug-complete in its own lambda (with
    // maxDuration = 60). See junebug-reply.ts for the split rationale.
    const hasJunebugMention = mentions?.some((m) => m.type === "junebug")
    let junebugPlaceholderId: string | null = null
    if (hasJunebugMention) {
      try {
        junebugPlaceholderId = await createJunebugPlaceholder(params.postId)
      } catch (err: any) {
        console.error("[Feed] Failed to create Junebug placeholder:", err?.message)
      }
    }

    return NextResponse.json(
      { ...reply, junebugPlaceholderId },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("[Feed] Reply failed:", error.message)
    return NextResponse.json({ error: "Failed to add reply" }, { status: 500 })
  }
}

/**
 * GET /api/feed/[postId]/reply — get all replies for a post
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const replies = await prisma.feedReply.findMany({
    where: { postId: params.postId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ replies })
}
