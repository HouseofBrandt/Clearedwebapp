"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { Plus, Search, BookOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* ── Types ────────────────────────────────────────────────────────── */

export type ResearchMode =
  | "QUICK_ANSWER"
  | "ISSUE_BRIEF"
  | "RESEARCH_MEMORANDUM"
  | "AUTHORITY_SURVEY"
  | "COUNTERARGUMENT_PREP"

export type ResearchStatus =
  | "INTAKE"
  | "PRESCOPING"
  | "RETRIEVING"
  | "COMPOSING"
  | "EVALUATING"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED"

export interface ResearchSession {
  id: string
  mode: ResearchMode
  question: string
  status: ResearchStatus
  caseId?: string | null
  caseNumber?: string | null
  createdAt: string
  updatedAt: string
  creatorName?: string
}

/* ── Mode display config ──────────────────────────────────────────── */

const MODE_CONFIG: Record<
  ResearchMode,
  { label: string; color: string; bg: string }
> = {
  QUICK_ANSWER: {
    label: "Quick Answer",
    color: "text-teal-700",
    bg: "bg-teal-50 border-teal-200",
  },
  ISSUE_BRIEF: {
    label: "Issue Brief",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  RESEARCH_MEMORANDUM: {
    label: "Research Memo",
    color: "text-[#1e3a5f]",
    bg: "bg-[#eef2f7] border-[#c5d3e3]",
  },
  AUTHORITY_SURVEY: {
    label: "Authority Survey",
    color: "text-slate-700",
    bg: "bg-slate-50 border-slate-200",
  },
  COUNTERARGUMENT_PREP: {
    label: "Counterargument",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
  },
}

const STATUS_CONFIG: Record<
  ResearchStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" | "teal" | "destructive" | "outline" }
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

/* ── Component ────────────────────────────────────────────────────── */

export function ResearchHome() {
  const [sessions, setSessions] = useState<ResearchSession[]>([])
  const [loading, setLoading] = useState(true)
  const [modeFilter, setModeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/research/sessions")
        if (res.ok) {
          const data = await res.json()
          setSessions(data.sessions ?? data ?? [])
        }
      } catch {
        // silently fail — empty list is fine
      } finally {
        setLoading(false)
      }
    }
    fetchSessions()
  }, [])

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (modeFilter !== "all" && s.mode !== modeFilter) return false
      if (statusFilter !== "all" && s.status !== statusFilter) return false
      if (
        search &&
        !s.question.toLowerCase().includes(search.toLowerCase()) &&
        !(s.caseNumber ?? "").toLowerCase().includes(search.toLowerCase())
      )
        return false
      return true
    })
  }, [sessions, modeFilter, statusFilter, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Micanopy Research Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Powered by Banjo
          </p>
        </div>
        <Button asChild>
          <Link href="/research/new">
            <Plus className="mr-2 h-4 w-4" />
            New Research
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search questions or case numbers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Modes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="QUICK_ANSWER">Quick Answer</SelectItem>
            <SelectItem value="ISSUE_BRIEF">Issue Brief</SelectItem>
            <SelectItem value="RESEARCH_MEMORANDUM">Research Memo</SelectItem>
            <SelectItem value="AUTHORITY_SURVEY">Authority Survey</SelectItem>
            <SelectItem value="COUNTERARGUMENT_PREP">Counterargument</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="INTAKE">Intake</SelectItem>
            <SelectItem value="PRESCOPING">Pre-scoping</SelectItem>
            <SelectItem value="RETRIEVING">Retrieving</SelectItem>
            <SelectItem value="COMPOSING">Composing</SelectItem>
            <SelectItem value="EVALUATING">Evaluating</SelectItem>
            <SelectItem value="READY_FOR_REVIEW">Ready for Review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        sessions.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No research sessions yet"
            description="Start your first research to get Banjo digging into the law."
            actionLabel="New Research"
            actionHref="/research/new"
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No matching sessions"
            description="Try adjusting your filters or search term."
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((session) => {
            const mode = MODE_CONFIG[session.mode]
            const status = STATUS_CONFIG[session.status]
            return (
              <Link key={session.id} href={`/research/${session.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${mode.bg} ${mode.color}`}
                      >
                        {mode.label}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    <p className="text-sm font-medium leading-snug line-clamp-2">
                      {session.question}
                    </p>

                    {session.caseNumber && (
                      <p className="text-xs text-muted-foreground">
                        Case: {session.caseNumber}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                      <span>
                        {new Date(session.createdAt).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </span>
                      {session.creatorName && <span>{session.creatorName}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
