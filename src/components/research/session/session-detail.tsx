"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Zap,
  ClipboardList,
  ScrollText,
  BarChart3,
  Swords,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  LinkIcon,
  RefreshCw,
  Copy,
  Check,
  Printer,
  MessageSquare,
  FileDown,
} from "lucide-react"
import { marked } from "marked"
import DOMPurify from "dompurify"
import { highlightCitations, elevatePractitionerNotes, injectHeadingIds, type TOCItem } from "@/lib/research/citations"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { LucideIcon } from "lucide-react"

/* ── Types ────────────────────────────────────────────────────────── */

type ResearchMode =
  | "QUICK_ANSWER"
  | "ISSUE_BRIEF"
  | "RESEARCH_MEMORANDUM"
  | "AUTHORITY_SURVEY"
  | "COUNTERARGUMENT_PREP"

type ResearchStatus =
  | "INTAKE"
  | "PRESCOPING"
  | "RETRIEVING"
  | "COMPOSING"
  | "EVALUATING"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED"

interface ResearchSessionDetail {
  id: string
  mode: ResearchMode
  questionText: string
  status: ResearchStatus
  caseId?: string | null
  case?: { id: string; tabsNumber: string; clientName: string; caseType: string } | null
  output?: string | null
  executiveSummary?: string | null
  sources?: Array<{ id: string; title: string; url?: string | null }> | null
  createdAt: string
  updatedAt: string
  retrievalStartedAt?: string | null
  completedAt?: string | null
  createdBy?: { id: string; name: string; email: string } | null
}

/* ── Config ───────────────────────────────────────────────────────── */

const MODE_CONFIG: Record<
  ResearchMode,
  { label: string; icon: LucideIcon; color: string; bg: string; badgeBg: string }
> = {
  QUICK_ANSWER: {
    label: "Quick Answer",
    icon: Zap,
    color: "text-teal-700",
    bg: "bg-teal-50",
    badgeBg: "bg-teal-50 border-teal-200 text-teal-700",
  },
  ISSUE_BRIEF: {
    label: "Issue Brief",
    icon: ClipboardList,
    color: "text-amber-700",
    bg: "bg-amber-50",
    badgeBg: "bg-amber-50 border-amber-200 text-amber-700",
  },
  RESEARCH_MEMORANDUM: {
    label: "Research Memo",
    icon: ScrollText,
    color: "text-[#1e3a5f]",
    bg: "bg-[#eef2f7]",
    badgeBg: "bg-[#eef2f7] border-[#c5d3e3] text-[#1e3a5f]",
  },
  AUTHORITY_SURVEY: {
    label: "Authority Survey",
    icon: BarChart3,
    color: "text-slate-700",
    bg: "bg-slate-50",
    badgeBg: "bg-slate-50 border-slate-200 text-slate-700",
  },
  COUNTERARGUMENT_PREP: {
    label: "Counterargument",
    icon: Swords,
    color: "text-red-700",
    bg: "bg-red-50",
    badgeBg: "bg-red-50 border-red-200 text-red-700",
  },
}

const STATUS_CONFIG: Record<
  ResearchStatus,
  {
    label: string
    variant: "default" | "secondary" | "success" | "warning" | "info" | "teal" | "destructive" | "outline"
  }
> = {
  INTAKE: { label: "Intake", variant: "default" },
  PRESCOPING: { label: "Pre-scoping", variant: "info" },
  RETRIEVING: { label: "Retrieving", variant: "warning" },
  COMPOSING: { label: "Composing", variant: "warning" },
  EVALUATING: { label: "Evaluating", variant: "info" },
  READY_FOR_REVIEW: { label: "Ready for Review", variant: "info" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
}

const PROGRESS_MESSAGES = [
  "Parsing your question...",
  "Searching the Internal Revenue Code...",
  "Reviewing Treasury Regulations...",
  "Analyzing relevant case law...",
  "Checking Revenue Rulings and Procedures...",
  "Cross-referencing IRS guidance...",
  "Structuring the analysis...",
  "Drafting output...",
  "Finalizing citations...",
  "Almost there...",
]

/* ── Component ────────────────────────────────────────────────────── */

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<ResearchSessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/sessions/${sessionId}`)
      if (!res.ok) {
        setError("Failed to load research session.")
        return
      }
      const data = await res.json()
      setSession(data)
    } catch {
      setError("Failed to load research session.")
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  /* Poll while processing */
  useEffect(() => {
    if (!session) return
    if (session.status !== "PRESCOPING" && session.status !== "RETRIEVING" && session.status !== "COMPOSING" && session.status !== "EVALUATING") return

    const interval = setInterval(() => {
      fetchSession()
    }, 5000)

    return () => clearInterval(interval)
  }, [session, fetchSession])

  /* ── Actions ──────────────────────────────────────────────────── */

  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeHeading, setActiveHeading] = useState("")
  const contentRef = useRef<HTMLDivElement>(null)

  // Process markdown output into styled HTML with citations and TOC
  const processedOutput = useMemo(() => {
    if (!session?.output) return null
    const rawHtml = marked.parse(session.output, { breaks: true, gfm: true }) as string
    const cleanHtml = typeof window !== "undefined" ? DOMPurify.sanitize(rawHtml, { ADD_ATTR: ["id"] }) : rawHtml
    const { html: withIds, headings } = injectHeadingIds(cleanHtml)
    const withCitations = highlightCitations(withIds)
    const finalHtml = elevatePractitionerNotes(withCitations)
    return { html: finalHtml, headings }
  }, [session?.output])

  // TOC scroll tracking via IntersectionObserver
  useEffect(() => {
    if (!processedOutput?.headings.length || !contentRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveHeading(entry.target.id)
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    )
    const headingEls = contentRef.current.querySelectorAll("h2[id]")
    headingEls.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [processedOutput])

  const handleCopyMarkdown = useCallback(() => {
    if (!session?.output) return
    navigator.clipboard.writeText(session.output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [session?.output])

  const [memoGenerating, setMemoGenerating] = useState(false)
  const [memoError, setMemoError] = useState<string | null>(null)

  const handleGenerateMemo = useCallback(async () => {
    if (!session || memoGenerating) return
    setMemoError(null)
    setMemoGenerating(true)
    try {
      const res = await fetch(`/api/research/sessions/${session.id}/memo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}", // no overrides — renderer uses placeholders / session defaults
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail?.error || `Memo generation failed (${res.status})`)
      }
      const blob = await res.blob()
      const contentDisposition = res.headers.get("Content-Disposition") || ""
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] || `memo-${session.id}.docx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setMemoError(err?.message || "Could not generate memo")
    } finally {
      setMemoGenerating(false)
    }
  }, [session, memoGenerating])

  const handleAction = async (action: "APPROVE" | "REJECT_MANUAL") => {
    if (actionLoading || !session) return
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/research/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        await fetchSession()
      } else {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error || `Review failed (${res.status})`)
      }
    } catch {
      setActionError("Failed to submit review. Please try again.")
    } finally {
      setActionLoading(false)
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Button variant="outline" asChild>
          <Link href="/research">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Research
          </Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <XCircle className="mb-3 h-10 w-10 text-destructive" />
            <p className="text-sm font-medium">
              {error ?? "Session not found."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The research session may have been deleted or you may not have
              access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const modeConfig = MODE_CONFIG[session.mode]
  const statusConfig = STATUS_CONFIG[session.status]
  const ModeIcon = modeConfig.icon
  const isProcessing =
    session.status === "PRESCOPING" || session.status === "RETRIEVING" || session.status === "COMPOSING" || session.status === "EVALUATING"
  const isReviewable = session.status === "READY_FOR_REVIEW"

  // Detect stuck sessions (processing for >5 minutes)
  const isStuck = isProcessing && session?.createdAt &&
    (Date.now() - new Date(session.createdAt).getTime()) > 5 * 60 * 1000

  async function handleRetry() {
    if (!session) return
    setRetrying(true)
    try {
      // Reset to INTAKE then relaunch
      await fetch(`/api/research/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INTAKE" }),
      })
      await fetch(`/api/research/sessions/${session.id}/launch`, { method: "POST" })
      // Polling will pick up the new status
    } catch {
      // Ignore — polling will show current state
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button variant="outline" size="sm" asChild>
        <Link href="/research">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Research
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${modeConfig.bg}`}
          >
            <ModeIcon className={`h-5 w-5 ${modeConfig.color}`} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {modeConfig.label}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
              {session.questionText}
            </p>
          </div>
        </div>
        <Badge variant={statusConfig.variant} className="shrink-0">
          {statusConfig.label}
        </Badge>
      </div>

      {/* Metadata */}
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem
            icon={Clock}
            label="Created"
            value={formatDate(session.createdAt)}
          />
          {session.retrievalStartedAt && (
            <MetaItem
              icon={Zap}
              label="Launched"
              value={formatDate(session.retrievalStartedAt)}
            />
          )}
          {session.completedAt && (
            <MetaItem
              icon={CheckCircle2}
              label="Completed"
              value={formatDate(session.completedAt)}
            />
          )}
          {session.case?.tabsNumber && (
            <MetaItem
              icon={LinkIcon}
              label="Case"
              value={session.case.tabsNumber}
            />
          )}
          {session.sources && session.sources.length > 0 && (
            <MetaItem
              icon={FileText}
              label="Sources Cited"
              value={String(session.sources.length)}
            />
          )}
          {session.createdBy?.name && (
            <MetaItem
              icon={FileText}
              label="Created By"
              value={session.createdBy.name}
            />
          )}
        </CardContent>
      </Card>

      {/* Processing state */}
      {isProcessing && <ProcessingIndicator />}

      {/* Stuck session retry */}
      {isStuck && (
        <div className="rounded-[12px] px-5 py-4 flex items-center justify-between" style={{ background: "var(--c-warning-soft)", border: "1px solid rgba(217,119,6,0.15)" }}>
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--c-warning)" }}>Research appears to be stuck</p>
            <p className="text-[12px]" style={{ color: "var(--c-gray-500)" }}>This session has been processing for over 5 minutes.</p>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            style={{ background: "var(--c-warning)" }}
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}

      {/* Output */}
      {session.output && processedOutput && (
        <div className="research-output space-y-5">
          {/* Executive summary card */}
          {session.executiveSummary && (
            <div
              className="rounded-2xl px-6 py-5"
              style={{
                background: "linear-gradient(135deg, var(--c-navy-950) 0%, #1C2D44 100%)",
                boxShadow: "var(--shadow-2)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">Bottom Line</span>
              </div>
              <p className="text-[15px] leading-relaxed text-white/90" style={{ fontFamily: "var(--font-body)" }}>
                {session.executiveSummary}
              </p>
            </div>
          )}

          {/* Query context bar */}
          <div className="research-query-bar flex items-start gap-3">
            <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--c-gray-400)" }} />
            <div>
              <p className="text-overline mb-1">Research Question</p>
              <p className="text-[13px]" style={{ color: "var(--c-gray-600)", lineHeight: 1.6, fontStyle: "italic" }}>
                {session.questionText}
              </p>
            </div>
          </div>

          {/* Sources bar */}
          {session.sources && session.sources.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <LinkIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--c-gray-300)" }} />
              <div className="flex items-center gap-2 flex-wrap">
                {session.sources.slice(0, 8).map((s, i) => (
                  <a
                    key={i}
                    href={s.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors hover:bg-[var(--c-gray-100)]"
                    style={{ background: "var(--c-gray-50)", color: "var(--c-gray-500)", border: "1px solid var(--c-gray-100)" }}
                    title={s.title}
                  >
                    {s.title.length > 35 ? s.title.slice(0, 35) + "..." : s.title}
                  </a>
                ))}
                {session.sources.length > 8 && (
                  <span className="text-[10.5px]" style={{ color: "var(--c-gray-300)" }}>+{session.sources.length - 8} more</span>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="research-actions-bar flex flex-col items-end gap-1 no-print">
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyMarkdown} className="text-xs">
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" style={{ color: "var(--c-success)" }} /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs">
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
              {isReviewable && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleGenerateMemo}
                  disabled={memoGenerating}
                  className="text-xs"
                  title="Produce a formal Times New Roman .docx memorandum from this research"
                >
                  {memoGenerating ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {memoGenerating ? "Generating memo\u2026" : "Generate Memo"}
                </Button>
              )}
            </div>
            {memoError && (
              <p className="text-[11px]" style={{ color: "var(--c-danger, #b91c1c)" }}>
                {memoError}
              </p>
            )}
          </div>

          {/* Two-column layout: TOC + body */}
          <div className="research-layout flex gap-8">
            {/* Sticky TOC sidebar */}
            {processedOutput.headings.length > 1 && (
              <nav className="research-toc hidden lg:block" aria-label="Table of contents">
                <p className="text-overline mb-3">On This Page</p>
                <ul className="space-y-0.5">
                  {processedOutput.headings.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" })
                        }}
                        className="block py-1.5 pl-3 text-[12px] border-l-2 transition-all duration-150"
                        style={{
                          borderColor: activeHeading === h.id ? "var(--c-teal)" : "transparent",
                          color: activeHeading === h.id ? "var(--c-teal)" : "var(--c-gray-400)",
                          fontWeight: activeHeading === h.id ? 600 : 400,
                        }}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {/* Research body */}
            <div className="min-w-0 flex-1">
              <div
                ref={contentRef}
                className="research-prose"
                dangerouslySetInnerHTML={{ __html: processedOutput.html }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Review actions */}
      {isReviewable && (
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium">Review Required</p>
              <p className="text-xs text-muted-foreground">
                This output requires practitioner review before it can be used.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => handleAction("REJECT_MANUAL")}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Reject
              </Button>
              <Button
                onClick={() => handleAction("APPROVE")}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review error */}
      {actionError && (
        <div className="rounded-[12px] px-5 py-3 text-[13px]" style={{ background: "var(--c-danger-soft)", border: "1px solid rgba(217,48,37,0.1)", color: "var(--c-danger)" }}>
          {actionError}
        </div>
      )}

      {/* Approved / Rejected state */}
      {session.status === "APPROVED" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-sm font-medium text-green-800">
            This research has been approved by a practitioner.
          </p>
        </div>
      )}

      {session.status === "REJECTED" && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <XCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm font-medium text-red-800">
            This research was rejected. You may start a new session.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────── */

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  )
}

function ProcessingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0)
  const [progress, setProgress] = useState(5)

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex((prev) =>
        prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
      )
    }, 4000)

    const progressTimer = setInterval(() => {
      setProgress((prev) => Math.min(prev + 2, 90))
    }, 2000)

    return () => {
      clearInterval(msgTimer)
      clearInterval(progressTimer)
    }
  }, [])

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-10 text-center">
        <div className="relative mb-4">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
        <p className="text-sm font-medium">Banjo is working on it...</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {PROGRESS_MESSAGES[msgIndex]}
        </p>
        <div className="mt-4 w-full max-w-xs">
          <Progress value={progress} size="sm" />
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Utilities ────────────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * Minimal markdown-to-HTML renderer for research output.
 * Handles headings, bold, italic, code, lists, and paragraphs.
 * Markdown rendering now handled by `marked` library with citation post-processing.
 * See processedOutput useMemo in SessionDetail component.
 */
