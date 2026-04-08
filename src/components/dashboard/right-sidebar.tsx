"use client"

import Link from "next/link"
import { Clock, CheckCircle2, AlertTriangle, ExternalLink, FileText, Shield, Settings, BarChart3 } from "lucide-react"

interface Deadline {
  id: string
  title: string
  caseId?: string
  caseRef?: string
  dueDate: string
  status?: string
}

interface TeamMember {
  id: string
  name: string
  role: string
}

interface CaseProgressItem {
  id: string
  name: string
  tabsNumber: string
  percent: number
}

interface RightSidebarProps {
  deadlines: Deadline[]
  team: TeamMember[]
  pendingReviews: number
  activeCases: CaseProgressItem[]
}

function getTimeStatus(dueDate: string) {
  const due = new Date(dueDate)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000)

  if (diffDays < 0) return { label: "Overdue", variant: "late" as const, icon: AlertTriangle }
  if (diffDays <= 2) return { label: diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : "2 days", variant: "soon" as const, icon: Clock }
  return { label: `${diffDays} days`, variant: "ok" as const, icon: CheckCircle2 }
}

const badgeStyles = {
  soon: { background: "#FEF5E7", color: "#92400E", borderColor: "rgba(217,123,30,0.15)" },
  ok: { background: "#ECFDF5", color: "#065F46", borderColor: "rgba(16,185,129,0.15)" },
  late: { background: "#FEF2F2", color: "#EF4444", borderColor: "rgba(239,68,68,0.15)" },
}

function DeadlineItem({ deadline }: { deadline: Deadline }) {
  const status = getTimeStatus(deadline.dueDate)
  const Icon = status.icon
  const style = badgeStyles[status.variant]

  return (
    <Link href={`/cases/${deadline.caseId}`} className="block group">
      <div className="py-2.5 transition-colors duration-100">
        <p className="text-[13px] font-medium leading-snug group-hover:text-[var(--c-navy-950)]" style={{ color: "var(--c-gray-800)" }}>
          {deadline.title}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px]" style={{ color: "var(--c-gray-400)", fontFamily: "var(--font-mono)" }}>
            {deadline.caseRef}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: style.background, color: style.color, border: `1px solid ${style.borderColor}` }}
          >
            <Icon className="h-2.5 w-2.5" />
            {status.label}
          </span>
        </div>
      </div>
    </Link>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--c-gray-300)" }}>
      {label}
    </p>
  )
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

const avatarColors = ["#2A8FA8", "#D97B1E", "#8B5CF6", "#EF4444", "#10B981", "#3B82F6", "#EC4899"]

export function RightSidebar({ deadlines, team, pendingReviews, activeCases }: RightSidebarProps) {
  return (
    <aside
      className="hidden xl:block w-[272px] shrink-0 overflow-y-auto py-6 px-5"
      style={{
        borderLeft: "1px solid var(--c-gray-100)",
        background: "linear-gradient(180deg, var(--c-white) 0%, var(--c-snow) 100%)",
      }}
    >
      {/* Deadlines */}
      <div className="mb-7">
        <SectionHeader label="Deadlines" />
        {deadlines.length === 0 ? (
          <p className="text-[12px] py-2" style={{ color: "var(--c-gray-300)" }}>No upcoming deadlines</p>
        ) : (
          <div className="divide-y divide-[var(--c-gray-50)]">
            {deadlines.slice(0, 5).map((d) => (
              <DeadlineItem key={d.id} deadline={d} />
            ))}
          </div>
        )}
      </div>

      {/* Case progress */}
      {activeCases.length > 0 && (
        <div className="mb-7">
          <SectionHeader label="Case progress" />
          <div className="space-y-3">
            {activeCases.slice(0, 3).map((c) => (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium truncate pr-2" style={{ color: "var(--c-gray-700)" }}>
                    {c.name}
                  </span>
                  <span className="text-[11px] font-medium shrink-0" style={{ color: "var(--c-gray-400)", fontFamily: "var(--font-mono)" }}>
                    {c.percent}%
                  </span>
                </div>
                <div className="h-[6px] rounded-full overflow-hidden" style={{ background: "var(--c-gray-100)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(c.percent, 100)}%`,
                      background: "linear-gradient(90deg, #D97B1E, #F4A03A)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team */}
      {team.length > 0 && (
        <div className="mb-7">
          <SectionHeader label="Team" />
          <div className="flex items-center -space-x-2">
            {team.slice(0, 5).map((member, i) => (
              <div
                key={member.id}
                className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-white text-[10px] font-semibold text-white transition-transform duration-150 hover:scale-110 hover:z-10 cursor-default"
                style={{ background: avatarColors[i % avatarColors.length], zIndex: team.length - i }}
                title={`${member.name} (${member.role})`}
              >
                {getInitials(member.name)}
              </div>
            ))}
            {team.length > 5 && (
              <div
                className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-white text-[10px] font-semibold"
                style={{ background: "var(--c-teal-soft)", color: "var(--c-teal)" }}
              >
                +{team.length - 5}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviews */}
      <div className="mb-7">
        <SectionHeader label="Reviews" />
        {pendingReviews > 0 ? (
          <Link href="/review" className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80" style={{ color: "var(--c-teal)" }}>
            {pendingReviews} pending
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--c-success)" }} />
            <span className="text-[12px]" style={{ color: "var(--c-gray-500)" }}>All clear</span>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div>
        <SectionHeader label="Quick links" />
        <div className="space-y-0.5">
          {[
            { label: "SOC 2 dashboard", href: "/admin/compliance", icon: Shield },
            { label: "Work product", href: "/settings/work-product", icon: FileText },
            { label: "Analytics", href: "/settings/analytics", icon: BarChart3 },
            { label: "Settings", href: "/settings", icon: Settings },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-all duration-100 hover:bg-[var(--c-gray-50)]"
              style={{ color: "var(--c-gray-500)" }}
            >
              <link.icon className="h-3.5 w-3.5" style={{ color: "var(--c-gray-300)" }} />
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  )
}
