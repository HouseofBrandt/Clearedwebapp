"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Lock, Save, Shield } from "lucide-react"

interface ProfileFormProps {
  userId: string
  initialName: string
  email: string
  role: string
  licenseType: string | null
}

export function ProfileForm({ userId, initialName, email, role, licenseType }: ProfileFormProps) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()
  const hasChanged = name !== initialName

  async function handleSave() {
    if (!name.trim()) {
      addToast({ title: "Name is required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update" }))
        throw new Error(err.error || "Failed to update")
      }
      addToast({ title: "Profile updated" })
    } catch (error: any) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} disabled />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input value={role} disabled />
          </div>
          <div className="space-y-2">
            <Label>License Type</Label>
            <Input value={licenseType || "N/A"} disabled />
          </div>
        </div>
        {hasChanged && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Name"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      addToast({ title: "Passwords do not match", variant: "destructive" })
      return
    }
    if (newPassword.length < 8) {
      addToast({ title: "New password must be at least 8 characters", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to change password" }))
        throw new Error(err.error || "Failed to change password")
      }

      addToast({ title: "Password changed successfully" })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      addToast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Change Password
        </CardTitle>
        <CardDescription>Update your account password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Changing..." : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function ComplianceSection() {
  const [usage, setUsage] = useState<{
    totalRequests: number
    totalInputTokens: number
    totalOutputTokens: number
  } | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(true)

  useState(() => {
    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUsage(data)
      })
      .catch(() => {})
      .finally(() => setLoadingUsage(false))
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Compliance
        </CardTitle>
        <CardDescription>Audit logs and API usage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2">API Usage This Month</h4>
          {loadingUsage ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : usage ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Requests</p>
                <p className="text-lg font-bold">{usage.totalRequests.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Input Tokens</p>
                <p className="text-lg font-bold">{usage.totalInputTokens.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Output Tokens</p>
                <p className="text-lg font-bold">{usage.totalOutputTokens.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load usage data</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
