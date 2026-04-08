export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { generateDailyNewsArticle, type DailyNewsArticle } from "@/lib/pippen/daily-news-article"
import { compileDailyLearnings } from "@/lib/pippen/compile-learnings"

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get("date")

  let dateStr: string
  if (dateParam) {
    const parsed = new Date(dateParam + "T00:00:00")
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid date parameter. Use YYYY-MM-DD format." },
        { status: 400 }
      )
    }
    dateStr = dateParam
  } else {
    dateStr = new Date().toISOString().split("T")[0]
  }

  try {
    // Check if a daily news article is already cached in DailyDigest.details
    const startOfDay = new Date(dateStr + "T00:00:00")
    const endOfDay = new Date(dateStr + "T23:59:59.999")

    let cachedArticle: DailyNewsArticle | null = null

    try {
      const digest = await prisma.dailyDigest.findFirst({
        where: {
          digestDate: { gte: startOfDay, lte: endOfDay },
        },
      })

      if (digest?.details) {
        const details = digest.details as Record<string, unknown>
        if (details.newsArticle) {
          cachedArticle = details.newsArticle as DailyNewsArticle
        }
      }
    } catch {
      // DailyDigest table may not exist yet — continue to generate
    }

    if (cachedArticle) {
      return NextResponse.json(cachedArticle)
    }

    // No cached article — generate from compiled learnings
    const reportDate = new Date(dateStr + "T00:00:00")
    const report = await compileDailyLearnings(reportDate)
    const article = await generateDailyNewsArticle(report)

    // Try to cache the article in DailyDigest.details
    try {
      const digest = await prisma.dailyDigest.findFirst({
        where: {
          digestDate: { gte: startOfDay, lte: endOfDay },
        },
      })

      if (digest) {
        const existingDetails = (digest.details as Record<string, unknown>) ?? {}
        await prisma.dailyDigest.update({
          where: { id: digest.id },
          data: {
            details: { ...existingDetails, newsArticle: article } as unknown as Prisma.InputJsonValue,
          },
        })
      }
    } catch {
      // Caching failure is non-critical
    }

    return NextResponse.json(article)
  } catch (error) {
    console.error("[Pippen] Daily news article generation failed:", error)
    return NextResponse.json(
      { error: "Failed to generate daily news article" },
      { status: 500 }
    )
  }
}
