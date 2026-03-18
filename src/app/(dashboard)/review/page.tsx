import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClipboardCheck, Brain } from "lucide-react"
import Link from "next/link"

export default async function ReviewPage() {
  await requireAuth()

  const pendingTasks = await prisma.aITask.findMany({
    where: { status: "READY_FOR_REVIEW" },
    include: {
      case: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground">
          AI-generated outputs awaiting practitioner review
        </p>
      </div>

      {pendingTasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">Queue is empty</h3>
            <p className="text-sm text-muted-foreground">
              No AI outputs are pending review right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pendingTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <Brain className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{task.taskType.replace(/_/g, " ")}</p>
                    <p className="text-sm text-muted-foreground">
                      {task.case.caseNumber} &middot; {task.case.clientName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    {task.case.caseType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(task.createdAt).toLocaleString()}
                  </span>
                  <Link href={`/review/${task.id}`}>
                    <Button size="sm">Review</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
