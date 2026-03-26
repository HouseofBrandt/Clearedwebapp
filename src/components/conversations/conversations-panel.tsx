"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { NewConversationDialog } from "@/components/conversations/new-conversation-dialog"
import {
  Loader2,
  MessageSquare,
  CheckCircle,
  Archive,
  Send,
  Trash2,
  PenLine,
  User,
  Paperclip,
  X,
  FileAudio,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  OPEN: { bg: "bg-c-success-soft", text: "text-c-success", label: "Open" },
  RESOLVED: { bg: "bg-c-info-soft", text: "text-c-teal", label: "Resolved" },
  ARCHIVED: { bg: "bg-c-gray-100", text: "text-c-gray-500", label: "Archived" },
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  NORMAL: { bg: "bg-c-gray-100", text: "text-c-gray-500", label: "Normal" },
  URGENT: { bg: "bg-c-danger-soft", text: "text-c-danger", label: "Urgent" },
  FYI: { bg: "bg-c-warning-soft", text: "text-c-warning", label: "FYI" },
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

interface ConversationsPanelProps {
  caseId: string
  currentUserId: string
  currentUserRole: string
}

export function ConversationsPanel({ caseId, currentUserId, currentUserRole }: ConversationsPanelProps) {
  const [conversations, setConversations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [priorityFilter, setPriorityFilter] = useState("ALL")
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [selectedConv, setSelectedConv] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [editingSubject, setEditingSubject] = useState(false)
  const [editSubjectText, setEditSubjectText] = useState("")
  // Attachment state
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ documentId: string; fileName: string; fileType: string }>>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "ALL") params.set("status", statusFilter)
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter)
      const res = await fetch(`/api/cases/${caseId}/conversations?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setConversations(data.conversations || data)
    } catch {
      addToast({ title: "Error loading conversations", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [caseId, statusFilter, priorityFilter, addToast])

  const fetchMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true)
    try {
      const [convRes, msgRes] = await Promise.all([
        fetch(`/api/cases/${caseId}/conversations/${convId}`),
        fetch(`/api/cases/${caseId}/conversations/${convId}/messages`),
      ])
      if (!convRes.ok || !msgRes.ok) throw new Error()
      const convData = await convRes.json()
      const msgData = await msgRes.json()
      setSelectedConv(convData)
      setMessages(msgData.messages || [])
      setEditSubjectText(convData.subject || "")
    } catch {
      addToast({ title: "Error loading messages", variant: "destructive" })
    } finally {
      setLoadingMessages(false)
    }
  }, [caseId, addToast])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId)
    }
  }, [selectedConvId, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("caseId", caseId)
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
      if (!res.ok) throw new Error()
      const doc = await res.json()
      setPendingAttachments((prev) => [
        ...prev,
        { documentId: doc.id, fileName: doc.fileName, fileType: doc.fileType || doc.detectedFileType },
      ])
      addToast({ title: "File attached" })
    } catch {
      addToast({ title: "Error uploading file", variant: "destructive" })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function removeAttachment(documentId: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.documentId !== documentId))
  }

  async function handleSendReply() {
    if ((!replyText.trim() && pendingAttachments.length === 0) || !selectedConvId) return
    setSending(true)
    try {
      const body: any = { content: replyText.trim() || "(attachment)" }
      if (pendingAttachments.length > 0) {
        body.attachmentIds = pendingAttachments.map((a) => a.documentId)
      }
      const res = await fetch(`/api/cases/${caseId}/conversations/${selectedConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setReplyText("")
      setPendingAttachments([])
      fetchMessages(selectedConvId)
      fetchConversations()
    } catch {
      addToast({ title: "Error sending message", variant: "destructive" })
    } finally {
      setSending(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!selectedConvId) return
    try {
      const res = await fetch(`/api/cases/${caseId}/conversations/${selectedConvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      fetchMessages(selectedConvId)
      fetchConversations()
      addToast({ title: `Conversation ${newStatus.toLowerCase()}` })
    } catch {
      addToast({ title: "Error updating conversation", variant: "destructive" })
    }
  }

  async function handleEditSubject() {
    if (!selectedConvId || !editSubjectText.trim()) return
    try {
      const res = await fetch(`/api/cases/${caseId}/conversations/${selectedConvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: editSubjectText.trim() }),
      })
      if (!res.ok) throw new Error()
      setEditingSubject(false)
      fetchMessages(selectedConvId)
      fetchConversations()
      addToast({ title: "Subject updated" })
    } catch {
      addToast({ title: "Error updating subject", variant: "destructive" })
    }
  }

  async function handleDeleteMessage(msgId: string) {
    if (!selectedConvId) return
    if (!confirm("Delete this message?")) return
    try {
      const res = await fetch(`/api/cases/${caseId}/conversations/${selectedConvId}/messages/${msgId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      fetchMessages(selectedConvId)
      addToast({ title: "Message deleted" })
    } catch {
      addToast({ title: "Error deleting message", variant: "destructive" })
    }
  }

  const statusFilters = [
    { value: "ALL", label: "All" },
    { value: "OPEN", label: "Open" },
    { value: "RESOLVED", label: "Resolved" },
    { value: "ARCHIVED", label: "Archived" },
  ]

  const priorityFilters = [
    { value: "ALL", label: "All" },
    { value: "URGENT", label: "Urgent" },
    { value: "NORMAL", label: "Normal" },
    { value: "FYI", label: "FYI" },
  ]

  return (
    <div className="flex gap-0 h-[calc(100vh-14rem)] border rounded-lg overflow-hidden">
      {/* Left panel — Conversation list (35%) */}
      <div className="flex-[35] border-r flex flex-col min-w-[240px]">
        {/* Header */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Conversations</h3>
            <NewConversationDialog caseId={caseId} onCreated={() => { fetchConversations(); }} />
          </div>
          {/* Status filter */}
          <div className="flex gap-1 flex-wrap">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Priority filter */}
          <div className="flex gap-1 flex-wrap">
            {priorityFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setPriorityFilter(f.value)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                  priorityFilter === f.value
                    ? "bg-c-gray-700 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No conversations yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((conv) => {
                const status = STATUS_STYLES[conv.status] || STATUS_STYLES.OPEN
                const priority = PRIORITY_STYLES[conv.priority] || PRIORITY_STYLES.NORMAL
                const isSelected = selectedConvId === conv.id
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left px-3 py-2.5 transition-all duration-200 hover:bg-muted/50 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)] ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge className={`${status.bg} ${status.text} text-[9px] py-0`} variant="secondary">
                            {status.label}
                          </Badge>
                          {conv.priority !== "NORMAL" && (
                            <Badge className={`${priority.bg} ${priority.text} text-[9px] py-0`} variant="secondary">
                              {priority.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{conv.subject}</p>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {conv.lastMessage.author?.name}: {conv.lastMessage.content?.slice(0, 80)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span>{conv.startedBy?.name || "Unknown"}</span>
                          <span>{timeAgo(conv.updatedAt || conv.createdAt)}</span>
                          {conv.messageCount > 0 && (
                            <span>{conv.messageCount} msg{conv.messageCount !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — Thread view (65%) */}
      <div className="flex-[65] flex flex-col">
        {!selectedConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mt-3">Select a conversation to view</p>
          </div>
        ) : loadingMessages ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedConv ? (
          <>
            {/* Thread header */}
            <div className="p-3 border-b space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {editingSubject ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editSubjectText}
                        onChange={(e) => setEditSubjectText(e.target.value)}
                        className="h-7 text-sm font-medium"
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={handleEditSubject}>Save</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingSubject(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{selectedConv.subject}</h3>
                      <button
                        onClick={() => setEditingSubject(true)}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                      >
                        <PenLine className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`${STATUS_STYLES[selectedConv.status]?.bg} ${STATUS_STYLES[selectedConv.status]?.text} text-[9px]`} variant="secondary">
                      {STATUS_STYLES[selectedConv.status]?.label}
                    </Badge>
                    <Badge className={`${PRIORITY_STYLES[selectedConv.priority]?.bg} ${PRIORITY_STYLES[selectedConv.priority]?.text} text-[9px]`} variant="secondary">
                      {PRIORITY_STYLES[selectedConv.priority]?.label}
                    </Badge>
                    {selectedConv.relatedTaxYears?.map((y: number) => (
                      <Badge key={y} variant="outline" className="text-[9px] py-0">{y}</Badge>
                    ))}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex gap-1 shrink-0">
                  {selectedConv.status === "OPEN" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleStatusChange("RESOLVED")}
                    >
                      <CheckCircle className="mr-1 h-3 w-3" /> Resolve
                    </Button>
                  )}
                  {selectedConv.status === "RESOLVED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleStatusChange("OPEN")}
                    >
                      Reopen
                    </Button>
                  )}
                  {selectedConv.status !== "ARCHIVED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => handleStatusChange("ARCHIVED")}
                    >
                      <Archive className="mr-1 h-3 w-3" /> Archive
                    </Button>
                  )}
                </div>
              </div>
              {/* Participants */}
              {selectedConv.participants?.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  Participants: {selectedConv.participants.length} participant(s)
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg) => {
                const isOwn = msg.authorId === currentUserId
                return (
                  <div key={msg.id} className={`group flex gap-2 ${msg.isDeleted ? "opacity-50" : ""}`}>
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                      {msg.author?.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{msg.author?.name || "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(msg.createdAt)}</span>
                        {msg.isEdited && <span className="text-[10px] text-muted-foreground italic">(edited)</span>}
                        {isOwn && !msg.isDeleted && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {msg.isDeleted ? (
                        <p className="text-xs italic text-muted-foreground mt-0.5">This message was deleted.</p>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap mt-0.5">{msg.content}</p>
                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {msg.attachments.map((att: any) => (
                                <MessageAttachment key={att.id} attachment={att} />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            {selectedConv.status !== "ARCHIVED" && (
              <div className="p-3 border-t">
                {/* Pending attachments */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {pendingAttachments.map((att) => (
                      <div
                        key={att.documentId}
                        className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs"
                      >
                        {att.fileType === "AUDIO" ? (
                          <FileAudio className="h-3 w-3 text-c-teal" />
                        ) : (
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="max-w-[120px] truncate">{att.fileName}</span>
                        <button
                          onClick={() => removeAttachment(att.documentId)}
                          className="p-0.5 rounded hover:bg-background"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a reply..."
                      rows={2}
                      className="text-sm flex-1 resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleSendReply()
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 self-end">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac,.pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      title="Attach file"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Paperclip className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={handleSendReply}
                      disabled={sending || (!replyText.trim() && pendingAttachments.length === 0)}
                      className="h-9 w-9 p-0"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter to send</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── MessageAttachment sub-component ────────────────────────

function MessageAttachment({ attachment }: { attachment: any }) {
  const [showTranscript, setShowTranscript] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)
  const isAudio = attachment.fileType === "AUDIO" ||
    /\.(mp3|mp4|m4a|wav|webm|ogg|flac)$/i.test(attachment.fileName)

  async function fetchTranscript() {
    if (transcript !== null || !attachment.documentId) return
    setLoadingTranscript(true)
    try {
      // Fetch the document record to get extractedText
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
      <div className="border rounded p-2 bg-muted/30 max-w-sm">
        <div className="flex items-center gap-1.5 mb-1">
          <FileAudio className="h-3.5 w-3.5 text-c-teal" />
          <span className="text-xs font-medium truncate">{attachment.fileName}</span>
        </div>
        {/* Audio player */}
        <audio
          controls
          preload="none"
          className="w-full h-8 [&::-webkit-media-controls-panel]:bg-muted"
          src={`/api/documents/${attachment.documentId || "unknown"}`}
        >
          Your browser does not support the audio element.
        </audio>
        {/* Transcript toggle */}
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

  // Non-audio attachment
  return (
    <div className="flex items-center gap-1.5 border rounded px-2 py-1 bg-muted/30 max-w-sm">
      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-xs truncate">{attachment.fileName}</span>
    </div>
  )
}
