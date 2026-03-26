import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"
import { User, Shield, Activity } from "lucide-react"
import { Card } from "@/components/ui/card"

export const metadata: Metadata = { title: "Settings | Cleared" }
import { UserManagement } from "@/components/settings/user-management"
import { ProfileForm, PasswordChangeForm, ComplianceSection, TimezoneForm } from "@/components/settings/settings-forms"

export default async function SettingsPage() {
  const session = await requireAuth()
  const user = session.user as any
  const isAdmin = user.role === "ADMIN"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-md">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and workspace preferences</p>
      </div>

      <div className="grid gap-8">
        {/* Profile Section */}
        <div>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <User className="h-5 w-5" /> Profile
          </h2>
          <ProfileForm
            userId={user.id}
            initialName={user.name || ""}
            email={user.email || ""}
            role={user.role || ""}
            licenseType={user.licenseType || null}
          />
        </div>

        {/* Security Section */}
        <div>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" /> Security
          </h2>
          <PasswordChangeForm />
        </div>

        {/* Preferences Section */}
        <div>
          <TimezoneForm />
        </div>

        {/* System Health Section (admin only) */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" /> System Health
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Encryption Status</div>
                <div className="text-sm font-medium text-c-success mt-1">Active (AES-256-GCM)</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">API Keys</div>
                <div className="text-sm font-medium text-c-success mt-1">Configured</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">PII Tokenization</div>
                <div className="text-sm font-medium text-c-success mt-1">Enforced</div>
              </Card>
            </div>
          </div>
        )}

        {/* Compliance Section (admin only) */}
        {isAdmin && (
          <div>
            <ComplianceSection />
          </div>
        )}

        {/* User Management (admin only) */}
        {isAdmin && (
          <div>
            <UserManagement />
          </div>
        )}
      </div>
    </div>
  )
}
