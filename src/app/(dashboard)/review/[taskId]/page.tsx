import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { TaskReview } from "@/components/review/task-review"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function ReviewTaskPage({
  params,
}: {
  params: { taskId: string }
}) {
  await requireAuth()

  const task = await prisma.aITask.findUnique({
    where: { id: params.taskId },
    include: {
      case: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
      reviewActions: {
        include: { practitioner: { select: { name: true } } },
        orderBy: { reviewStartedAt: "desc" },
      },
    },
  })

  if (!task) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/review">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {task.taskType.replace(/_/g, " ")}
          </h1>
          <p className="text-muted-foreground">
            {task.case.caseNumber} &middot; {task.case.clientName}
          </p>
        </div>
      </div>
      <TaskReview task={task} />
    </div>
  )
}
