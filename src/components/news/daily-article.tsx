"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Tag,
  Calendar,
  Newspaper,
} from "lucide-react"
import type { DailyNewsArticle } from "@/lib/pippen/daily-news-article"

const GOLD = "var(--c-gold, #C49A3C)"

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// ---- Practice Area Badge ----

const AREA_COLORS: Record<string, string> = {
  OIC: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IA: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  PENALTY: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  INNOCENT_SPOUSE: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  CNC: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  TFRP: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  CDP: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  AUDIT: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  COLLECTION: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  APPEALS: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  LITIGATION: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  GENERAL: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
}

function PracticeAreaBadge({ area }: { area: string }) {
  const colorClass = AREA_COLORS[area] ?? AREA_COLORS.GENERAL
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      <Tag className="h-3 w-3" />
      {area.replace(/_/g, " ")}
    </span>
  )
}

// ---- Markdown Renderer (simple) ----

function renderMarkdown(md: string): string {
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-8 mb-3">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Unordered list items
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="my-2 space-y-1">$&</ul>')
    // Line breaks for paragraphs
    .replace(/\n\n/g, '</p><p class="my-3 leading-relaxed">')
    // Em dashes
    .replace(/ -- /g, " \u2014 ")

  return `<p class="my-3 leading-relaxed">${html}</p>`
}

// ---- Loading Skeleton ----

function ArticleSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-2 pt-4">
        <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-4/6 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  )
}

// ---- Empty State ----

function EmptyState({ date }: { date: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Newspaper className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
      <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400">
        No article for {formatDate(date)}
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
        No tax authority developments were published on this date.
      </p>
    </div>
  )
}

// ---- Main Component ----

export function DailyArticleView() {
  const [date, setDate] = useState(() => toDateString(new Date()))
  const [article, setArticle] = useState<DailyNewsArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchArticle = useCallback(async (d: string) => {
    setLoading(true)
    setError(null)
    setArticle(null)

    try {
      const res = await fetch(`/api/pippen/daily-news?date=${d}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: DailyNewsArticle = await res.json()
      setArticle(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load article")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchArticle(date)
  }, [date, fetchArticle])

  const goToPreviousDay = () => {
    const d = new Date(date + "T00:00:00")
    d.setDate(d.getDate() - 1)
    setDate(toDateString(d))
  }

  const goToNextDay = () => {
    const d = new Date(date + "T00:00:00")
    d.setDate(d.getDate() + 1)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d <= tomorrow) {
      setDate(toDateString(d))
    }
  }

  const goToToday = () => {
    setDate(toDateString(new Date()))
  }

  const isToday = date === toDateString(new Date())

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: GOLD }}>
          Daily News
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tax authority developments briefing for practitioners
        </p>
      </div>

      {/* Date Navigation */}
      <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={goToPreviousDay}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium">{formatDate(date)}</span>
          {!isToday && (
            <button
              onClick={goToToday}
              className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={goToNextDay}
          disabled={isToday}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-gray-700"
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {loading && <ArticleSkeleton />}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && article && article.headline === "No New Developments Today" && (
          <EmptyState date={date} />
        )}

        {!loading && !error && article && article.headline !== "No New Developments Today" && (
          <div>
            {/* Headline */}
            <h2 className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100">
              {article.headline}
            </h2>

            {/* Practice area tags */}
            {article.practiceAreas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {article.practiceAreas.map((area) => (
                  <PracticeAreaBadge key={area} area={area} />
                ))}
              </div>
            )}

            {/* Body */}
            <div
              className="prose prose-sm mt-6 max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
            />

            {/* Sources */}
            {article.sources.length > 0 && (
              <div className="mt-8 border-t border-gray-200 pt-4 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  Sources
                </h4>
                <ul className="mt-2 space-y-1">
                  {article.sources.map((source, i) => (
                    <li key={i} className="text-sm">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {source.title}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
