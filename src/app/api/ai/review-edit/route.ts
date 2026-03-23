import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { tokenizeText, detokenizeText } from "@/lib/ai/tokenizer"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" })

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  const { currentOutput, instruction, taskType } = await request.json()

  if (!currentOutput || !instruction) {
    return NextResponse.json({ error: "currentOutput and instruction are required" }, { status: 400 })
  }

  try {
    // Tokenize the output before sending to Claude (PII protection)
    const { tokenizedText, tokenMap } = tokenizeText(currentOutput, [])

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 12288,
      temperature: 0.1,
      system: `You are editing a tax resolution document. The practitioner has requested a specific change. Apply the change precisely — modify only what was requested. Preserve everything else exactly as-is, including all formatting, section headers, tables, citations, [VERIFY] flags, and [PRACTITIONER JUDGMENT] flags. Return the complete updated document.

Do not add preamble, commentary, or explanation. Return only the updated document.`,
      messages: [{
        role: "user",
        content: `CURRENT DOCUMENT:\n${tokenizedText}\n\nPRACTITIONER INSTRUCTION:\n${instruction}\n\nReturn the complete updated document.`,
      }],
    })

    const editedTokenized = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")

    const editedOutput = detokenizeText(editedTokenized, tokenMap)

    return NextResponse.json({ updatedOutput: editedOutput })
  } catch (error: any) {
    console.error("[Review Edit] Error:", error.message)
    return NextResponse.json({ error: "Edit failed. Please try again." }, { status: 500 })
  }
}
