/**
 * Junebug Agent Runtime
 *
 * The central engine for all AI surfaces in Cleared. Every AI interaction —
 * chat, feed, form assistant, review helper, dashboard briefing, inbox —
 * calls runJunebug() instead of building its own prompt + API call.
 *
 * This gives us:
 * - One place to manage tools, context, and prompts
 * - Consistent personality and behavior across surfaces
 * - Permission-aware tool execution
 * - Unified audit trail
 */

import { buildSystemPrompt } from "./prompts"
import { gatherContext, buildMessages, JunebugContext } from "./context"
import { getAvailableTools, JunebugTool } from "./tools"
import { humanizeText } from "@/lib/ai/humanizer"

// ── Types ──────────────────────────────────────────────────

export type JunebugSurface =
  | "chat"
  | "feed"
  | "form"
  | "review"
  | "dashboard"
  | "inbox"

export interface JunebugRequest {
  surface: JunebugSurface
  userId: string
  userName?: string
  userRole?: string
  message: string

  // Context
  caseId?: string
  formNumber?: string
  activeField?: string
  activeSection?: string
  reviewTaskId?: string

  // Browser context (from diagnostics)
  pageContext?: any
  currentRoute?: string

  // History
  conversationHistory?: { role: "user" | "assistant"; content: string }[]

  // Options
  maxTokens?: number
  temperature?: number
  stream?: boolean

  // Full Fetch Mode — unlocks all tools and cross-case awareness
  fullFetch?: boolean
}

export interface JunebugResponse {
  text: string
  actions?: JunebugAction[]
  toolsUsed?: string[]
  contextSources?: string[]
  confidence?: number
}

export interface JunebugAction {
  id: string
  type: string
  label: string
  description: string
  data: any
  requiresConfirmation: boolean
}

// ── Main entry point ───────────────────────────────────────

export async function runJunebug(
  request: JunebugRequest
): Promise<JunebugResponse> {
  // 1. Build system prompt based on surface
  const systemPrompt = await buildSystemPrompt(request)

  // 2. Gather context (case data, notes, form schema, etc.)
  const context = await gatherContext(request)

  // 3. Determine available tools for this surface + user role
  const tools = getAvailableTools(request)

  // 4. Build messages with context injected
  const messages = buildMessages(request, context)

  // 5. Call Claude with tools
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  const { buildMessagesRequest } = await import("@/lib/ai/model-capabilities")
  const client = new Anthropic()

  const toolDefinitions = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as { type: "object"; [key: string]: unknown },
  }))

  const runtimeModel = "claude-sonnet-4-20250514"
  const runtimeMaxTokens = request.maxTokens || 2048
  const runtimeTemperature = request.temperature ?? 0.3

  // Initial API call
  let response = await client.messages.create(
    buildMessagesRequest({
      model: runtimeModel,
      max_tokens: runtimeMaxTokens,
      temperature: runtimeTemperature,
      system: systemPrompt,
      messages,
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
    })
  )

  // 6. Process response — handle tool use loop
  let textContent = ""
  const actions: JunebugAction[] = []
  const toolsUsed: string[] = []

  // Agentic loop: keep processing until Claude stops calling tools
  const allMessages = [...messages] as any[]
  let loopCount = 0
  const maxLoops = 5

  while (loopCount < maxLoops) {
    loopCount++

    // Collect text and tool_use blocks from this response
    const toolUseBlocks: any[] = []

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block)
      }
    }

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0) break

    // Process tool calls and build tool_result messages
    const toolResults: any[] = []

    for (const block of toolUseBlocks) {
      toolsUsed.push(block.name)
      const tool = tools.find((t) => t.name === block.name)

      if (tool) {
        try {
          const result = await tool.execute(block.input as any)

          // If tool returns an action that needs confirmation, add it
          if (result.action) {
            actions.push({
              id: block.id,
              type: block.name,
              label: result.action.label,
              description: result.action.description,
              data: result.action.data,
              requiresConfirmation:
                result.action.requiresConfirmation ?? true,
            })
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Action queued for confirmation: ${result.action.label}`,
            })
          }

          // If tool returns data, send it back as tool result
          if (result.data) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.data,
            })
          }

          // If neither action nor data, send empty acknowledgment
          if (!result.action && !result.data) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Done.",
            })
          }
        } catch (e: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${e.message}`,
            is_error: true,
          })
        }
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        })
      }
    }

    // If stop_reason is "end_turn", Claude is done even though it used tools
    if (response.stop_reason === "end_turn") break

    // Send tool results back to Claude for continued generation
    allMessages.push({ role: "assistant", content: response.content })
    allMessages.push({ role: "user", content: toolResults })

    response = await client.messages.create(
      buildMessagesRequest({
        model: runtimeModel,
        max_tokens: runtimeMaxTokens,
        temperature: runtimeTemperature,
        system: systemPrompt,
        messages: allMessages,
        ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {}),
      })
    )
  }

  // Extract any final text from the last response (if we looped)
  if (loopCount > 1) {
    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text
      }
    }
  }

  return {
    text: humanizeText(textContent),
    actions,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    contextSources: context.sources.length > 0 ? context.sources : undefined,
    confidence: context.confidence,
  }
}
