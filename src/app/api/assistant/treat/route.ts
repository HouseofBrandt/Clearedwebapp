import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/session"
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/ai/audit"

/**
 * POST /api/assistant/treat
 * Records when a practitioner gives Junebug a "treat" for a helpful chat response.
 * This is a positive feedback signal that can be used to improve future responses.
 */
export async function POST(request: Request) {
  let session
  try {
    session = await requireAuth()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { messageId, action } = body

  if (!messageId || !["give", "remove"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    // Log the treat action for training signal
    await createAuditLog({
      action: AUDIT_ACTIONS.AI_RESPONSE_APPROVED,
      practitionerId: userId,
      metadata: {
        type: "junebug_treat",
        messageId,
        treatAction: action,
        source: "chat_panel",
      },
    })

    return NextResponse.json({ success: true, action })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
