import { requireAuth } from "@/lib/auth/session"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

export default async function SettingsPage() {
  const session = await requireAuth()
  const user = session.user as any

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={user.name || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={user.role || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>License Type</Label>
              <Input value={user.licenseType || "N/A"} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Multi-factor authentication and password settings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            MFA configuration will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
