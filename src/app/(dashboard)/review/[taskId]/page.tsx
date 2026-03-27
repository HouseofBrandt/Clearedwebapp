import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"
import { notFound } from "next/navigation"
import { TaskReview } from "@/components/review/task-review"
import { Badge } from "@/components/ui/badge"
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
      case: {
        select: {
          id: true, tabsNumber: true, clientName: true, caseType: true,
          documents: {
            select: { id: true, fileName: true, fileType: true, documentCategory: true, extractedText: true, fileSize: true, uploadedAt: true },
            orderBy: { uploadedAt: "desc" as const },
          },
        },
      },
      reviewActions: {
        include: { practitioner: { select: { name: true } } },
        orderBy: { reviewStartedAt: "desc" },
      },
    },
  })

  if (!task) {
    notFound()
  }

  if (task.status !== "READY_FOR_REVIEW") {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border p-6 text-center space-y-4">
          <p className="text-muted-foreground">This task has already been reviewed.</p>
          <Badge variant="outline">{task.status.replace(/_/g, " ")}</Badge>
          <div>
            <Link href="/review" className="text-sm text-primary hover:underline">
              Back to Review Queue
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Decrypt PII fields before passing to client component
  const decryptedTask = {
    ...task,
    detokenizedOutput: task.detokenizedOutput ? decryptField(task.detokenizedOutput) : null,
    case: {
      ...task.case,
      clientName: task.case.clientName ? decryptField(task.case.clientName) : "",
    },
  }

  // The TaskReview component manages its own full-height layout
  // with sticky header, scrollable body, and fixed footer.
  return <TaskReview task={decryptedTask} documents={task.case.documents} />
}
