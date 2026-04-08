import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { z } from "zod"

const prescopeSchema = z.object({
  questionText: z.string().min(1, "questionText is required"),
  mode: z.enum([
    "QUICK_ANSWER",
    "ISSUE_BRIEF",
    "RESEARCH_MEMORANDUM",
    "AUTHORITY_SURVEY",
    "COUNTERARGUMENT_PREP",
  ]),
})

/**
 * POST /api/research/prescope
 * Run a prescope analysis on a research question.
 * Returns refinement suggestions to help the practitioner narrow their query.
 *
 * Stubbed for now — the actual AI-powered prescope will be added in Phase 2.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const body = await request.json()
    const parsed = prescopeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { questionText, mode } = parsed.data

    // Stubbed prescope response with 3 refinement options
    const prescopeResult = {
      originalQuestion: questionText,
      mode,
      refinements: [
        {
          id: "refinement-1",
          label: "Narrow to specific IRC section",
          description:
            "Focus the research on the most relevant Internal Revenue Code section(s) rather than a broad survey.",
          suggestedQuestion: `${questionText} — specifically under IRC § [relevant section]`,
          estimatedSources: 8,
          estimatedTime: "3-5 minutes",
        },
        {
          id: "refinement-2",
          label: "Include procedural context",
          description:
            "Add the current procedural posture (e.g., audit, appeals, litigation) to surface more targeted authorities.",
          suggestedQuestion: `${questionText} — in the context of [procedural stage]`,
          estimatedSources: 12,
          estimatedTime: "5-8 minutes",
        },
        {
          id: "refinement-3",
          label: "Add counterargument dimension",
          description:
            "Expand the research to anticipate and address IRS counterarguments or adverse authorities.",
          suggestedQuestion: `${questionText} — including potential IRS counterarguments`,
          estimatedSources: 15,
          estimatedTime: "8-12 minutes",
        },
      ],
      suggestedSources: [
        "IRC_STATUTE",
        "TREASURY_REGULATION",
        "TAX_COURT",
        "REVENUE_RULING",
      ],
      estimatedComplexity: mode === "QUICK_ANSWER" ? "low" : mode === "ISSUE_BRIEF" ? "medium" : "high",
    }

    return NextResponse.json(prescopeResult)
  } catch (error: any) {
    console.error("[Research Prescope] POST error:", error.message)
    return NextResponse.json(
      { error: "Failed to run prescope analysis" },
      { status: 500 }
    )
  }
}
