import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { caseAccessFilter } from "@/lib/auth/case-access"
import { decryptCasePII } from "@/lib/encryption"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CASE_TYPE_LABELS } from "@/types"
import Link from "next/link"

export const metadata: Metadata = { title: "Portfolio | Cleared" }

function RiskCell({ score, tabsNumber, id }: { score: number; tabsNumber: string; id: string }) {
  const bg =
    score >= 76 ? "bg-c-danger hover:bg-c-danger" :
    score >= 51 ? "bg-orange-500 hover:bg-orange-600" :
    score >= 26 ? "bg-c-warning hover:bg-c-warning-soft" :
    "bg-emerald-500 hover:bg-emerald-600"
  return (
    <Link href={`/cases/${id}`}>
      <div className={`${bg} rounded-sm w-10 h-10 flex items-center justify-center text-white text-[10px] font-medium font-mono tabular-nums cursor-pointer transition-colors`} title={`${tabsNumber} — Risk: ${score}`}>
        {score}
      </div>
    </Link>
  )
}

export default async function PortfolioPage() {
  const session = await requireAuth()
  const userId = session.user.id
  const accessFilter = await caseAccessFilter(userId)
  const now = new Date()

  let activeCases: any[] = []
  let reviewBacklog: any[] = []
  let phaseDistribution: any[] = []

  try {
    const results = await Promise.all([
      prisma.case.findMany({
        where: { ...accessFilter, status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } },
        include: {
          intelligence: true,
          assignedPractitioner: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.aITask.groupBy({
        by: ["caseId"],
        where: { status: "READY_FOR_REVIEW", case: accessFilter },
        _count: true,
      }).catch(() => []),
      prisma.case.groupBy({
        by: ["status"],
        where: accessFilter,
        _count: true,
      }).catch(() => []),
    ])
    activeCases = results[0]
    reviewBacklog = results[1]
    phaseDistribution = results[2]
  } catch {
    // If queries fail, render with empty data
  }

  const decrypted = activeCases.map(decryptCasePII)

  // Risk heat map data
  const riskCases = decrypted
    .filter((c: any) => c.intelligence?.riskScore != null)
    .sort((a: any, b: any) => (b.intelligence?.riskScore || 0) - (a.intelligence?.riskScore || 0))

  // Stale cases
  const staleCases = decrypted.filter((c: any) => c.intelligence?.isStale)

  // Bundle readiness opportunities (>70% docs, no approved output)
  const missedOpportunities = decrypted.filter((c: any) => {
    const completeness = c.intelligence?.docCompleteness || 0
    const hasApproved = c.aiTasks?.some?.((t: any) => t.status === "APPROVED")
    return completeness >= 0.7 && !hasApproved
  })

  // Phase distribution
  const phaseMap: Record<string, number> = {}
  for (const p of phaseDistribution) {
    phaseMap[p.status] = p._count
  }
  const phases = ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE", "RESOLVED", "CLOSED"]
  const phaseLabels: Record<string, string> = {
    INTAKE: "Intake", ANALYSIS: "Analysis", REVIEW: "Review",
    ACTIVE: "Active", RESOLVED: "Resolved", CLOSED: "Closed",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-md">Portfolio Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Firm-wide view of {decrypted.length} active cases
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Heat Map */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider">Risk Heat Map</CardTitle>
          </CardHeader>
          <CardContent>
            {riskCases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases with computed risk scores yet. Refresh intelligence to populate.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {riskCases.map((c: any) => (
                  <RiskCell key={c.id} score={c.intelligence?.riskScore || 0} tabsNumber={c.tabsNumber} id={c.id} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phase Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider">Phase Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {phases.map(phase => {
                const count = phaseMap[phase] || 0
                const total = Object.values(phaseMap).reduce((a, b) => a + b, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={phase} className="flex items-center gap-3">
                    <span className="text-xs w-16 text-muted-foreground">{phaseLabels[phase]}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-c-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium font-mono tabular-nums w-8 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Stale Cases */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider">
              Stale Cases ({staleCases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {staleCases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stale cases. All cases have recent activity.</p>
            ) : (
              <div className="space-y-2">
                {staleCases.slice(0, 8).map((c: any) => (
                  <Link key={c.id} href={`/cases/${c.id}`}>
                    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted transition-colors cursor-pointer">
                      <div>
                        <span className="text-sm font-medium font-mono tabular-nums">{c.tabsNumber}</span>
                        <span className="text-xs text-muted-foreground ml-2">{c.clientName}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-c-warning border-c-warning/20">
                        {c.intelligence?.daysSinceActivity || "?"}d inactive
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Missed Opportunities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider">
              Ready for Banjo ({missedOpportunities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {missedOpportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases with sufficient documents awaiting analysis.</p>
            ) : (
              <div className="space-y-2">
                {missedOpportunities.slice(0, 8).map((c: any) => (
                  <Link key={c.id} href={`/cases/${c.id}#banjo`}>
                    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted transition-colors cursor-pointer">
                      <div>
                        <span className="text-sm font-medium font-mono tabular-nums">{c.tabsNumber}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {CASE_TYPE_LABELS[c.caseType as keyof typeof CASE_TYPE_LABELS] || c.caseType}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {Math.round((c.intelligence?.docCompleteness || 0) * 100)}% docs
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Backlog */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wider">
              Review Backlog ({reviewBacklog.length} cases)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewBacklog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending reviews across the portfolio.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {reviewBacklog.map((b: any) => {
                  const c = decrypted.find((c: any) => c.id === b.caseId)
                  return (
                    <Link key={b.caseId} href={`/cases/${b.caseId}#deliverables`}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                        {c?.tabsNumber || b.caseId} ({b._count})
                      </Badge>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
