"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { Plus, Loader2 } from "lucide-react"

const FEATURE_AREAS = [
  { value: "__none", label: "None" },
  { value: "TRANSCRIPT_DECODER", label: "Transcript Decoder" },
  { value: "CASE_INTELLIGENCE", label: "Case Intelligence" },
  { value: "PENALTY_ABATEMENT", label: "Penalty Abatement" },
  { value: "OIC", label: "OIC" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "DEADLINE_TRACKER", label: "Deadlines" },
  { value: "GENERAL", label: "General" },
]

const TAX_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

interface NewConversationDialogProps {
  caseId: string
  onCreated: () => void
}

export function NewConversationDialog({ caseId, onCreated }: NewConversationDialogProps) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [priority, setPriority] = useState("NORMAL")
  const [taxYears, setTaxYears] = useState<number[]>([])
  const [featureArea, setFeatureArea] = useState("__none")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useToast()

  function toggleTaxYear(year: number) {
    setTaxYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    )
  }

  function resetForm() {
    setSubject("")
    setPriority("NORMAL")
    setTaxYears([])
    setFeatureArea("__none")
    setMessage("")
  }

  async function handleCreate() {
    if (!subject.trim()) {
      addToast({ title: "Subject is required", variant: "destructive" })
      return
    }
    if (!message.trim()) {
      addToast({ title: "First message is required", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          priority,
          relatedTaxYears: taxYears,
          relatedFeature: featureArea === "__none" ? null : featureArea,
          initialMessage: message.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      resetForm()
      setOpen(false)
      onCreated()
      addToast({ title: "Conversation started" })
    } catch {
      addToast({ title: "Error creating conversation", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs">
          <Plus className="mr-1 h-3 w-3" /> New Conversation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>Start a discussion thread for this case.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Subject */}
          <div className="space-y-1">
            <Label className="text-xs">Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this conversation about?"
              className="text-sm"
            />
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="FYI">FYI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tax years */}
          <div className="space-y-1">
            <Label className="text-xs">Tax Years</Label>
            <div className="flex flex-wrap gap-1">
              {TAX_YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => toggleTaxYear(y)}
                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                    taxYears.includes(y)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Feature area */}
          <div className="space-y-1">
            <Label className="text-xs">Feature Area</Label>
            <Select value={featureArea} onValueChange={setFeatureArea}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_AREAS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* First message */}
          <div className="space-y-1">
            <Label className="text-xs">Message *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="text-sm"
              placeholder="Write the first message..."
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={submitting || !subject.trim() || !message.trim()}
            className="w-full"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
