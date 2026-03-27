import { JunebugRequest } from "./runtime"
import {
  getCaseContextPacket,
  formatContextForPrompt,
} from "@/lib/switchboard/context-packet"
import { assembleNoteContext } from "@/lib/notes/context-assembly"

export interface JunebugContext {
  caseContext?: string
  noteContext?: string
  formContext?: string
  reviewContext?: string
  sources: string[]
  confidence: number
}

export async function gatherContext(
  request: JunebugRequest
): Promise<JunebugContext> {
  const ctx: JunebugContext = { sources: [], confidence: 100 }

  // ── Case context ──────────────────────────────────────────
  if (request.caseId) {
    try {
      const packet = await getCaseContextPacket(request.caseId, {
        includeKnowledge: false, // KB is searched per-message via tool
        includeReviewInsights: true,
      })
      if (packet) {
        ctx.caseContext = formatContextForPrompt(packet)
        ctx.sources.push("Case data", "Case intelligence", "Deadlines")
      } else {
        ctx.confidence -= 30
      }
    } catch {
      ctx.confidence -= 30
    }

    // Notes context
    try {
      const noteResult = await assembleNoteContext(request.caseId, {
        featureArea:
          request.surface === "form" ? "general" : undefined,
      })
      if (noteResult?.contextText) {
        ctx.noteContext = noteResult.contextText
        ctx.sources.push("Case notes", "Conversations")
      }
    } catch {
      // Non-fatal — continue without notes
    }
  }

  // ── Form context ──────────────────────────────────────────
  if (request.surface === "form" && request.formNumber) {
    ctx.formContext = `Active form: ${request.formNumber}`
    if (request.activeSection)
      ctx.formContext += `, Section: ${request.activeSection}`
    if (request.activeField)
      ctx.formContext += `, Field: ${request.activeField}`
    ctx.sources.push("Form schema")
  }

  return ctx
}

export function buildMessages(
  request: JunebugRequest,
  context: JunebugContext
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = []

  // Add context as a preamble in the first user message if available
  let contextBlock = ""
  if (context.caseContext)
    contextBlock += "\n\nCASE CONTEXT:\n" + context.caseContext
  if (context.noteContext)
    contextBlock += "\n\nNOTES & CONVERSATIONS:\n" + context.noteContext
  if (context.formContext)
    contextBlock += "\n\nFORM CONTEXT:\n" + context.formContext

  // Add conversation history
  if (request.conversationHistory?.length) {
    for (const msg of request.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  // Add current message with context
  const userContent = contextBlock
    ? `${contextBlock}\n\nUser message: ${request.message}`
    : request.message

  messages.push({ role: "user", content: userContent })

  return messages
}
