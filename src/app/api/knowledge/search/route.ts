import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { searchKnowledge } from "@/lib/knowledge/search"

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const url = request.nextUrl.searchParams
  const query = url.get("q")
  if (!query) return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 })

  const category = url.get("category")
  const topK = parseInt(url.get("topK") || "10")

  const results = await searchKnowledge(query, {
    topK,
    categoryFilter: category ? [category] : undefined,
    minScore: 0.2,
  })

  return NextResponse.json(results)
}
