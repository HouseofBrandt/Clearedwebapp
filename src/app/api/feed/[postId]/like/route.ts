import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * POST /api/feed/[postId]/like — toggle like on a post
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    // Check if already liked
    const existing = await prisma.feedLike.findUnique({
      where: {
        postId_userId: {
          postId: params.postId,
          userId: auth.userId,
        },
      },
    })

    if (existing) {
      // Unlike
      await prisma.feedLike.delete({ where: { id: existing.id } })
      await prisma.feedPost.update({
        where: { id: params.postId },
        data: { likeCount: { decrement: 1 } },
      })
      return NextResponse.json({ liked: false })
    } else {
      // Like
      await prisma.feedLike.create({
        data: {
          postId: params.postId,
          userId: auth.userId,
        },
      })
      await prisma.feedPost.update({
        where: { id: params.postId },
        data: { likeCount: { increment: 1 } },
      })
      return NextResponse.json({ liked: true })
    }
  } catch (error: any) {
    console.error("[Feed] Like toggle failed:", error.message)
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 })
  }
}
