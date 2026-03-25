import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth/session"

/**
 * POST /api/feed/[postId]/treat — Give Junebug a treat for a helpful reply.
 *
 * This records positive feedback on a Junebug reply, which:
 * 1. Stores a "treat" reaction on the reply (one per user per reply)
 * 2. The treat count can be used to weight knowledge base entries and
 *    improve future AI context selection (training signal)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await requireAuth()
    const { postId } = await params
    const body = await req.json()
    const { replyId } = body

    if (!replyId) {
      return NextResponse.json({ error: "replyId required" }, { status: 400 })
    }

    // Verify the reply exists and is from Junebug
    const reply = await prisma.feedReply.findUnique({
      where: { id: replyId },
    })

    if (!reply || reply.authorType !== "junebug") {
      return NextResponse.json({ error: "Can only treat Junebug replies" }, { status: 400 })
    }

    // Toggle treat — use FeedReaction with type "treat"
    const existing = await prisma.feedReaction.findFirst({
      where: {
        postId,
        userId: session.user.id,
        type: "treat",
      },
    })

    if (existing) {
      // Remove treat
      await prisma.feedReaction.delete({ where: { id: existing.id } })
      return NextResponse.json({ treated: false })
    } else {
      // Add treat
      await prisma.feedReaction.create({
        data: {
          postId,
          userId: session.user.id,
          type: "treat",
        },
      })
      return NextResponse.json({ treated: true })
    }
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[Treat API]", error)
    return NextResponse.json({ error: "Failed to process treat" }, { status: 500 })
  }
}
