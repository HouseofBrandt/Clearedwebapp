"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ROLE_LABELS } from "@/types"
import { ChevronDown, ChevronRight } from "lucide-react"

interface ComposeDialogProps {
  open: boolean
  onClose: () => void
  onSent: () => void
  users: { id: string; name: string; role: string }[]
  cases: { id: string; caseNumber: string; clientName: string }[]
  currentUserRole: string
  replyTo?: {
    id: string
    subject: string
    senderId?: string | null
    sender?: { id: string; name: string } | null
  }
}

export function ComposeDialog({
  open,
  onClose,
  onSent,
  users,
  cases,
  currentUserRole,
  replyTo,
}: ComposeDialogProps) {
  const [type, setType] = useState<string>(replyTo ? "DIRECT_MESSAGE" : "DIRECT_MESSAGE")
  const [recipientId, setRecipientId] = useState(replyTo?.senderId || replyTo?.sender?.id || "")
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : "")
  const [body, setBody] = useState("")
  const [priority, setPriority] = useState("NORMAL")
  const [tags, setTags] = useState("")
  const [caseId, setCaseId] = useState("")
  const [showMore, setShowMore] = useState(false)
  const [sending, setSending] = useState(false)

  const isAdmin = currentUserRole === "ADMIN"
  const isBugOrFeature = type === "BUG_REPORT" || type === "FEATURE_REQUEST"
  const isAnnouncement = type === "SYSTEM_ANNOUNCEMENT"

  const handleTypeChange = (newType: string) => {
    setType(newType)
    if (newType === "BUG_REPORT") {
      setRecipientId("admins")
      setPriority("HIGH")
    } else if (newType === "FEATURE_REQUEST") {
      setRecipientId("admins")
      setPriority("NORMAL")
    } else if (newType === "SYSTEM_ANNOUNCEMENT") {
      setRecipientId("all")
    } else {
      if (recipientId === "admins" || recipientId === "all") {
        setRecipientId("")
      }
    }
  }

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return
    if (type === "DIRECT_MESSAGE" && !recipientId) return

    setSending(true)
    try {
      const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean)
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          recipientId: isBugOrFeature ? "admins" : isAnnouncement ? "all" : recipientId,
          subject: subject.trim(),
          body: body.trim(),
          priority,
          tags: tagArray.length > 0 ? tagArray : undefined,
          caseId: caseId || undefined,
          parentId: replyTo?.id,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to send")
      }

      onSent()
    } catch {
      alert("Failed to send message. Please try again.")
    } finally {
      setSending(false)
    }
  }

  const canSend = subject.trim() && body.trim() && (isBugOrFeature || isAnnouncement || recipientId)

  const subjectPlaceholder = type === "BUG_REPORT"
    ? "Describe the issue..."
    : type === "FEATURE_REQUEST"
    ? "What would you like?"
    : "Subject"

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-sm">Type</Label>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT_MESSAGE">Direct Message</SelectItem>
                <SelectItem value="BUG_REPORT">Bug Report</SelectItem>
                <SelectItem value="FEATURE_REQUEST">Feature Request</SelectItem>
                {isAdmin && <SelectItem value="SYSTEM_ANNOUNCEMENT">System Announcement</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* To */}
          <div className="space-y-1.5">
            <Label className="text-sm">To</Label>
            {isBugOrFeature ? (
              <Input value="All Administrators" disabled />
            ) : isAnnouncement ? (
              <Input value="All Users" disabled />
            ) : (
              <Select value={recipientId} onValueChange={setRecipientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span>{u.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-sm">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={subjectPlaceholder}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label className="text-sm">Message</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* More options */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showMore ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            More options
          </button>

          {showMore && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="NORMAL">Normal</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tags</Label>
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="comma, separated"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link to case</Label>
                <Select value={caseId} onValueChange={setCaseId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.caseNumber} — {c.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend || sending}>
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
