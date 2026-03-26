"use client"

import Link from "next/link"
import { TruncatedText } from "@/components/ui/truncated-text"
import type { CommandCenterData, ActionItem } from "@/lib/dashboard/command-center"

// ═══════════════════════════════════════════════════
// Focus Queue Row
// ═══════════════════════════════════════════════════

function FocusRow({ item }: { item: ActionItem }) {
  const borderColor =
    item.priority === "critical" ? "border-l-c-danger" :
    item.priority === "high" ? "border-l-c-warning" :
    "border-l-transparent"

  const dot =
    item.priority === "critical" ? <div className="h-2 w-2 rounded-full bg-c-danger shrink-0 mt-1.5" /> :
    item.priority === "high" ? <div className="h-2 w-2 rounded-full bg-c-warning shrink-0 mt-1.5" /> :
    <div className="h-2 w-2 shrink-0" />

  const actionLabel =
    item.type === "review" ? "Review" :
    item.type === "banjo" ? "Run Banjo" :
    "Open Case"

  const actionHref =
    item.type === "review" ? "/review" :
    item.type === "banjo" ? `/cases/${item.caseId}#banjo` :
    `/cases/${item.caseId}`

  return (
    <div className={`border-l-2 ${borderColor} border-b border-border last:border-b-0`}>
      <div className="flex items-start gap-3 py-4 px-4">
        {dot}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-muted-foreground">{item.caseIdentifier}</span>
            <span className="text-xs text-muted-foreground/60">{item.clientName}</span>
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">{item.action}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.reason}</p>
        </div>
        <Link href={actionHref} className="shrink-0">
          <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors">
            {actionLabel}
          </span>
        </Link>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// Main Dashboard — Daily Brief
// ═══════════════════════════════════════════════════

export function DailyBrief({ data, userName }: { data: CommandCenterData; userName: string }) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-8">
        {/* Main column */}
        <div className="flex-1 min-w-0">

          {/* Layer 1: Briefing */}
          <section className="pt-2 pb-8">
            <p className="text-display-md text-foreground leading-relaxed">
              {greeting}, {userName.split(" ")[0]}.
            </p>
            <TruncatedText lines={3} className="mt-2">
              <div className="space-y-1">
                {data.briefing.split("\n").map((line, i) => (
                  <p key={i} className={`${i === 0 ? "text-[15px] text-foreground" : "text-sm text-muted-foreground"} leading-relaxed`}>
                    {line}
                  </p>
                ))}
              </div>
            </TruncatedText>
          </section>

          {/* Layer 2: Focus Queue */}
          <section>
            {data.actionQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8">
                Nothing needs your attention right now. All cases are on track.
              </p>
            ) : (
              <div>
                {data.actionQueue.slice(0, 12).map((item, i) => (
                  <FocusRow key={`${item.caseId}-${i}`} item={item} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Layer 3: Secondary Rail */}
        <aside className="w-[220px] shrink-0 hidden lg:block border-l pl-6 pt-2">
          {/* Deadlines */}
          <div className="mb-6">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Deadlines</p>
            {data.deadlines.length === 0 ? (
              <p className="text-xs text-muted-foreground">None this week</p>
            ) : (
              <div className="space-y-2.5">
                {data.deadlines.slice(0, 5).map((d: any) => {
                  const due = new Date(d.dueDate)
                  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000)
                  const isOverdue = diffDays < 0
                  const timeLabel =
                    isOverdue ? "overdue" :
                    diffDays === 0 ? "today" :
                    diffDays === 1 ? "tomorrow" :
                    `in ${diffDays} days`
                  const timeColor =
                    isOverdue ? "text-c-danger" :
                    diffDays <= 1 ? "text-c-warning" :
                    "text-muted-foreground"

                  return (
                    <Link key={d.id} href={`/cases/${d.case?.id || d.caseId}`}>
                      <div className="group cursor-pointer">
                        <p className="text-xs text-foreground group-hover:text-foreground/80 line-clamp-1">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {d.case?.tabsNumber} &middot; <span className={timeColor}>{timeLabel}</span>
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="mb-6">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Reviews</p>
            {data.pendingReviews > 0 ? (
              <Link href="/review" className="text-sm text-foreground hover:text-muted-foreground transition-colors">
                {data.pendingReviews} pending &rarr;
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">All clear</p>
            )}
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Status</p>
            <p className="text-sm text-foreground">
              {data.stats.totalActive} active case{data.stats.totalActive !== 1 ? "s" : ""}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
