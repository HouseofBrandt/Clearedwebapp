import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { z } from "zod"

const reactSchema = z.object({
  type: z.string().min(1).max(50),
})

/**
 * POST /api/feed/[postId]/react — toggle a reaction on a feed post
 * Supports arbitrary reaction types: thumbsup, check, pray, idea, fire, acknowledge, save, etc.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = reactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reaction type" }, { status: 400 })
    }

    const { type } = parsed.data

    // Check if reaction already exists
    const existing = await prisma.feedReaction.findUnique({
      where: {
        postId_userId_type: {
          postId: params.postId,
          userId: auth.userId,
          type,
        },
      },
    })

    if (existing) {
      // Remove reaction (toggle off)
      await prisma.feedReaction.delete({ where: { id: existing.id } })
      return NextResponse.json({ reacted: false, type })
    } else {
      // Add reaction (toggle on)
      await prisma.feedReaction.create({
        data: {
          postId: params.postId,
          userId: auth.userId,
          type,
        },
      })
      return NextResponse.json({ reacted: true, type })
    }
  } catch (error: any) {
    console.error("[Feed] React toggle failed:", error.message)
    return NextResponse.json({ error: "Failed to toggle reaction" }, { status: 500 })
  }
}
