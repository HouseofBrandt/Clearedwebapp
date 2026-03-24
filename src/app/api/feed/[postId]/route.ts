import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

const editSchema = z.object({
  content: z.string().min(1).max(10000),
})

/**
 * PATCH /api/feed/[postId] — Edit a feed post.
 * Only the original author can edit their own post.
 * Only user posts and file_share posts can be edited (not system events, tasks, or junebug).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = editSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { content } = parsed.data

    // Fetch the post
    const post = await prisma.feedPost.findUnique({
      where: { id: params.postId },
      select: {
        id: true,
        authorId: true,
        authorType: true,
        postType: true,
      },
    })

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    // Only the author can edit
    if (post.authorId !== auth.userId) {
      return NextResponse.json(
        { error: "You can only edit your own posts" },
        { status: 403 }
      )
    }

    // Only user-authored posts and file shares can be edited
    const editableTypes = ["post", "file_share"]
    if (!editableTypes.includes(post.postType) || post.authorType !== "user") {
      return NextResponse.json(
        { error: "This post type cannot be edited" },
        { status: 400 }
      )
    }

    // Update the post
    const updated = await prisma.feedPost.update({
      where: { id: params.postId },
      data: {
        content,
        updatedAt: new Date(),
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[Feed] Edit failed:", error.message)
    return NextResponse.json(
      { error: "Failed to edit post" },
      { status: 500 }
    )
  }
}
