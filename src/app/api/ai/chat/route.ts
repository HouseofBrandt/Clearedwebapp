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

  // Search knowledge base for relevant material
  try {
    const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop()
    if (lastUserMsg) {
      const results = await searchKnowledge(lastUserMsg.content, { topK: 5, minScore: 0.3 })
      if (results.length > 0) {
        systemPrompt += "\n\nFIRM KNOWLEDGE BASE:\n"
        for (const r of results) {
          systemPrompt += `[${r.documentTitle}${r.sectionHeader ? ` — ${r.sectionHeader}` : ""}]\n`
          systemPrompt += `${r.content}\n\n`
        }
      }
    }
  } catch {
    // Knowledge base search failed — continue without it
  }

  // Fetch live platform data if the question is about the app
  try {
    const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop()
    if (lastUserMsg) {
      const dataNeeds = detectDataNeeds(lastUserMsg.content)
      const hasDataNeeds = Object.values(dataNeeds).some(Boolean)
      if (hasDataNeeds) {
        const userId = (session.user as any).id
        const platformData = await fetchPlatformData(dataNeeds, userId, lastUserMsg.content)
        if (platformData) {
          systemPrompt += platformData
        }
      }
    }
  } catch (e: any) {
    console.warn("[Chat] Platform data fetch failed:", e.message)
  }

  // If we're on a case page and asking about next steps or documents,
  // auto-inject the case number for data lookup
  if (caseContext?.tabsNumber) {
    try {
      const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop()
      if (lastUserMsg) {
        const extraNeeds = detectDataNeeds(lastUserMsg.content)
        if ((extraNeeds.nextSteps || extraNeeds.documentGap) && !extraNeeds.caseDetail) {
          const extraData = await fetchPlatformData(
            { caseDetail: caseContext.tabsNumber, nextSteps: extraNeeds.nextSteps, documentGap: extraNeeds.documentGap },
            (session.user as any).id,
            lastUserMsg?.content
          )
          if (extraData) systemPrompt += extraData
        }
      }
    } catch {
      // ignore
    }
  }

  // Stream response
  const stream = anthropic.messages.stream({
    model: model || "claude-sonnet-4-6",
    max_tokens: 4096,
    temperature: 0.3,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  })

  const readable = new ReadableStream({
    async start(controller) {
      stream.on("text", (text) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`))
        } catch { /* client disconnected */ }
      })

      stream.on("end", () => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch { /* already closed */ }
      })

      stream.on("error", (err) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
          controller.close()
        } catch { /* already closed */ }
      })
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