import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Users, ClipboardCheck, AlertCircle, CheckCircle, ArrowRight } from "lucide-react"
import Link from "next/link"
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS } from "@/types"

const caseTypeBadgeColors: Record<string, string> = {
  OIC: "bg-blue-100 text-blue-800",
  IA: "bg-green-100 text-green-800",
  PENALTY: "bg-red-100 text-red-800",
  INNOCENT_SPOUSE: "bg-purple-100 text-purple-800",
  CNC: "bg-yellow-100 text-yellow-800",
  TFRP: "bg-orange-100 text-orange-800",
  OTHER: "bg-gray-100 text-gray-800",
}

export default async function DashboardPage() {
  const session = await requireAuth()

  let totalCases = 0
  let activeCases = 0
  let pendingReviews = 0
  let needsAttention = 0
  let resolvedThisMonth = 0
  let recentCases: any[] = []
  let dbError = false

  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Needs attention: tasks pending review for > 48 hours
    const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const results = await Promise.all([
      prisma.case.count(),
      prisma.case.count({ where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } } }),
      prisma.aITask.count({ where: { status: "READY_FOR_REVIEW" } }),
      prisma.aITask.count({
        where: { status: "READY_FOR_REVIEW", createdAt: { lt: staleThreshold } },
      }),
      prisma.case.count({
        where: { status: "RESOLVED", updatedAt: { gte: monthStart } },
      }),
      prisma.case.findMany({
        take: 5,
        orderBy: { updatedAt: "desc" },
        include: { assignedPractitioner: { select: { name: true } } },
      }),
    ])
    totalCases = results[0]
    activeCases = results[1]
    pendingReviews = results[2]
    needsAttention = results[3]
    resolvedThisMonth = results[4]
    recentCases = results[5]
  } catch (error: any) {
    console.error("Dashboard query error:", error?.message)
    dbError = true
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.user.name}
        </p>
      </div>

      {dbError && (
        <Card className="border-yellow-500 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-sm text-yellow-800">
              Unable to load dashboard data. The database may still be initializing. Try refreshing the page.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Link href="/cases">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCases}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/cases?status=ACTIVE">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCases}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/review">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingReviews}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/cases?attention=true">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{needsAttention}</div>
              <p className="text-xs text-muted-foreground mt-1">Reviews &gt; 48h old</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved This Month</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedThisMonth}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Cases</CardTitle>
          <Link href="/cases" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentCases.length === 0 ? (
            <div className="flex flex-col items-center py-8 space-y-3">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-center">
                <p className="font-medium">Get Started</p>
                <p className="text-sm text-muted-foreground mt-1">
                  1. Create a case &middot; 2. Upload documents &middot; 3. Run AI analysis
                </p>
              </div>
              <Link href="/cases">
                <button className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Create Your First Case
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCases.map((c) => (
                <Link key={c.id} href={`/cases/${c.id}`}>
                  <div className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{c.caseNumber}</p>
                        <p className="text-sm text-muted-foreground">{c.clientName}</p>
                      </div>
                      <Badge className={caseTypeBadgeColors[c.caseType] || caseTypeBadgeColors.OTHER} variant="secondary">
                        {CASE_TYPE_LABELS[c.caseType as keyof typeof CASE_TYPE_LABELS] || c.caseType}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">
                        {CASE_STATUS_LABELS[c.status as keyof typeof CASE_STATUS_LABELS] || c.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.assignedPractitioner?.name || "Unassigned"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
