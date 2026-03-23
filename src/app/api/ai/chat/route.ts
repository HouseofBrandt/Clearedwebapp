import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { loadPrompt } from "@/lib/ai/prompts"
import { searchKnowledge } from "@/lib/knowledge/search"
import { detectDataNeeds, fetchPlatformData } from "@/lib/ai/platform-data"
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

  const { messages, caseContext, model } = await request.json()

  // Build system prompt
  let systemPrompt = loadPrompt("research_assistant_v1")

  // Add case context if on a case page
  if (caseContext) {
    systemPrompt += `\n\nCONTEXT: The practitioner is working on case ${caseContext.tabsNumber}. `
    systemPrompt += `Case type: ${caseContext.caseType}. Status: ${caseContext.status}. `
    if (caseContext.filingStatus) systemPrompt += `Filing status: ${caseContext.filingStatus}. `
    if (caseContext.totalLiability) systemPrompt += `Total liability: $${Number(caseContext.totalLiability).toLocaleString()}. `
    systemPrompt += `Use this context when relevant but do not reference client names or PII.`
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

  // Use non-streaming for web search to avoid tool execution issues in SSE stream.
  // The web_search tool produces tool_use/tool_result content blocks that break
  // a text-only streaming handler. Non-streaming lets the SDK handle the full
  // tool execution loop, then we extract and forward the final text.
  try {
    const apiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    const response = await anthropic.messages.create({
      model: model || "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: apiMessages,
    })

    // Extract all text content from the response (skipping tool_use/tool_result blocks)
    const textContent = response.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text?: string }) => (block as { type: "text"; text: string }).text)
      .join("\n\n")

    const readable = new ReadableStream({
      start(controller) {
        try {
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
