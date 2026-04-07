"use client"

import { useEffect, useState, useCallback } from "react"
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
} from "lucide-react"
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

  const [retrying, setRetrying] = useState(false)

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
      {session.output && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Research Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="junebug-prose prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(session.output) }}
            />
          </CardContent>
        </Card>
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
 * For production, swap with a full markdown library.
 */
function renderMarkdownToHtml(md: string): string {
  const lines = md.split("\n")
  const htmlParts: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Close list if needed
    if (inList && !trimmed.startsWith("- ") && !trimmed.startsWith("* ")) {
      htmlParts.push("</ul>")
      inList = false
    }

    if (!trimmed) {
      htmlParts.push("")
      continue
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      htmlParts.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`)
      continue
    }
    if (trimmed.startsWith("## ")) {
      htmlParts.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`)
      continue
    }
    if (trimmed.startsWith("# ")) {
      htmlParts.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`)
      continue
    }

    // List items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        htmlParts.push("<ul>")
        inList = true
      }
      htmlParts.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`)
      continue
    }

    // Paragraph
    htmlParts.push(`<p>${inlineFormat(trimmed)}</p>`)
  }

  if (inList) htmlParts.push("</ul>")
  return htmlParts.join("\n")
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
}
