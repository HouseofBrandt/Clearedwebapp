import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/session"
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/ai/audit"

/**
 * POST /api/assistant/treat
 * Records when a practitioner gives Junebug a "treat" for a helpful chat response.
 * This is a positive feedback signal that can be used to improve future responses.
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth()
    const userId = session.user.id

    const body = await request.json()
    const { messageId, action } = body

    if (!messageId || !["give", "remove"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Log the treat action for training signal
    await createAuditLog({
      action: AUDIT_ACTIONS.AI_RESPONSE_APPROVED,
      userId,
      metadata: {
        type: "junebug_treat",
        messageId,
        treatAction: action,
        source: "chat_panel",
      },
    })

    return NextResponse.json({ success: true, action })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
