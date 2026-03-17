import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Users, ClipboardCheck, AlertCircle } from "lucide-react"

export default async function DashboardPage() {
  const session = await requireAuth()

  const [totalCases, activeCases, pendingReviews, recentCases] = await Promise.all([
    prisma.case.count(),
    prisma.case.count({ where: { status: { in: ["INTAKE", "ANALYSIS", "REVIEW", "ACTIVE"] } } }),
    prisma.aITask.count({ where: { status: "READY_FOR_REVIEW" } }),
    prisma.case.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { assignedPractitioner: { select: { name: true } } },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.user.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCases}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCases}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingReviews}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Cases</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases yet. Create your first case to get started.</p>
          ) : (
            <div className="space-y-4">
              {recentCases.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{c.caseNumber}</p>
                    <p className="text-sm text-muted-foreground">{c.clientName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{c.status}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.assignedPractitioner?.name || "Unassigned"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
