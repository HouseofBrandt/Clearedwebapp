import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"

export default async function WorkProductSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })

  if (user?.role !== "ADMIN") redirect("/settings")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Work Product Controls</h1>
        <p className="text-muted-foreground mt-1">
          Configure templates, examples, and quality standards for AI-generated work products.
        </p>
      </div>

      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <p>Work product controls are being configured. Check back soon.</p>
      </div>
    </div>
  )
}
