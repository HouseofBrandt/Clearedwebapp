"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Microscope, ExternalLink } from "lucide-react"

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  QUICK_ANSWER: { label: "Quick Answer", color: "bg-teal-100 text-teal-800" },
  ISSUE_BRIEF: { label: "Issue Brief", color: "bg-amber-100 text-amber-800" },
  RESEARCH_MEMORANDUM: { label: "Research Memo", color: "bg-blue-100 text-blue-900" },
  AUTHORITY_SURVEY: { label: "Authority Survey", color: "bg-slate-100 text-slate-800" },
  COUNTERARGUMENT_PREP: { label: "Counterargument", color: "bg-red-100 text-red-800" },
}

const STATUS_LABELS: Record<string, { label: string; variant: string }> = {
  INTAKE: { label: "Draft", variant: "outline" },
  RETRIEVING: { label: "Researching", variant: "default" },
  COMPOSING: { label: "Composing", variant: "default" },
  EVALUATING: { label: "Evaluating", variant: "default" },
  READY_FOR_REVIEW: { label: "Ready for Review", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  ARCHIVED: { label: "Archived", variant: "outline" },
}

export function CaseResearchList({ caseId }: { caseId: string }) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/research/sessions?caseId=${caseId}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [caseId])

  if (loading) {
    return <p className="text-xs text-muted-foreground py-8 text-center">Loading research sessions...</p>
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Microscope className="h-8 w-8 text-c-gray-300" />
        <p className="text-sm text-muted-foreground">No research sessions for this case yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((s: any) => {
        const mode = MODE_LABELS[s.mode] || { label: s.mode, color: "bg-gray-100 text-gray-800" }
        const status = STATUS_LABELS[s.status] || { label: s.status, variant: "outline" }
        return (
          <Link key={s.id} href={`/research/${s.id}`} className="block">
            <div className="flex items-start gap-3 p-3 rounded-lg border hover:border-c-teal/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${mode.color}`}>{mode.label}</span>
                  <Badge variant={status.variant as any} className="text-[10px]">{status.label}</Badge>
                </div>
                <p className="text-[13px] text-c-gray-800 line-clamp-2">{s.questionText}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(s.createdAt).toLocaleDateString()}
                  {s.citationCount > 0 && ` · ${s.citationCount} citations`}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-c-gray-300 shrink-0 mt-1" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
