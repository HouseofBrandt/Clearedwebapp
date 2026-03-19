import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Settings | Cleared" }
import { UserManagement } from "@/components/settings/user-management"
import { ProfileForm, PasswordChangeForm, ComplianceSection } from "@/components/settings/settings-forms"

export default async function SettingsPage() {
  const session = await requireAuth()
  const user = session.user as any
  const isAdmin = user.role === "ADMIN"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <ProfileForm
        userId={user.id}
        initialName={user.name || ""}
        email={user.email || ""}
        role={user.role || ""}
        licenseType={user.licenseType || null}
      />

      <PasswordChangeForm />

      {isAdmin && <ComplianceSection />}

      {isAdmin && <UserManagement />}
    </div>
  )
}
