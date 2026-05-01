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
  licenseNumber?: string
  initialCafNumber?: string
  initialPtin?: string
  initialPhone?: string
  initialJurisdiction?: string
  initialFirmName?: string
  initialFirmAddress?: string
  initialFirmCity?: string
  initialFirmState?: string
  initialFirmZip?: string
  initialFirmPhone?: string
  initialFirmFax?: string
}

export function ProfileForm({
  userId,
  initialName,
  email,
  role,
  licenseType,
  licenseNumber = "",
  initialCafNumber = "",
  initialPtin = "",
  initialPhone = "",
  initialJurisdiction = "",
  initialFirmName = "",
  initialFirmAddress = "",
  initialFirmCity = "",
  initialFirmState = "",
  initialFirmZip = "",
  initialFirmPhone = "",
  initialFirmFax = "",
}: ProfileFormProps) {
  const [name, setName] = useState(initialName)
  const [cafNumber, setCafNumber] = useState(initialCafNumber)
  const [ptin, setPtin] = useState(initialPtin)
  const [phone, setPhone] = useState(initialPhone)
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction)
  const [firmName, setFirmName] = useState(initialFirmName)
  const [firmAddress, setFirmAddress] = useState(initialFirmAddress)
  const [firmCity, setFirmCity] = useState(initialFirmCity)
  const [firmState, setFirmState] = useState(initialFirmState)
  const [firmZip, setFirmZip] = useState(initialFirmZip)
  const [firmPhone, setFirmPhone] = useState(initialFirmPhone)
  const [firmFax, setFirmFax] = useState(initialFirmFax)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const hasChanged =
    name !== initialName ||
    cafNumber !== initialCafNumber ||
    ptin !== initialPtin ||
    phone !== initialPhone ||
    jurisdiction !== initialJurisdiction ||
    firmName !== initialFirmName ||
    firmAddress !== initialFirmAddress ||
    firmCity !== initialFirmCity ||
    firmState !== initialFirmState ||
    firmZip !== initialFirmZip ||
    firmPhone !== initialFirmPhone ||
    firmFax !== initialFirmFax

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
        body: JSON.stringify({
          name,
          cafNumber: cafNumber || null,
          ptin: ptin || null,
          phone: phone || null,
          jurisdiction: jurisdiction || null,
          firmName: firmName || null,
          firmAddress: firmAddress || null,
          firmCity: firmCity || null,
          firmState: firmState || null,
          firmZip: firmZip || null,
          firmPhone: firmPhone || null,
          firmFax: firmFax || null,
        }),
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your name and login email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Practitioner credentials</CardTitle>
          <CardDescription>
            Used to auto-fill the representative slot on every IRS form (2848, 12153, 911, etc.).
            Fill these once and the form builder will not re-prompt per case.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>CAF Number</Label>
              <Input value={cafNumber} onChange={(e) => setCafNumber(e.target.value)} placeholder="e.g. 1234-56789R" />
            </div>
            <div className="space-y-2">
              <Label>PTIN</Label>
              <Input value={ptin} onChange={(e) => setPtin(e.target.value)} placeholder="P########" />
            </div>
            <div className="space-y-2">
              <Label>Direct phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-1234" />
            </div>
            <div className="space-y-2">
              <Label>Licensing jurisdiction</Label>
              <Input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder='e.g. "California" for an attorney, "EA" for an enrolled agent'
              />
            </div>
            <div className="space-y-2">
              <Label>Bar / license / enrollment number</Label>
              <Input value={licenseNumber} disabled placeholder="(set by your administrator)" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Firm address</CardTitle>
          <CardDescription>Printed in the representative section of every form.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Firm name</Label>
              <Input value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Acme Tax Resolution, LLC" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Street address</Label>
              <Input value={firmAddress} onChange={(e) => setFirmAddress(e.target.value)} placeholder="123 Main St, Suite 200" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={firmCity} onChange={(e) => setFirmCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={firmState} onChange={(e) => setFirmState(e.target.value)} placeholder="CA" maxLength={2} />
            </div>
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input value={firmZip} onChange={(e) => setFirmZip(e.target.value)} placeholder="90210" />
            </div>
            <div className="space-y-2">
              <Label>Firm phone</Label>
              <Input value={firmPhone} onChange={(e) => setFirmPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Firm fax</Label>
              <Input value={firmFax} onChange={(e) => setFirmFax(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {hasChanged && (
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save profile"}
        </Button>
      )}
    </div>
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
