import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { ErrorLog } from "@/components/settings/error-log"

export default async function ErrorsPage() {
  const session = await requireAuth()

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const errors = await prisma.appError.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: { select: { name: true } },
    },
  })

  // Clean up old errors (fire and forget)
  prisma.appError.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  }).catch(() => {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Error Log</h1>
        <p className="text-sm text-muted-foreground">Recent application errors (last 30 days)</p>
      </div>
      <ErrorLog errors={JSON.parse(JSON.stringify(errors))} />
    </div>
  )
}
