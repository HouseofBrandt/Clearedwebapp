"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { CheckCircle, Save } from "lucide-react"

const OUTCOME_TYPES = [
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SETTLED", label: "Settled" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "EXPIRED", label: "Expired" },
]

const OUTCOME_COLORS: Record<string, string> = {
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
  SETTLED: "bg-amber-100 text-amber-800",
  WITHDRAWN: "bg-gray-100 text-gray-700",
  EXPIRED: "bg-gray-100 text-gray-600",
}

interface CaseOutcomePanelProps {
  caseId: string
}

export function CaseOutcomePanel({ caseId }: CaseOutcomePanelProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [outcomeType, setOutcomeType] = useState("")
  const [outcomeAmount, setOutcomeAmount] = useState("")
  const [outcomeDate, setOutcomeDate] = useState("")
  const [outcomeNotes, setOutcomeNotes] = useState("")
  const [existingOutcome, setExistingOutcome] = useState<any>(null)
  const { addToast } = useToast()

  useEffect(() => {
    async function fetchOutcome() {
      try {
        const res = await fetch(`/api/cases/${caseId}/outcome`)
        if (res.ok) {
          const data = await res.json()
          if (data.outcome?.outcomeType) {
            setExistingOutcome(data.outcome)
            setOutcomeType(data.outcome.outcomeType)
            setOutcomeAmount(data.outcome.outcomeAmount ? String(data.outcome.outcomeAmount) : "")
            setOutcomeDate(data.outcome.outcomeDate ? new Date(data.outcome.outcomeDate).toISOString().split("T")[0] : "")
            setOutcomeNotes(data.outcome.outcomeNotes || "")
            setSaved(true)
          }
        }
      } catch {
        // Non-critical — the panel just stays empty
      } finally {
        setLoading(false)
      }
    }
    fetchOutcome()
  }, [caseId])

  async function handleSave() {
    if (!outcomeType) {
      addToast({ title: "Select an outcome type", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcomeType,
          outcomeAmount: outcomeAmount ? parseFloat(outcomeAmount) : null,
          outcomeDate: outcomeDate || null,
          outcomeNotes: outcomeNotes || null,
        }),
      })
      if (!res.ok) throw new Error("Failed to save")
      const data = await res.json()
      setExistingOutcome(data.outcome)
      setSaved(true)
      addToast({ title: "Outcome recorded" })
    } catch {
      addToast({ title: "Error", description: "Failed to save outcome", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Loading outcome...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Case Outcome</CardTitle>
          {saved && existingOutcome && (
            <Badge className={`${OUTCOME_COLORS[existingOutcome.outcomeType] || ""}`} variant="secondary">
              <CheckCircle className="h-3 w-3 mr-1" />
              {OUTCOME_TYPES.find(o => o.value === existingOutcome.outcomeType)?.label || existingOutcome.outcomeType}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Outcome Type</Label>
          <Select value={outcomeType} onValueChange={v => { setOutcomeType(v); setSaved(false) }}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select outcome" />
            </SelectTrigger>
            <SelectContent>
              {OUTCOME_TYPES.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Amount (if applicable)</Label>
          <Input
            type="number"
            value={outcomeAmount}
            onChange={e => { setOutcomeAmount(e.target.value); setSaved(false) }}
            placeholder="e.g. 25000"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Outcome Date</Label>
          <Input
            type="date"
            value={outcomeDate}
            onChange={e => { setOutcomeDate(e.target.value); setSaved(false) }}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea
            value={outcomeNotes}
            onChange={e => { setOutcomeNotes(e.target.value); setSaved(false) }}
            rows={3}
            placeholder="Optional notes about the outcome..."
            className="text-sm"
          />
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !outcomeType}
          className="w-full"
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving..." : saved ? "Update Outcome" : "Record Outcome"}
        </Button>

        {saved && existingOutcome && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Outcome recorded</p>
                <p className="text-green-700 mt-0.5">
                  This outcome has been applied to all associated knowledge base documents for future case matching.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
