"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  Pin,
  PenLine,
  Trash2,
  ChevronDown,
  ChevronUp,
  Paperclip,
  ShieldAlert,
  Phone,
  Building2,
  FileAudio,
  Loader2,
} from "lucide-react"

const NOTE_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  STRATEGY_NOTE: { bg: "bg-slate-900", text: "text-white", label: "Strategy" },
  IRS_CONTACT: { bg: "bg-red-100", text: "text-red-700", label: "IRS Contact" },
  CALL_LOG: { bg: "bg-blue-100", text: "text-blue-700", label: "Call Log" },
  CLIENT_INTERACTION: { bg: "bg-purple-100", text: "text-purple-700", label: "Client" },
  RESEARCH: { bg: "bg-amber-100", text: "text-amber-700", label: "Research" },
  JOURNAL_ENTRY: { bg: "bg-slate-100", text: "text-slate-600", label: "Journal" },
  GENERAL: { bg: "bg-slate-100", text: "text-slate-500", label: "General" },
}

const FEATURE_AREA_LABELS: Record<string, string> = {
  TRANSCRIPT_DECODER: "Transcript Decoder",
  CASE_INTELLIGENCE: "Case Intelligence",
  PENALTY_ABATEMENT: "Penalty Abatement",
  OIC: "OIC",
  COMPLIANCE: "Compliance",
  DEADLINE_TRACKER: "Deadlines",
  GENERAL: "General",
}

interface NoteCardProps {
  note: any
  caseId: string
  currentUserId: string
  onUpdated: () => void
}

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function NoteCard({ note, caseId, currentUserId, onUpdated }: NoteCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(note.content)
  const [editTitle, setEditTitle] = useState(note.title || "")
  const [saving, setSaving] = useState(false)
  const [pinning, setPinning] = useState(false)
  const { addToast } = useToast()

  const isAuthor = note.authorId === currentUserId
  const style = NOTE_TYPE_STYLES[note.noteType] || NOTE_TYPE_STYLES.GENERAL
  const contentPreview = note.content.length > 200 ? note.content.slice(0, 200) + "..." : note.content
  const showExpandToggle = note.content.length > 200

  async function handlePin() {
    setPinning(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/notes/${note.id}/pin`, { method: "POST" })
      if (!res.ok) throw new Error()
      onUpdated()
    } catch {
      addToast({ title: "Error", description: "Failed to toggle pin", variant: "destructive" })
    } finally {
      setPinning(false)
    }
  }

  async function handleSaveEdit() {
    if (editContent.trim().length < 10) {
      addToast({ title: "Content must be at least 10 characters", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim(), title: editTitle.trim() || null }),
      })
      if (!res.ok) throw new Error()
      setEditing(false)
      onUpdated()
      addToast({ title: "Note updated" })
    } catch {
      addToast({ title: "Error", description: "Failed to update note", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this note? This action is reversible by an admin.")) return
    try {
      const res = await fetch(`/api/cases/${caseId}/notes/${note.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      onUpdated()
      addToast({ title: "Note deleted" })
    } catch {
      addToast({ title: "Error", description: "Failed to delete note", variant: "destructive" })
    }
  }

  return (
    <Card className={`transition-all duration-200 hover:border-[var(--c-gray-200)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)] ${note.pinned ? "border-amber-300 bg-amber-50/30" : ""}`}>
      <CardContent className="p-4 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Badge className={`${style.bg} ${style.text} text-[10px] shrink-0`} variant="secondary">
              {style.label}
            </Badge>
            {note.isPrivileged && (
              <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 shrink-0">
                <ShieldAlert className="h-3 w-3 mr-0.5" /> Privileged
              </Badge>
            )}
            {note.title && <span className="font-medium text-sm truncate">{note.title}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handlePin}
              disabled={pinning}
              className={`p-1 rounded hover:bg-muted transition-colors ${note.pinned ? "text-amber-500" : "text-muted-foreground"}`}
              title={note.pinned ? "Unpin" : "Pin"}
            >
              <Pin className="h-3.5 w-3.5" fill={note.pinned ? "currentColor" : "none"} />
            </button>
            {isAuthor && (
              <>
                <button
                  onClick={() => { setEditing(!editing); setEditContent(note.content); setEditTitle(note.title || "") }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                  title="Edit"
                >
                  <PenLine className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Author + timestamp */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{note.author?.name || "Unknown"}</span>
          <span>{timeAgo(note.createdAt)}</span>
          {Math.abs(new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime()) > 2000 && <span className="italic">(edited)</span>}
        </div>

        {/* Call log metadata */}
        {note.noteType === "CALL_LOG" && (note.callDate || note.callDuration || note.callParticipants) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-blue-50 rounded px-2 py-1.5">
            <Phone className="h-3 w-3 shrink-0" />
            {note.callDate && <span>{new Date(note.callDate).toLocaleDateString()}</span>}
            {note.callDuration && <span>{note.callDuration} min</span>}
            {note.callType && <Badge variant="outline" className="text-[9px] py-0">{note.callType}</Badge>}
            {note.callParticipants && <span className="truncate">{note.callParticipants}</span>}
          </div>
        )}

        {/* IRS contact metadata */}
        {note.noteType === "IRS_CONTACT" && (note.irsEmployeeName || note.irsDepartment) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-red-50 rounded px-2 py-1.5">
            <Building2 className="h-3 w-3 shrink-0" />
            {note.irsEmployeeName && <span>Agent: {note.irsEmployeeName}</span>}
            {note.irsEmployeeId && <span>ID: {note.irsEmployeeId}</span>}
            {note.irsDepartment && <span>{note.irsDepartment}</span>}
            {note.irsContactMethod && <Badge variant="outline" className="text-[9px] py-0">{note.irsContactMethod}</Badge>}
          </div>
        )}

        {/* Content */}
        {editing ? (
          <div className="space-y-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full text-sm border rounded px-2 py-1"
            />
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm whitespace-pre-wrap">{expanded ? note.content : contentPreview}</p>
            {showExpandToggle && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-1"
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
              </button>
            )}
          </div>
        )}

        {/* Tags row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {note.taxYears?.length > 0 && note.taxYears.map((y: number) => (
            <Badge key={y} variant="outline" className="text-[10px] py-0">{y}</Badge>
          ))}
          {note.relatedFeature && note.relatedFeature !== "GENERAL" && (
            <Badge variant="outline" className="text-[10px] py-0 bg-slate-50">
              {FEATURE_AREA_LABELS[note.relatedFeature] || note.relatedFeature}
            </Badge>
          )}
          {note.attachments?.length > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" /> {note.attachments.length}
            </span>
          )}
        </div>

        {/* Attachment display */}
        {note.attachments?.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {note.attachments.map((att: any) => (
              <NoteAttachmentDisplay key={att.id} attachment={att} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── NoteAttachmentDisplay sub-component ────────────────────

function NoteAttachmentDisplay({ attachment }: { attachment: any }) {
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)

  const isAudio = attachment.fileType === "AUDIO" ||
    /\.(mp3|mp4|m4a|wav|webm|ogg|flac)$/i.test(attachment.fileName)

  async function fetchTranscript() {
    if (transcript !== null || !attachment.documentId) return
    setLoadingTranscript(true)
    try {
      const res = await fetch(`/api/documents/${attachment.documentId}?meta=true`)
      if (!res.ok) throw new Error()
      const doc = await res.json()
      setTranscript(doc.extractedText || "")
    } catch {
      setTranscript("")
    } finally {
      setLoadingTranscript(false)
    }
  }

  if (isAudio) {
    return (
      <div className="border rounded p-2 bg-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <FileAudio className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-medium truncate">{attachment.fileName}</span>
        </div>
        <audio
          controls
          preload="none"
          className="w-full h-8"
          src={attachment.documentId ? `/api/documents/${attachment.documentId}` : attachment.fileUrl}
        >
          Your browser does not support the audio element.
        </audio>
        {attachment.documentId && (
          <button
            onClick={() => {
              if (!showTranscript) fetchTranscript()
              setShowTranscript(!showTranscript)
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-1"
          >
            {showTranscript ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Transcript
          </button>
        )}
        {showTranscript && (
          <div className="mt-1 p-2 bg-background rounded border text-xs max-h-40 overflow-y-auto">
            {loadingTranscript ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading transcript...</span>
              </div>
            ) : transcript ? (
              <p className="whitespace-pre-wrap">{transcript}</p>
            ) : (
              <p className="text-muted-foreground italic">
                No transcript available. Transcription may still be in progress.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 border rounded px-2 py-1 bg-muted/30">
      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-xs truncate">{attachment.fileName}</span>
    </div>
  )
}
