import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { parseTranscripts } from "@/lib/tax/transcript-parser"
import { z } from "zod"

const parseSchema = z.object({
  files: z.array(
    z.object({
      data: z.string(),
      mediaType: z.string(),
    })
  ).min(1).max(30),
})

/**
 * POST /api/rcc/parse — parse IRS transcript PDFs via Claude
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = parseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const result = await parseTranscripts(parsed.data.files)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[RCC] Parse error:", error.message)
    return NextResponse.json({ error: "Failed to parse transcripts" }, { status: 500 })
  }
}
