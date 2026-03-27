import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { loadPrompt } from "@/lib/ai/prompts"
import { tokenizeText, detokenizeText } from "@/lib/ai/tokenizer"
import { searchKnowledge } from "@/lib/knowledge/search"
import { detectDataNeeds, fetchPlatformData } from "@/lib/ai/platform-data"
import { getCaseContextPacket, formatContextForPrompt } from "@/lib/switchboard/context-packet"
import { createAuditLog } from "@/lib/ai/audit"
import { logObservations } from "@/lib/dev/junebug-observer"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages, caseContext, model, attachments, pageContext, currentRoute } = await request.json()

  // Build system prompt
  let systemPrompt = loadPrompt("research_assistant_v1")

  // Track whether live case context was successfully loaded
  let contextAvailable = false
  let contextFailureReason: string | null = null

  // Add case context if on a case page — use unified context packet
  if (caseContext?.caseId) {
    try {
      const packet = await getCaseContextPacket(caseContext.caseId, {
        includeKnowledge: false,  // KB is searched separately below per-message
        includeReviewInsights: true,
      })
      if (packet) {
        systemPrompt += "\n\n" + formatContextForPrompt(packet)
        contextAvailable = true
      } else {
        contextFailureReason = "Context packet returned null — case not found or empty"
      }
    } catch (ctxErr: any) {
      contextFailureReason = ctxErr?.message || "Context packet loading failed"
    }

    // When context was requested but unavailable, add guardrail to prevent fabrication
    if (!contextAvailable) {
      systemPrompt = `IMPORTANT: You do NOT have live case data for this conversation. Do not fabricate or guess specific case details like document counts, file names, Smart Status details, deadlines, AI task status, review queue status, or liability amounts. If asked about specific case data, respond: "I don't currently have live case data loaded for this case. I can help with general tax resolution guidance, but for specific case details, please check the case detail page directly."\n\n` + systemPrompt

      // Log missing-context event for audit trail
      createAuditLog({
        practitionerId: (session.user as any).id,
        caseId: caseContext.caseId,
        action: "CHAT_CONTEXT_UNAVAILABLE",
        metadata: {
          route: "/api/ai/chat",
          reason: contextFailureReason,
          timestamp: new Date().toISOString(),
        },
      }).catch(() => { /* non-fatal logging */ })
    }
  }

  // Extract last user message once (used by KB search, platform data, and case context enrichment)
  const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop()
  const lastUserContent: string = lastUserMsg?.content || ""
  const userId = (session.user as any).id

  // Search knowledge base for relevant material
  if (lastUserContent) {
    try {
      const results = await searchKnowledge(lastUserContent, { topK: 5, minScore: 0.3 })
      if (results.length > 0) {
        systemPrompt += "\n\nFIRM KNOWLEDGE BASE:\n"
        for (const r of results) {
          systemPrompt += `[${r.documentTitle}${r.sectionHeader ? ` — ${r.sectionHeader}` : ""}]\n`
          systemPrompt += `${r.content}\n\n`
        }
      }
    } catch {
      // Knowledge base search failed — continue without it
    }
  }

  // Fetch live platform data if the question is about the app
  if (lastUserContent) {
    try {
      const dataNeeds = detectDataNeeds(lastUserContent)
      const hasDataNeeds = Object.values(dataNeeds).some(Boolean)
      if (hasDataNeeds) {
        const platformData = await fetchPlatformData(dataNeeds, userId, lastUserContent)
        if (platformData) {
          systemPrompt += platformData
        }
      }
    } catch (e: any) {
      console.warn("[Chat] Platform data fetch failed:", e.message)
    }
  }

  // If we're on a case page and asking about next steps or documents,
  // auto-inject the case number for data lookup
  if (caseContext?.tabsNumber && lastUserContent) {
    try {
      const extraNeeds = detectDataNeeds(lastUserContent)
      if ((extraNeeds.nextSteps || extraNeeds.documentGap) && !extraNeeds.caseDetail) {
        const extraData = await fetchPlatformData(
          { caseDetail: caseContext.tabsNumber, nextSteps: extraNeeds.nextSteps, documentGap: extraNeeds.documentGap },
          userId,
          lastUserContent
        )
        if (extraData) systemPrompt += extraData
      }
    } catch {
      // ignore
    }
  }

  // If browser diagnostics context was provided (user mentioned a bug/error), inject it
  if (pageContext && typeof pageContext === "object") {
    const errorLines = Array.isArray(pageContext.errors) && pageContext.errors.length > 0
      ? pageContext.errors.map((e: any) =>
          `- [${e.type}] ${e.message} (${new Date(e.timestamp).toLocaleTimeString()})`
        ).join("\n")
      : "No recent errors"

    const networkLines = Array.isArray(pageContext.networkFailures) && pageContext.networkFailures.length > 0
      ? pageContext.networkFailures.map((f: any) =>
          `- ${f.method} ${f.url} → ${f.status} (${new Date(f.timestamp).toLocaleTimeString()})`
        ).join("\n")
      : "No recent failures"

    systemPrompt += `\n\nBROWSER CONTEXT (from the user's current page):
Route: ${pageContext.route || currentRoute || "unknown"}
Page Title: ${pageContext.title || "unknown"}

Recent Console Errors:
${errorLines}

Recent Network Failures:
${networkLines}

When the user asks about a bug or error:
1. Check the browser context above for relevant errors
2. Explain what you see in plain English
3. Suggest what might be causing the issue
4. Offer to file a bug report with the diagnostic data attached`
  }

  // Use non-streaming for web search to avoid tool execution issues in SSE stream.
  // The web_search tool produces tool_use/tool_result content blocks that break
  // a text-only streaming handler. Non-streaming lets the SDK handle the full
  // tool execution loop, then we extract and forward the final text.
  try {
    // Tokenize user messages to prevent PII from reaching the Anthropic API
    const knownNames: string[] = caseContext?.clientName ? [caseContext.clientName] : []
    const sessionTokenMap: Record<string, string> = {}

    const apiMessages = messages.map((m: { role: string; content: string }, idx: number) => {
      if (m.role === "user") {
        const { tokenizedText, tokenMap: msgTokenMap } = tokenizeText(m.content, knownNames)
        Object.assign(sessionTokenMap, msgTokenMap)

        // For the last user message, attach any uploaded files
        const isLast = idx === messages.length - 1
        if (isLast && attachments?.length > 0) {
          const contentBlocks: any[] = []

          // Add text content first
          if (tokenizedText.trim()) {
            contentBlocks.push({ type: "text", text: tokenizedText })
          }

          // Add attachments
          for (const att of attachments) {
            if (att.type?.startsWith("image/")) {
              // Extract base64 data from data URL
              const base64Match = att.dataUrl?.match(/^data:(image\/[^;]+);base64,(.+)$/)
              if (base64Match) {
                contentBlocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: base64Match[1],
                    data: base64Match[2],
                  },
                })
              }
            } else {
              // For non-image files, extract text from the data URL and include as context
              try {
                const textContent = Buffer.from(att.dataUrl.split(",")[1] || "", "base64").toString("utf-8")
                if (textContent.trim()) {
                  contentBlocks.push({
                    type: "text",
                    text: `[Attached file: ${att.name}]\n${textContent}`,
                  })
                }
              } catch {
                contentBlocks.push({
                  type: "text",
                  text: `[Attached file: ${att.name} — could not extract text]`,
                })
              }
            }
          }

          return { role: m.role, content: contentBlocks.length > 0 ? contentBlocks : tokenizedText }
        }

        return { role: m.role, content: tokenizedText }
      }
      return { role: m.role, content: m.content }
    })

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: apiMessages,
    })

    // Extract all text content from the response (skipping tool_use/tool_result blocks)
    let textContent = response.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text?: string }) => (block as { type: "text"; text: string }).text)
      .join("\n\n")

    // Detokenize the response so the practitioner sees real names/data
    if (Object.keys(sessionTokenMap).length > 0) {
      textContent = detokenizeText(textContent, sessionTokenMap)
    }

    // Fire-and-forget: log observations for the feedback pipeline
    logObservations({
      userMessage: lastUserContent,
      assistantResponse: textContent,
      caseId: caseContext?.caseId,
      userId,
      route: currentRoute,
      contextAvailable,
      contextFailureReason: contextFailureReason || undefined,
      pageContext,
    }).catch(() => {})

    const readable = new ReadableStream({
      start(controller) {
        try {
          // Send metadata (including contextAvailable flag) as first event
          if (caseContext?.caseId) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ meta: { contextAvailable } })}\n\n`))
          }
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: textContent })}\n\n`))
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch { /* client disconnected */ }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error: any) {
    console.error("[Chat] Claude API error:", error.message)
    const readable = new ReadableStream({
      start(controller) {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: "Failed to get response from AI. Please try again." })}\n\n`))
          controller.close()
        } catch { /* client disconnected */ }
      },
    })
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  }
}
