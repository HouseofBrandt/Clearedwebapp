/**
 * Reasoning Queue API — Detail & Actions
 *
 * GET  /api/reasoning-queue/[id]         — get full review detail
 * POST /api/reasoning-queue/[id]         — approve / reject / edit
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { recordHumanReview } from "@/lib/reasoning/logger"

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== "ADMIN" && role !== "SENIOR") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const log = await prisma.reasoningPipelineLog.findUnique({
    where: { id: params.id },
    include: {
      case: { select: { tabsNumber: true, clientName: true, caseType: true } },
    },
  })

  if (!log) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(log)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== "ADMIN" && role !== "SENIOR") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
  }

  const body = await request.json()
  const { action, notes, editedOutput } = body as {
    action: "approved" | "rejected" | "edited"
    notes?: string
    editedOutput?: string
  }

  if (!action || !["approved", "rejected", "edited"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be: approved, rejected, or edited" },
      { status: 400 }
    )
  }

  if (action === "edited" && !editedOutput) {
    return NextResponse.json(
      { error: "editedOutput is required when action is 'edited'" },
      { status: 400 }
    )
  }

  // Verify the log exists
  const log = await prisma.reasoningPipelineLog.findUnique({
    where: { id: params.id },
  })

  if (!log) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (log.humanReviewAction) {
    return NextResponse.json(
      { error: "This item has already been reviewed" },
      { status: 409 }
    )
  }

  await recordHumanReview(
    params.id,
    (session.user as any).id,
    action,
    notes,
    editedOutput
  )

  return NextResponse.json({ success: true, action })
}
