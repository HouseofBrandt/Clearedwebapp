"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Calendar,
  Newspaper,
  ArrowRight,
  BookOpen,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DailyNewsArticle } from "@/lib/pippen/daily-news-article"

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

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---- Practice Area Badge Variants ----

const AREA_VARIANT: Record<string, "info" | "success" | "destructive" | "warning" | "teal" | "default"> = {
  OIC: "info",
  IA: "success",
  PENALTY: "destructive",
  INNOCENT_SPOUSE: "teal",
  CNC: "warning",
  TFRP: "warning",
  CDP: "info",
  AUDIT: "destructive",
  COLLECTION: "warning",
  APPEALS: "teal",
  LITIGATION: "destructive",
  ERC: "success",
  UNFILED: "warning",
  GENERAL: "default",
}

// ---- Markdown Renderer ----

function renderMarkdown(md: string): string {
  let html = md
    .replace(/^### (.+)$/gm, '<h3 class="text-[15px] font-semibold mt-8 mb-3" style="color: var(--c-gray-900); letter-spacing: -0.01em">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-[17px] font-semibold mt-10 mb-4" style="color: var(--c-gray-900); letter-spacing: -0.015em">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-5 list-disc" style="color: var(--c-gray-700)">$1</li>')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="my-3 space-y-1.5">$&</ul>')
    .replace(/\n\n/g, '</p><p class="my-4 leading-[1.7]" style="color: var(--c-gray-600)">')
    .replace(/ -- /g, " \u2014 ")

  return `<p class="my-4 leading-[1.7]" style="color: var(--c-gray-600)">${html}</p>`
}

// ---- Loading Skeleton ----

function ArticleSkeleton() {
  return (
    <div className="page-enter">
      <Card>
        <CardContent className="p-8">
          <div className="animate-pulse space-y-6">
            {/* Headline skeleton */}
            <div className="space-y-3">
              <div
                className="h-7 w-4/5 rounded-[8px]"
                style={{ background: "var(--c-gray-100)" }}
              />
              <div
                className="h-7 w-2/5 rounded-[8px]"
                style={{ background: "var(--c-gray-100)" }}
              />
            </div>
            {/* Badges skeleton */}
            <div className="flex gap-2">
              <div
                className="h-6 w-16 rounded-full"
                style={{ background: "var(--c-gray-50)" }}
              />
              <div
                className="h-6 w-20 rounded-full"
                style={{ background: "var(--c-gray-50)" }}
              />
              <div
                className="h-6 w-24 rounded-full"
                style={{ background: "var(--c-gray-50)" }}
              />
            </div>
            {/* Divider */}
            <div
              className="h-px w-full"
              style={{ background: "var(--c-gray-100)" }}
            />
            {/* Body skeleton */}
            <div className="space-y-3">
              {[100, 100, 85, 100, 90, 70, 100, 100, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-4 rounded-[6px]"
                  style={{
                    width: `${w}%`,
                    background: "var(--c-gray-50)",
                  }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Empty State ----

function EmptyState({ date }: { date: string }) {
  return (
    <Card>
      <CardContent className="p-8">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div
            className="mb-5 flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: "var(--c-gray-50)",
              border: "1px solid var(--c-gray-100)",
            }}
          >
            <Newspaper
              className="h-6 w-6"
              style={{ color: "var(--c-gray-300)" }}
            />
          </div>
          <h3
            className="text-[15px] font-semibold"
            style={{ color: "var(--c-gray-700)" }}
          >
            No developments for {formatDateShort(date)}
          </h3>
          <p
            className="mt-2 max-w-[280px] text-[13px] leading-relaxed"
            style={{ color: "var(--c-gray-400)" }}
          >
            No tax authority developments were published on this date. Try navigating to a different day.
          </p>
        </div>
      </CardContent>
    </Card>
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
    <div className="page-enter mx-auto max-w-3xl" style={{ padding: "var(--space-8) var(--space-6) var(--space-12)" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "var(--space-8)" }}>
        <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-2)" }}>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{
              background: "var(--c-teal-soft)",
              border: "1px solid rgba(42,143,168,0.12)",
            }}
          >
            <BookOpen className="h-[18px] w-[18px]" style={{ color: "var(--c-teal)" }} />
          </div>
          <div>
            <h1 className="text-display text-display-md">Daily News</h1>
            <p className="text-overline" style={{ marginTop: "2px" }}>
              Tax authority developments
            </p>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div
        className="flex items-center justify-between rounded-[12px]"
        style={{
          marginBottom: "var(--space-6)",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--surface-primary)",
          border: "1px solid var(--c-gray-100)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousDay}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4" style={{ color: "var(--c-gray-300)" }} />
          <span
            className="text-[13.5px] font-medium"
            style={{ color: "var(--c-gray-700)" }}
          >
            {formatDate(date)}
          </span>
          {!isToday && (
            <Button variant="teal" size="sm" onClick={goToToday}>
              Today
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextDay}
          disabled={isToday}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      {loading && <ArticleSkeleton />}

      {error && (
        <Card>
          <CardContent className="p-6">
            <div
              className="flex items-start gap-3 rounded-[10px] p-4"
              style={{
                background: "var(--c-danger-soft)",
                border: "1px solid rgba(217,48,37,0.1)",
              }}
            >
              <div
                className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: "var(--c-danger)" }}
              />
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--c-danger)" }}
              >
                {error}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && article && article.headline === "No New Developments Today" && (
        <EmptyState date={date} />
      )}

      {!loading && !error && article && article.headline !== "No New Developments Today" && (
        <div className="animate-fade-in">
          <Card>
            <CardContent className="p-8">
              {/* Headline */}
              <h2
                className="text-display text-display-md"
                style={{
                  lineHeight: 1.25,
                  maxWidth: "90%",
                }}
              >
                {article.headline}
              </h2>

              {/* Practice area badges */}
              {article.practiceAreas.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {article.practiceAreas.map((area) => (
                    <Badge
                      key={area}
                      variant={AREA_VARIANT[area] ?? "default"}
                      dot
                    >
                      {area.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Divider */}
              <div
                className="my-6"
                style={{
                  height: "1px",
                  background: "linear-gradient(90deg, var(--c-gray-100) 0%, transparent 100%)",
                }}
              />

              {/* Body */}
              <div
                className="article-body max-w-none text-[14px]"
                style={{ lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
              />

              {/* Sources */}
              {article.sources.length > 0 && (
                <div
                  className="mt-10 rounded-[10px]"
                  style={{
                    padding: "var(--space-5)",
                    background: "var(--c-snow)",
                    border: "1px solid var(--c-gray-100)",
                  }}
                >
                  <p className="text-overline" style={{ marginBottom: "var(--space-3)" }}>
                    Sources
                  </p>
                  <ul className="space-y-2">
                    {article.sources.map((source, i) => (
                      <li key={i}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors duration-150"
                          style={{ color: "var(--c-teal)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--c-teal-bright)"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--c-teal)"
                          }}
                        >
                          {source.title}
                          <ExternalLink className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
