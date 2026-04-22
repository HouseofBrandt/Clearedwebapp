import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { decryptEmbeddedCaseClientName } from "@/lib/feed/decrypt-case-name"

/**
 * PATCH /api/feed/[postId]/complete — mark a task as complete
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const post = await prisma.feedPost.findUnique({
      where: { id: params.postId },
      select: { id: true, postType: true, taskCompleted: true },
    })

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }
    if (post.postType !== "task") {
      return NextResponse.json({ error: "Post is not a task" }, { status: 400 })
    }

    // Toggle completion
    const nowComplete = !post.taskCompleted

    const updated = await prisma.feedPost.update({
      where: { id: params.postId },
      data: {
        taskCompleted: nowComplete,
        taskCompletedAt: nowComplete ? new Date() : null,
        taskCompletedById: nowComplete ? auth.userId : null,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        case: { select: { id: true, tabsNumber: true, clientName: true, caseType: true } },
        taskAssignee: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(decryptEmbeddedCaseClientName(updated))
  } catch (error: any) {
    console.error("[Feed] Task complete failed:", error.message)
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 })
  }
}
