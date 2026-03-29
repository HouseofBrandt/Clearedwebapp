import { requireRole } from "@/lib/auth/session"
import { SwitchboardDashboard } from "@/components/admin/switchboard-dashboard"

export const metadata = { title: "Switchboard | Cleared" }

export default async function SwitchboardPage() {
  await requireRole(["ADMIN"])
  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">Switchboard Data Center</h1>
        <p className="text-muted-foreground">AI pipeline visibility — context assembly, learning patterns, and prompt injection monitoring</p>
      </div>
      <SwitchboardDashboard />
    </div>
  )
}
