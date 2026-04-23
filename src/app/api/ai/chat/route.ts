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
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import Anthropic from "@anthropic-ai/sdk"
import { buildMessagesRequest } from "@/lib/ai/model-capabilities"
import { preferredOpusModel } from "@/lib/ai/model-selection"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages, caseContext, model, attachments, pageContext, currentRoute, fullFetch } = await request.json()

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

    // When context was requested but unavailable (and not in Full Fetch mode which handles its own data loading), add guardrail to prevent fabrication
    if (!contextAvailable && !fullFetch) {
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

  // Tokenization state — hoisted so Full Fetch can contribute tokens before message tokenization
  const knownNames: string[] = caseContext?.clientName ? [caseContext.clientName] : []
  const sessionTokenMap: Record<string, string> = {}

  // Full Fetch Mode: detect case references and load live data
  if (fullFetch) {
    let fullFetchCaseId = caseContext?.caseId || null

    // If no explicit case context, try to detect a case reference in the user's message
    if (!fullFetchCaseId && lastUserContent) {
      try {
        const detectedCase = await findCaseByName(lastUserContent)
        if (detectedCase) {
          fullFetchCaseId = detectedCase.id
          console.log(`[Full Fetch] Detected case reference: ${detectedCase.name} (${detectedCase.id})`)
        }
      } catch (e: any) {
        console.warn("[Full Fetch] Case detection failed:", e.message)
      }
    }

    if (fullFetchCaseId) {
      try {
        const { data: fullFetchData, knownNames: fetchNames } = await loadFullFetchCaseData(fullFetchCaseId)
        if (fullFetchData) {
          // Tokenize the Full Fetch data before injecting into system prompt — PII protection
          const { tokenizedText: tokenizedFetchData, tokenMap: fetchTokenMap } = tokenizeText(
            fullFetchData,
            fetchNames,
          )
          Object.assign(sessionTokenMap, fetchTokenMap)
          systemPrompt += tokenizedFetchData
          contextAvailable = true
          console.log(`[Full Fetch] Successfully loaded case data (${fullFetchData.length} chars, tokenized)`)
        } else {
          console.warn("[Full Fetch] loadFullFetchCaseData returned null")
        }
      } catch (e: any) {
        console.error("[Full Fetch] Case data loading FAILED:", e.message, e.stack?.slice(0, 300))
      }
    } else if (fullFetch) {
      console.log("[Full Fetch] No case ID detected from message")
    }

    if (contextAvailable) {
      systemPrompt += `\n\n=== FULL FETCH MODE — RESPONSE STANDARDS ===

You have LIVE CASE DATA loaded above between the === FULL FETCH === markers. This includes documents with extracted text, liability periods with dollar amounts, deadlines, case intelligence, client notes, and AI work products.

RESPONSE RULES:
1. LEAD WITH DATA, NOT FILENAMES. When asked about balances, give the actual dollar amounts from the LIABILITY PERIODS section. When asked about document content, quote the actual CONTENT text, not just the filename.

2. BE SPECIFIC AND CITE NUMBERS. Never say "approximately" when you have exact figures. Use the actual amounts from the data: "$45,231.18" not "around $45K". Include assessment dates, CSED dates, penalty amounts — every number that's in the data.

3. FORMAT FOR PRACTITIONERS. These are licensed EAs, CPAs, and attorneys. Present data in clean tables when comparing across tax years. Use professional language. No unnecessary caveats or hedging when the data is right in front of you.

4. NEVER SAY "I don't have" when the data IS loaded above. Search the CONTENT sections of documents for the answer. Search LIABILITY PERIODS for balances. Search CLIENT NOTES for history. Search CASE INTELLIGENCE for status.

5. IF DATA IS GENUINELY MISSING, be specific: "The case file has transcripts for TY2019-2024 but no TY2018 transcript has been uploaded. You'll need to pull that from e-Services."

6. PROACTIVE INSIGHTS. After answering the question, briefly flag anything relevant you notice: approaching CSEDs, missing documents that block resolution, compliance gaps, or strategic considerations.

7. KEEP IT CONCISE. Answer the question directly first. Supporting detail second. No preamble, no "Great question!", no restating what the user asked.`
    } else {
      systemPrompt += `\n\nFULL FETCH MODE is active but no case data was loaded — either no case was detected from the message or there was a loading error. Ask the user to select a case from the dropdown or mention a specific client name. You can still help with general tax resolution questions.`
    }
  }

  // Use non-streaming for web search to avoid tool execution issues in SSE stream.
  // The web_search tool produces tool_use/tool_result content blocks that break
  // a text-only streaming handler. Non-streaming lets the SDK handle the full
  // tool execution loop, then we extract and forward the final text.
  try {
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

    const chatModel = preferredOpusModel()
    const response = await anthropic.messages.create(
      buildMessagesRequest({
        model: chatModel,
        max_tokens: 6144,
        temperature: 0.3,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: apiMessages,
      })
    )

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
          if (caseContext?.caseId || fullFetch) {
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

// ── Full Fetch helpers ────────────────────────────────────────────

/**
 * Search for a case by client name or TABS number in the user's message.
 * Since clientName is encrypted in the database, we decrypt each name and
 * compare against the user message text.
 */
async function findCaseByName(
  userMessage: string
): Promise<{ id: string; name: string; tabsNumber: string } | null> {
  // Get active cases (not CLOSED) to search through
  const cases = await prisma.case.findMany({
    where: { status: { not: "CLOSED" } },
    select: { id: true, clientName: true, tabsNumber: true, caseType: true },
    take: 100,
  })

  const messageLower = userMessage.toLowerCase()

  // Check TABS numbers first (exact match in message)
  const tabsMatch = messageLower.match(/\d{4,5}\.\d{4}/)
  if (tabsMatch) {
    const found = cases.find((c) => c.tabsNumber?.includes(tabsMatch[0]))
    if (found) {
      try {
        const name = decryptField(found.clientName)
        return { id: found.id, name, tabsNumber: found.tabsNumber || "" }
      } catch {
        return { id: found.id, name: found.tabsNumber || "Unknown", tabsNumber: found.tabsNumber || "" }
      }
    }
  }

  // Search by client name — decrypt and compare
  for (const c of cases) {
    try {
      const decryptedName = decryptField(c.clientName)
      if (!decryptedName) continue

      const nameLower = decryptedName.toLowerCase()
      // Split the name into parts (e.g., "John Whitfield" -> ["john", "whitfield"])
      const nameParts = nameLower.split(/\s+/).filter((p) => p.length > 2)

      // Check if any significant name part appears in the message
      // (skip very short parts like "Jr", "II", etc. to avoid false positives)
      for (const part of nameParts) {
        if (part.length >= 4 && messageLower.includes(part)) {
          return { id: c.id, name: decryptedName, tabsNumber: c.tabsNumber || "" }
        }
      }

      // Also check if the full name appears
      if (messageLower.includes(nameLower)) {
        return { id: c.id, name: decryptedName, tabsNumber: c.tabsNumber || "" }
      }
    } catch {
      // Decryption failed for this case — skip it
      continue
    }
  }

  return null
}

/**
 * Load comprehensive case data for Full Fetch mode.
 * Returns a formatted string to inject into the system prompt.
 */
async function loadFullFetchCaseData(caseId: string): Promise<{ data: string | null; knownNames: string[] }> {
  // Load case base data first (minimal query)
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      assignedPractitioner: { select: { name: true } },
    },
  })

  if (!caseData) return { data: null, knownNames: [] }

  let clientName: string
  try {
    clientName = decryptField(caseData.clientName)
  } catch {
    clientName = caseData.tabsNumber || "Unknown Client"
  }

  // Collect names for tokenization by the caller
  const collectedNames: string[] = [clientName]

  let ctx = `\n\n=== FULL FETCH: LIVE CASE DATA FOR ${clientName} (${caseData.tabsNumber}) ===\n`
  ctx += `Case Type: ${caseData.caseType} | Status: ${caseData.status}`
  if (caseData.filingStatus) ctx += ` | Filing: ${caseData.filingStatus}`
  if (caseData.totalLiability) ctx += ` | Total Liability: $${Number(caseData.totalLiability).toLocaleString()}`
  ctx += ` | Assigned: ${caseData.assignedPractitioner?.name || "Unassigned"}\n`

  // Documents — separate query to isolate errors
  try {
    const documents = await prisma.document.findMany({
      where: { caseId },
      select: { id: true, fileName: true, documentCategory: true, extractedText: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
    })
    ctx += `\nDOCUMENTS ON FILE (${documents.length}):\n`
    for (const doc of documents) {
      ctx += `- ${doc.fileName} [${doc.documentCategory}] (${doc.uploadedAt.toLocaleDateString()})\n`
      if (doc.extractedText) {
        // Include up to 3000 chars of extracted text for meaningful content search
        const preview = doc.extractedText.slice(0, 3000)
        ctx += `  CONTENT:\n${preview}\n`
        if (doc.extractedText.length > 3000) ctx += `  ...(${doc.extractedText.length - 3000} more chars)\n`
      }
    }
    console.log(`[Full Fetch] Loaded ${documents.length} documents`)
  } catch (e: any) {
    console.error("[Full Fetch] Documents query failed:", e.message)
    ctx += `\nDOCUMENTS: Error loading documents\n`
  }

  // Liability periods
  try {
    const liabilityPeriods = await prisma.liabilityPeriod.findMany({
      where: { caseId },
      orderBy: { taxYear: "asc" },
    })
    if (liabilityPeriods.length > 0) {
      const totalLiability = liabilityPeriods.reduce((sum, lp) => sum + Number(lp.totalBalance || 0), 0)
      ctx += `\nLIABILITY PERIODS (${liabilityPeriods.length} periods, TOTAL: $${totalLiability.toLocaleString()}):\n`
      for (const lp of liabilityPeriods) {
        ctx += `  TY ${lp.taxYear} | Form ${lp.formType} | Assessment: $${Number(lp.originalAssessment || 0).toLocaleString()} | Penalties: $${Number(lp.penalties || 0).toLocaleString()} | Interest: $${Number(lp.interest || 0).toLocaleString()} | TOTAL DUE: $${Number(lp.totalBalance || 0).toLocaleString()} | Status: ${lp.status || "N/A"}`
        if (lp.assessmentDate) ctx += ` | Assessed: ${lp.assessmentDate.toLocaleDateString()}`
        if (lp.csedDate) ctx += ` | CSED: ${lp.csedDate.toLocaleDateString()}`
        ctx += `\n`
      }
    }
  } catch (e: any) {
    console.error("[Full Fetch] Liability periods query failed:", e.message)
  }

  // Deadlines
  try {
    const deadlines = await prisma.deadline.findMany({
      where: { caseId, status: { not: "COMPLETED" } },
      orderBy: { dueDate: "asc" },
      take: 10,
    })
    if (deadlines.length > 0) {
      ctx += `\nACTIVE DEADLINES:\n`
      for (const d of deadlines) {
        const daysRemaining = Math.ceil((d.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        ctx += `- ${d.title}: ${d.dueDate.toLocaleDateString()} (${daysRemaining <= 0 ? "OVERDUE" : `${daysRemaining} days`}, ${d.priority})\n`
      }
    }
  } catch (e: any) {
    console.error("[Full Fetch] Deadlines query failed:", e.message)
  }

  // Intelligence / Smart Status
  try {
    const intelligence = await prisma.caseIntelligence.findUnique({ where: { caseId } })
    if (intelligence) {
      ctx += `\nCASE INTELLIGENCE:\n`
      if (intelligence.digest) ctx += `Digest: ${intelligence.digest}\n`
      if (intelligence.nextSteps) {
        const steps = intelligence.nextSteps as any[]
        if (Array.isArray(steps) && steps.length > 0) {
          ctx += `Next Steps:\n`
          for (const s of steps.slice(0, 5)) {
            ctx += `  - [${String(s.priority || "NORMAL").toUpperCase()}] ${s.action}${s.reason ? ` — ${s.reason}` : ""}\n`
          }
        }
      }
      if (intelligence.irsLastAction) ctx += `IRS Last Action: ${intelligence.irsLastAction}\n`
      if (intelligence.irsAssignedUnit) ctx += `IRS Assigned Unit: ${intelligence.irsAssignedUnit}\n`
    }
  } catch (e: any) {
    console.error("[Full Fetch] Intelligence query failed:", e.message)
  }

  // Client notes
  try {
    const clientNotes = await prisma.clientNote.findMany({
      where: { caseId, isDeleted: false },
      select: { content: true, noteType: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    if (clientNotes.length > 0) {
      ctx += `\nCLIENT NOTES (${clientNotes.length}):\n`
      for (const note of clientNotes) {
        ctx += `- [${note.noteType}] ${note.title || "(no title)"} (${note.createdAt.toLocaleDateString()}):\n`
        ctx += `  ${note.content.slice(0, 500)}\n`
      }
    }
  } catch (e: any) {
    console.error("[Full Fetch] Client notes query failed:", e.message)
  }

  // AI Task outputs
  try {
    const aiTasks = await prisma.aITask.findMany({
      where: { caseId, status: { in: ["READY_FOR_REVIEW", "APPROVED"] } },
      select: { taskType: true, status: true, detokenizedOutput: true, createdAt: true, banjoStepLabel: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    if (aiTasks.length > 0) {
      ctx += `\nAI WORK PRODUCTS:\n`
      for (const task of aiTasks) {
        ctx += `- ${task.banjoStepLabel || task.taskType} (${task.status}, ${task.createdAt.toLocaleDateString()})\n`
        if (task.detokenizedOutput) {
          try {
            const output = decryptField(task.detokenizedOutput)
            ctx += `  Preview: ${output.slice(0, 800)}\n`
          } catch { /* skip decryption failures */ }
        }
      }
    }
  } catch (e: any) {
    console.error("[Full Fetch] AI tasks query failed:", e.message)
  }

  // Case notes field (legacy)
  if (caseData.notes) {
    ctx += `\nCASE NOTES (legacy):\n${caseData.notes.slice(0, 500)}\n`
  }

  ctx += `\n=== END FULL FETCH DATA ===\n`

  return { data: ctx, knownNames: collectedNames }
}
