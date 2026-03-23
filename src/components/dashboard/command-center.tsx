"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/date-utils"
import { CASE_TYPE_LABELS, DEADLINE_PRIORITY_DOTS } from "@/types"
import { ArrowRight, AlertTriangle, Clock, CheckCircle, FileText, Calendar as CalendarIcon } from "lucide-react"
import type { CommandCenterData, ActionItem, RiskRankedCase } from "@/lib/dashboard/command-center"

// ═══════════════════════════════════════════════════
// Risk heat indicator
// ═══════════════════════════════════════════════════

function RiskDot({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
  const color =
    score >= 76 ? "bg-red-500" :
    score >= 51 ? "bg-orange-500" :
    score >= 26 ? "bg-amber-400" :
    "bg-emerald-500"
  const sizeClass = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"
  return <div className={`${sizeClass} rounded-full shrink-0 ${color}`} />
}

function RiskBadge({ score }: { score: number }) {
  const color =
    score >= 76 ? "bg-red-100 text-red-800" :
    score >= 51 ? "bg-orange-100 text-orange-800" :
    score >= 26 ? "bg-amber-100 text-amber-800" :
    "bg-emerald-100 text-emerald-800"
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{score}</span>
}

// ═══════════════════════════════════════════════════
// Action Queue Item
// ═══════════════════════════════════════════════════

function ActionQueueItem({ item }: { item: ActionItem }) {
  const borderColor =
    item.priority === "critical" ? "border-l-red-500" :
    item.priority === "high" ? "border-l-amber-400" :
    "border-l-gray-300"

  return (
    <Link href={`/cases/${item.caseId}`}>
      <div className={`border-l-[3px] ${borderColor} rounded-r-md bg-white px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer`}>
        <div className="flex items-center gap-2 mb-1">
          <RiskDot score={item.riskScore} />
          <span className="text-xs font-semibold text-foreground">{item.caseIdentifier}</span>
          <span className="text-xs text-muted-foreground">{item.clientName}</span>
        </div>
        <p className="text-sm font-medium text-foreground leading-snug">{item.action}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.reason}</p>
      </div>
    </Link>
  )
}

// ═══════════════════════════════════════════════════
// Risk-Ranked Case Row
// ═══════════════════════════════════════════════════

function CaseRow({ c }: { c: RiskRankedCase }) {
  return (
    <Link href={`/cases/${c.id}`}>
      <div className="flex items-start gap-3 py-2.5 px-2 rounded-md hover:bg-gray-50 transition-colors cursor-pointer">
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <RiskDot score={c.riskScore} size="md" />
          <RiskBadge score={c.riskScore} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{c.tabsNumber}</span>
            <span className="text-xs text-muted-foreground truncate">{c.clientName}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              {CASE_TYPE_LABELS[c.caseType as keyof typeof CASE_TYPE_LABELS] || c.caseType}
            </Badge>
            {c.isStale && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 shrink-0">
                stale
              </Badge>
            )}
          </div>
          {c.digest && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.digest}</p>
          )}
          {c.topNextStep && (
            <p className="text-xs font-medium text-foreground mt-1 flex items-center gap-1">
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="line-clamp-1">{c.topNextStep}</span>
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

// ═══════════════════════════════════════════════════
// Main Command Center
// ═══════════════════════════════════════════════════

export function CommandCenter({ data, userName }: { data: CommandCenterData; userName: string }) {
  const now = new Date()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          {data.stats.totalActive} active case{data.stats.totalActive !== 1 ? "s" : ""} &middot;{" "}
          {data.pendingReviews} pending review{data.pendingReviews !== 1 ? "s" : ""} &middot;{" "}
          {data.stats.staleCount > 0 && <span className="text-amber-600">{data.stats.staleCount} stale</span>}
          {data.stats.staleCount === 0 && "all active"}
        </p>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: Priority Action Queue (40%) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Priority Actions</h2>
            <span className="text-xs text-muted-foreground">{data.actionQueue.length} items</span>
          </div>
          {data.actionQueue.length === 0 ? (
            <div className="rounded-lg border bg-emerald-50 p-4 text-center">
              <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-800">All clear</p>
              <p className="text-xs text-emerald-600 mt-0.5">No urgent actions right now</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {data.actionQueue.map((item, i) => (
                <ActionQueueItem key={`${item.caseId}-${i}`} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Center: Cases at Risk (35%) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Cases by Risk</h2>
            <Link href="/cases" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
              All cases <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.riskRankedCases.length === 0 ? (
            <div className="rounded-lg border p-4 text-center">
              <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No active cases</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.riskRankedCases.slice(0, 10).map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>

        {/* Right: Sidebar (25%) */}
        <div className="lg:col-span-3 space-y-5">
          {/* Pending Reviews */}
          <Link href="/review">
            <div className="rounded-lg border px-3 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review Queue</span>
                <AlertTriangle className={`h-4 w-4 ${data.pendingReviews > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{data.pendingReviews}</p>
              <p className="text-xs text-muted-foreground">deliverable{data.pendingReviews !== 1 ? "s" : ""} awaiting review</p>
            </div>
          </Link>

          {/* Upcoming Deadlines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deadlines (7 days)</span>
              <Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
                <CalendarIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
            {data.deadlines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No upcoming deadlines</p>
            ) : (
              <div className="space-y-1.5">
                {data.deadlines.map((d: any) => {
                  const due = new Date(d.dueDate)
                  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000)
                  const isOverdue = diffDays < 0
                  return (
                    <Link key={d.id} href={`/cases/${d.case?.id || d.caseId}`}>
                      <div className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-50 transition-colors cursor-pointer">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          isOverdue ? "bg-red-500" : diffDays <= 3 ? "bg-amber-400" : "bg-emerald-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{d.title}</p>
                          <p className="text-[10px] text-muted-foreground">{d.case?.tabsNumber}</p>
                        </div>
                        <span className={`text-[10px] font-semibold shrink-0 ${
                          isOverdue ? "text-red-600" : diffDays <= 3 ? "text-amber-600" : "text-muted-foreground"
                        }`}>
                          {isOverdue ? "OVERDUE" : diffDays === 0 ? "Today" : `${diffDays}d`}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Firm Stats */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Firm Stats</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-lg font-bold">{data.stats.totalActive}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-lg font-bold">{data.stats.resolvedThisMonth}</p>
                <p className="text-[10px] text-muted-foreground">Resolved (mo)</p>
              </div>
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-lg font-bold">{data.stats.avgRiskScore}</p>
                <p className="text-[10px] text-muted-foreground">Avg Risk</p>
              </div>
              <div className="rounded-lg border px-2.5 py-2">
                <p className={`text-lg font-bold ${data.stats.staleCount > 0 ? "text-amber-600" : ""}`}>
                  {data.stats.staleCount}
                </p>
                <p className="text-[10px] text-muted-foreground">Stale</p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          {data.recentActivity.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</span>
              <div className="space-y-1">
                {data.recentActivity.slice(0, 5).map((a: any) => (
                  <div key={a.id} className="text-[11px] text-muted-foreground py-0.5">
                    <span className="font-medium text-foreground">{a.case?.tabsNumber}</span>{" "}
                    {a.description?.substring(0, 60)}{a.description?.length > 60 ? "..." : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
