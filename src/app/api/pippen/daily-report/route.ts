export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { buildDailyIntakeReport } from "@/lib/pippen/daily-intake-report"

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get("date")

  let date: Date | undefined
  if (dateParam) {
    const parsed = new Date(dateParam + "T00:00:00")
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid date parameter. Use YYYY-MM-DD format." },
        { status: 400 }
      )
    }
    date = parsed
  }

  try {
    const report = await buildDailyIntakeReport(date)
    return NextResponse.json(report)
  } catch (error) {
    console.error("[Pippen] Daily report build failed:", error)
    return NextResponse.json(
      { error: "Failed to build daily intake report" },
      { status: 500 }
    )
  }
}
