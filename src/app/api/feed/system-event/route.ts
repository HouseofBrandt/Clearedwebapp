import { NextRequest, NextResponse } from "next/server"
import { createFeedEvent } from "@/lib/feed/create-event"

/**
 * POST /api/feed/system-event — internal route for creating system feed events.
 * Protected by CRON_SECRET since this is only called server-side.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { eventType, caseId, eventData, content } = await request.json()

    if (!eventType || !content) {
      return NextResponse.json({ error: "eventType and content are required" }, { status: 400 })
    }

    await createFeedEvent({ eventType, caseId, eventData, content })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error: any) {
    console.error("[Feed] System event failed:", error.message)
    return NextResponse.json({ error: "Failed to create system event" }, { status: 500 })
  }
}
