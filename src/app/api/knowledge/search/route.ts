import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { searchKnowledge } from "@/lib/knowledge/search"

const VALID_CATEGORIES = [
  "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
  "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
  "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
]

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const url = request.nextUrl.searchParams
  const query = url.get("q")
  if (!query) return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 })

  const category = url.get("category")
  const topK = parseInt(url.get("topK") || "10")

  // Validate category if provided
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Invalid category '${category}'. Valid values: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    )
  }

  try {
    const results = await searchKnowledge(query, {
      topK,
      categoryFilter: category ? [category] : undefined,
      minScore: 0.2,
    })

    return NextResponse.json(results)
  } catch (error) {
    console.error("[Knowledge Search] Search failed:", {
      query: query.substring(0, 100),
      category,
      topK,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: "Knowledge base search failed. Please try again." },
      { status: 500 }
    )
  }
}
