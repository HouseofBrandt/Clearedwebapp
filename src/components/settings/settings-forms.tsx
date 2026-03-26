"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Lock, Save, Shield, Clock, AlertTriangle, CheckCircle, BarChart3, Globe } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getUserTimezone, setUserTimezone, TIMEZONE_OPTIONS, DEFAULT_TIMEZONE } from "@/lib/timezone"

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

interface ComplianceData {
  month: string
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  reviewStats: {
    totalReviews: number
    avgReviewTimeSeconds: number
    approvedCount: number
    editApprovedCount: number
    rejectedCount: number
  }
  flagStats: {
    totalVerifyFlags: number
    totalJudgmentFlags: number
    flagsAcknowledgedCount: number
    flagsPendingCount: number
  }
  modelBreakdown: { model: string; count: number }[]
  taskTypeBreakdown: { taskType: string; count: number }[]
}

export function ComplianceSection() {
  const [data, setData] = useState<ComplianceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/compliance")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Compliance Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading compliance data...</p>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Compliance Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load compliance data</p>
        </CardContent>
      </Card>
    )
  }

  const flagResolutionRate = data.flagStats.totalVerifyFlags + data.flagStats.totalJudgmentFlags > 0
    ? Math.round((data.flagStats.flagsAcknowledgedCount / (data.flagStats.flagsAcknowledgedCount + data.flagStats.flagsPendingCount)) * 100)
    : 100

  return (
    <div className="space-y-4">
      {/* API Usage  */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            API Usage This Month
          </CardTitle>
          <CardDescription>Claude API consumption and cost indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Requests</p>
              <p className="text-lg font-medium">{data.totalRequests.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Input Tokens</p>
              <p className="text-lg font-medium">{data.totalInputTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Output Tokens</p>
              <p className="text-lg font-medium">{data.totalOutputTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total Tokens</p>
              <p className="text-lg font-medium">{(data.totalInputTokens + data.totalOutputTokens).toLocaleString()}</p>
            </div>
          </div>
          {data.modelBreakdown.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">By Model</p>
              <div className="flex gap-3 flex-wrap">
                {data.modelBreakdown.map((m) => (
                  <span key={m.model} className="text-xs rounded-full border px-2 py-1">
                    {m.model.replace("claude-", "").replace("-20250514", "")}: {m.count}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.taskTypeBreakdown.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">By Task Type</p>
              <div className="flex gap-3 flex-wrap">
                {data.taskTypeBreakdown.map((t) => (
                  <span key={t.taskType} className="text-xs rounded-full border px-2 py-1">
                    {t.taskType.replace(/_/g, " ").toLowerCase()}: {t.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Review Performance
          </CardTitle>
          <CardDescription>Review time averages and approval rates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total Reviews</p>
              <p className="text-lg font-medium">{data.reviewStats.totalReviews}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Avg Review Time</p>
              <p className="text-lg font-medium">{formatDuration(data.reviewStats.avgReviewTimeSeconds)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-c-success" /> Approved
              </p>
              <p className="text-lg font-medium text-c-success">{data.reviewStats.approvedCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Edit + Approved</p>
              <p className="text-lg font-medium text-c-teal">{data.reviewStats.editApprovedCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="text-lg font-medium text-c-danger">{data.reviewStats.rejectedCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flag Resolution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Flag Resolution
          </CardTitle>
          <CardDescription>[VERIFY] and [PRACTITIONER JUDGMENT] flag tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">[VERIFY] Flags</p>
              <p className="text-lg font-medium">{data.flagStats.totalVerifyFlags}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">[JUDGMENT] Flags</p>
              <p className="text-lg font-medium">{data.flagStats.totalJudgmentFlags}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Acknowledged</p>
              <p className="text-lg font-medium text-c-success">{data.flagStats.flagsAcknowledgedCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Resolution Rate</p>
              <p className="text-lg font-medium">{flagResolutionRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function TimezoneForm() {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const { addToast } = useToast()

  useEffect(() => {
    setTimezone(getUserTimezone())
  }, [])

  function handleChange(value: string) {
    setTimezone(value)
    setUserTimezone(value)
    addToast({ title: `Timezone set to ${TIMEZONE_OPTIONS.find((o) => o.value === value)?.label || value}` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Timezone
        </CardTitle>
        <CardDescription>
          Controls how dates and times are displayed throughout the platform.
          Defaults to Central Time (America/Chicago).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs space-y-2">
          <Label htmlFor="timezone-select">Display timezone</Label>
          <Select value={timezone} onValueChange={handleChange}>
            <SelectTrigger id="timezone-select">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
