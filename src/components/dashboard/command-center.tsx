"use client"

import Link from "next/link"
import { TruncatedText } from "@/components/ui/truncated-text"
import type { CommandCenterData, ActionItem } from "@/lib/dashboard/command-center"

function FocusRow({ item }: { item: ActionItem }) {
  const actionLabel = item.type === "review" ? "Review" : item.type === "banjo" ? "Run Banjo" : "Open Case"
  const actionHref = item.type === "review" ? "/review" : item.type === "banjo" ? `/cases/${item.caseId}#banjo` : `/cases/${item.caseId}`

  return (
    <div className="flex items-start gap-3.5 py-4 px-5 transition-colors duration-100 hover:bg-[var(--c-gray-50)] rounded-lg group" style={{ borderBottom: "1px solid var(--c-gray-50)" }}>
      <div className="h-2 w-2 rounded-full shrink-0 mt-[7px]" style={{
        background: item.priority === "critical" ? "var(--c-danger)" : item.priority === "high" ? "var(--c-warning)" : "var(--c-gray-200)",
        boxShadow: item.priority === "critical" ? "0 0 0 3px rgba(217,48,37,0.08), 0 0 6px rgba(217,48,37,0.12)" : item.priority === "high" ? "0 0 0 3px rgba(217,119,6,0.08), 0 0 6px rgba(217,119,6,0.08)" : "none",
      }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11.5px] font-medium" style={{ color: "var(--c-gray-400)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>{item.caseIdentifier}</span>
          <span className="text-[11.5px]" style={{ color: "var(--c-gray-300)" }}>&middot;</span>
          <span className="text-[11.5px]" style={{ color: "var(--c-gray-300)" }}>{item.clientName}</span>
        </div>
        <p className="text-[13.5px] font-medium leading-snug" style={{ color: "var(--c-gray-900)" }}>{item.action}</p>
        <p className="text-[12px] mt-0.5 line-clamp-1" style={{ color: "var(--c-gray-400)" }}>{item.reason}</p>
      </div>
      <Link href={actionHref} className="shrink-0">
        <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-150" style={{ color: "var(--c-teal)", background: "var(--c-teal-soft)", border: "1px solid rgba(42,143,168,0.1)" }}>{actionLabel}</span>
      </Link>
    </div>
  )
}

export function DailyBrief({ data, userName }: { data: CommandCenterData; userName: string }) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          <section className="pt-2 pb-8">
            <p className="text-display-md leading-relaxed" style={{ color: "var(--c-gray-900)" }}>{greeting}, {userName.split(" ")[0]}.</p>
            <TruncatedText lines={3} className="mt-3">
              <div className="space-y-1.5">
                {data.briefing.split("\n").map((line, i) => (
                  <p key={i} className="leading-relaxed" style={{ fontSize: i === 0 ? "15px" : "13.5px", color: i === 0 ? "var(--c-gray-700)" : "var(--c-gray-400)" }}>{line}</p>
                ))}
              </div>
            </TruncatedText>
          </section>
          <section>
            {data.actionQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8">Nothing needs your attention right now. All cases are on track.</p>
            ) : (
              <div>{data.actionQueue.slice(0, 12).map((item, i) => (<FocusRow key={`${item.caseId}-${i}`} item={item} />))}</div>
            )}
          </section>
        </div>
        <aside className="w-[220px] shrink-0 hidden lg:block pt-2" style={{ borderLeft: "1px solid var(--c-gray-100)", paddingLeft: "24px" }}>
          <div className="mb-8">
            <p className="text-overline mb-3">Deadlines</p>
            {data.deadlines.length === 0 ? <p className="text-xs text-muted-foreground">None this week</p> : (
              <div className="space-y-2.5">
                {data.deadlines.slice(0, 5).map((d: any) => {
                  const due = new Date(d.dueDate)
                  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000)
                  const isOverdue = diffDays < 0
                  const timeLabel = isOverdue ? "overdue" : diffDays === 0 ? "today" : diffDays === 1 ? "tomorrow" : `in ${diffDays} days`
                  const timeColor = isOverdue ? "text-c-danger" : diffDays <= 1 ? "text-c-warning" : "text-muted-foreground"
                  return (
                    <Link key={d.id} href={`/cases/${d.case?.id || d.caseId}`}>
                      <div className="group cursor-pointer">
                        <p className="text-xs text-foreground group-hover:text-foreground/80 line-clamp-1">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground">{d.case?.tabsNumber} &middot; <span className={timeColor}>{timeLabel}</span></p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
          <div className="mb-6">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Reviews</p>
            {data.pendingReviews > 0 ? <Link href="/review" className="text-sm text-foreground hover:text-muted-foreground transition-colors">{data.pendingReviews} pending &rarr;</Link> : <p className="text-xs text-muted-foreground">All clear</p>}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Status</p>
            <p className="text-sm text-foreground">{data.stats.totalActive} active case{data.stats.totalActive !== 1 ? "s" : ""}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
