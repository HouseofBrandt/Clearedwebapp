import type { Metadata } from "next"
import { requireRole } from "@/lib/auth/session"
import { AnalyticsDashboard } from "@/components/settings/analytics-dashboard"

export const metadata: Metadata = { title: "Analytics | Cleared" }

export default async function AnalyticsPage() {
  await requireRole(["ADMIN", "SENIOR"])

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">Feedback Analytics</h1>
        <p className="text-muted-foreground">
          AI output quality, review patterns, and system learning signals
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  )
}
