export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const schema = z.object({
  message: z.string().min(1),
  formNumber: z.string(),
  activeSection: z.string().optional(),
  activeField: z.string().optional(),
  activeFieldLabel: z.string().optional(),
  fieldIrsReference: z.string().optional(),
  currentValues: z.record(z.string(), z.any()).optional(),
  caseId: z.string().optional(),
  mode: z.enum(["scoped", "general"]).default("scoped"),
})

// ---------------------------------------------------------------------------
// POST /api/assistant/form-help
//
// Handles Junebug in-form questions. Builds a context-aware system prompt
// based on the active form, section, and field, then queries Claude for
// an answer scoped to IRS form instructions and tax resolution guidance.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const {
      message,
      formNumber,
      activeSection,
      activeField,
      activeFieldLabel,
      fieldIrsReference,
      currentValues,
      mode,
    } = parsed.data

    // Build context-aware system prompt
    let systemPrompt = `You are Junebug, the AI assistant for a tax resolution firm. You are helping a practitioner complete IRS Form ${formNumber}.\n\n`

    if (mode === "scoped" && activeField) {
      systemPrompt += `The practitioner is currently on:\n- Section: ${activeSection}\n- Field: ${activeFieldLabel || activeField}\n`
      if (fieldIrsReference) {
        systemPrompt += `- IRS Reference: ${fieldIrsReference}\n`
      }
      systemPrompt += `\nProvide specific guidance for this field. Reference the IRS instructions. Be concise (2-4 sentences for simple questions, more for complex ones).\n`
    } else {
      systemPrompt += `The practitioner is working on the form in general mode. Answer questions about the form, IRS procedures, or case strategy.\n`
    }

    if (currentValues && Object.keys(currentValues).length > 0) {
      systemPrompt += `\nCurrent form values (for reference):\n${JSON.stringify(currentValues, null, 2).slice(0, 2000)}\n`
    }

    systemPrompt += `\nRules:\n- Be concise and actionable\n- Cite IRS form instructions or IRM sections when relevant\n- If you reference a dollar amount or computation, show the math\n- If you're not sure about something, say so\n- Never fabricate IRS guidance — if you don't know, say "I'd recommend checking the official IRS instructions for Form ${formNumber}"\n`

    try {
      // Use the Anthropic SDK
      const { default: Anthropic } = await import("@anthropic-ai/sdk")
      const { buildMessagesRequest } = await import("@/lib/ai/model-capabilities")
      const client = new Anthropic()

      const response = await client.messages.create(
        buildMessagesRequest({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: "user", content: message }],
        })
      )

      const responseText = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n\n")

      return NextResponse.json({ response: responseText })
    } catch (error: any) {
      console.error("Junebug form help error:", error)
      return NextResponse.json({
        response:
          "I'm having trouble connecting right now. Try again in a moment, or check the IRS instructions directly.",
      })
    }
  } catch (error) {
    console.error("Form help error:", error)
    return NextResponse.json({ response: "Something went wrong. Please try again." })
  }
}
