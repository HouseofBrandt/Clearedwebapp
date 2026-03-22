"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Inbox, Clock, ClipboardCheck, CheckCircle2, XCircle,
  Bug, Lightbulb, MessageSquare, Megaphone, ArrowLeft,
  ArchiveX, Reply, ExternalLink, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MESSAGE_TYPE_LABELS, MESSAGE_TYPE_COLORS, MESSAGE_PRIORITY_LABELS } from "@/types"
import { ComposeDialog } from "./compose-dialog"
import { ExportDialog } from "./message-detail"
import { useToast } from "@/components/ui/toast"

interface MessageData {
  id: string
  type: string
  priority: string
  subject: string
  body: string
  senderId?: string | null
  senderName?: string | null
  sender?: { id: string; name: string } | null
  recipientId: string
  read: boolean
  readAt?: string | null
  archived: boolean
  caseId?: string | null
  case?: { id: string; tabsNumber: string } | null
  deadlineId?: string | null
  aiTaskId?: string | null
  parentId?: string | null
  tags: string[]
  implementationStatus?: string | null
  implementationNotes?: string | null
  implementedAt?: string | null
  implementedBy?: { name: string } | null
  createdAt: string
}

interface InboxListProps {
  initialMessages: MessageData[]
  initialUnreadCount: number
  currentUserId: string
  currentUserRole: string
  users: { id: string; name: string; role: string }[]
  cases: { id: string; tabsNumber: string; clientName: string }[]
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  DEADLINE_REMINDER: Clock,
  REVIEW_ASSIGNED: ClipboardCheck,
  TASK_APPROVED: CheckCircle2,
  TASK_REJECTED: XCircle,
  BUG_REPORT: Bug,
  FEATURE_REQUEST: Lightbulb,
  DIRECT_MESSAGE: MessageSquare,
  SYSTEM_ANNOUNCEMENT: Megaphone,
  CASE_NOTE: MessageSquare,
}

const TYPE_ICON_COLORS: Record<string, string> = {
  TASK_APPROVED: "text-green-500",
  TASK_REJECTED: "text-red-500",
  DEADLINE_REMINDER: "text-amber-500",
  BUG_REPORT: "text-red-400",
  FEATURE_REQUEST: "text-purple-400",
}

const BORDER_COLORS: Record<string, string> = {
  BUG_REPORT: "border-l-red-400",
  FEATURE_REQUEST: "border-l-purple-400",
  DIRECT_MESSAGE: "border-l-blue-400",
  DEADLINE_REMINDER: "border-l-amber-400",
  REVIEW_ASSIGNED: "border-l-blue-400",
  TASK_APPROVED: "border-l-green-400",
  TASK_REJECTED: "border-l-red-400",
  SYSTEM_ANNOUNCEMENT: "border-l-gray-400",
  CASE_NOTE: "border-l-gray-400",
}

type FilterType = "ALL" | "UNREAD" | "BUGS_AND_FEATURES" | "NOTIFICATIONS"

import { formatDate, formatRelative, formatDateTime } from "@/lib/date-utils"

export function InboxList({
  initialMessages,
  initialUnreadCount,
  currentUserId,
  currentUserRole,
  users,
  cases,
}: InboxListProps) {
  const [messages, setMessages] = useState<MessageData[]>(initialMessages)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>("ALL")
  const [showCompose, setShowCompose] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  const isAdmin = currentUserRole === "ADMIN"
  const [refreshing, setRefreshing] = useState(false)

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, 30000)
    return () => clearInterval(interval)
  }, [router])

  const selected = messages.find((m) => m.id === selectedId) || null

  const filteredMessages = messages.filter((m) => {
    if (filter === "UNREAD") return !m.read
    if (filter === "BUGS_AND_FEATURES") return m.type === "BUG_REPORT" || m.type === "FEATURE_REQUEST"
    if (filter === "NOTIFICATIONS") {
      return ["DEADLINE_REMINDER", "REVIEW_ASSIGNED", "TASK_APPROVED", "TASK_REJECTED", "SYSTEM_ANNOUNCEMENT"].includes(m.type)
    }
    return true
  })

  const markAsRead = useCallback(async (msg: MessageData) => {
    if (msg.read) return
    try {
      await fetch(`/api/messages/${msg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      })
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, read: true, readAt: new Date().toISOString() } : m))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch { /* ignore */ }
  }, [])

  const archiveMessage = useCallback(async (msgId: string) => {
    try {
      await fetch(`/api/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      })
      const msg = messages.find((m) => m.id === msgId)
      if (msg && !msg.read) setUnreadCount((c) => Math.max(0, c - 1))
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      if (selectedId === msgId) setSelectedId(null)
      addToast({ title: "Message archived" })
    } catch {
      addToast({ title: "Failed to archive", variant: "destructive" })
    }
  }, [messages, selectedId, addToast])

  const selectMessage = useCallback((msg: MessageData) => {
    setSelectedId(msg.id)
    markAsRead(msg)
  }, [markAsRead])

  const handleComposeSent = () => {
    setShowCompose(false)
    addToast({ title: "Message sent" })
    router.refresh()
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "UNREAD", label: "Unread" },
    { key: "BUGS_AND_FEATURES", label: "Bugs & Features" },
    { key: "NOTIFICATIONS", label: "Notifications" },
  ]

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 overflow-hidden">
      {/* Left panel — message list */}
      <div className={`flex w-full flex-col border-r lg:w-[380px] ${selectedId ? "hidden lg:flex" : "flex"}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Inbox</h1>
            {unreadCount > 0 && (
              <span className="text-sm text-muted-foreground">({unreadCount} unread)</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setRefreshing(true)
              router.refresh()
              setTimeout(() => setRefreshing(false), 1000)
            }}
            title="Refresh inbox"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 border-b px-4 py-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground/60">Messages and notifications will appear here.</p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const Icon = TYPE_ICONS[msg.type] || MessageSquare
              const iconColor = TYPE_ICON_COLORS[msg.type] || "text-muted-foreground"
              const isSelected = selectedId === msg.id
              return (
                <button
                  key={msg.id}
                  onClick={() => selectMessage(msg)}
                  className={`flex w-full items-start gap-3 border-b border-l-[3px] px-4 py-3 text-left transition-colors ${
                    isSelected ? "bg-muted/60" : msg.read ? "border-l-transparent hover:bg-muted/30" : `${BORDER_COLORS[msg.type] || "border-l-primary"} bg-primary/5 hover:bg-primary/10`
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`truncate text-sm ${msg.read ? "font-normal" : "font-medium"}`}>
                      {msg.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatRelative(msg.createdAt)}
                      {" · "}
                      {msg.sender?.name || msg.senderName || MESSAGE_TYPE_LABELS[msg.type] || "System"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(msg.priority === "HIGH" || msg.priority === "URGENT") && (
                      <span className={`h-2 w-2 rounded-full ${msg.priority === "URGENT" ? "bg-red-500" : "bg-orange-500"}`} />
                    )}
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Bottom buttons */}
        <div className="flex items-center justify-between border-t px-4 py-2">
          <Button size="sm" onClick={() => setShowCompose(true)}>
            Compose
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setShowExport(true)}>
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Right panel — message detail */}
      <div className={`flex flex-1 flex-col ${selectedId ? "flex" : "hidden lg:flex"}`}>
        {selected ? (
          <MessageDetail
            message={selected}
            isAdmin={isAdmin}
            onBack={() => setSelectedId(null)}
            onArchive={() => archiveMessage(selected.id)}
            onReply={() => setShowCompose(true)}
            onUpdateMessage={(updated) => {
              setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m))
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Select a message to read</p>
          </div>
        )}
      </div>

      {showCompose && (
        <ComposeDialog
          open={showCompose}
          onClose={() => setShowCompose(false)}
          onSent={handleComposeSent}
          users={users}
          cases={cases}
          currentUserRole={currentUserRole}
          replyTo={selected?.type === "DIRECT_MESSAGE" ? selected : undefined}
        />
      )}

      {showExport && (
        <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Message Detail (inline)
// -------------------------------------------------------------------
const IMPL_STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  implemented: "bg-green-100 text-green-800",
  wont_fix: "bg-gray-100 text-gray-700",
  duplicate: "bg-gray-100 text-gray-700",
}

const IMPL_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  implemented: "Implemented",
  wont_fix: "Won't Fix",
  duplicate: "Duplicate",
}

function MessageDetail({
  message,
  isAdmin,
  onBack,
  onArchive,
  onReply,
  onUpdateMessage,
}: {
  message: MessageData
  isAdmin: boolean
  onBack: () => void
  onArchive: () => void
  onReply: () => void
  onUpdateMessage: (updated: Partial<MessageData> & { id: string }) => void
}) {
  const dateStr = formatDateTime(message.createdAt, { month: "long" })

  const typeColor = MESSAGE_TYPE_COLORS[message.type] || "bg-gray-100 text-gray-800"
  const borderColor = BORDER_COLORS[message.type] || "border-l-gray-400"

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Detail header */}
      <div className={`border-b border-l-4 ${borderColor} px-6 py-4`}>
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="mt-1 lg:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">{message.subject}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>From {message.sender?.name || message.senderName || "System"}</span>
              <span>·</span>
              <span>{dateStr}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColor}`}>
                {MESSAGE_TYPE_LABELS[message.type] || message.type}
              </span>
              {message.priority !== "NORMAL" && (
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  message.priority === "URGENT" ? "bg-red-100 text-red-800" :
                  message.priority === "HIGH" ? "bg-orange-100 text-orange-800" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {MESSAGE_PRIORITY_LABELS[message.priority] || message.priority}
                </span>
              )}
              {message.tags.map((tag) => (
                <span key={tag} className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</div>

        {/* Linked entities */}
        <div className="mt-6 space-y-2">
          {message.case && (
            <a
              href={`/cases/${message.case.id}`}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Linked to case {message.case.tabsNumber}
            </a>
          )}
        </div>

        {/* Implementation status for bugs & features */}
        {(message.type === "BUG_REPORT" || message.type === "FEATURE_REQUEST") && (
          <div className="mt-6 border-t pt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Implementation Status
            </p>
            {isAdmin ? (
              <div className="flex items-center gap-3">
                <Select
                  value={message.implementationStatus || "open"}
                  onValueChange={async (v) => {
                    const res = await fetch(`/api/messages/${message.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ implementationStatus: v }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      onUpdateMessage({
                        id: message.id,
                        implementationStatus: data.implementationStatus,
                        implementedAt: data.implementedAt,
                        implementedBy: data.implementedBy,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                    <SelectItem value="wont_fix">Won&apos;t Fix</SelectItem>
                    <SelectItem value="duplicate">Duplicate</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Notes (e.g., deployed 3/20)"
                  className="h-8 text-xs flex-1"
                  defaultValue={message.implementationNotes || ""}
                  onBlur={async (e) => {
                    const val = e.target.value
                    if (val !== (message.implementationNotes || "")) {
                      await fetch(`/api/messages/${message.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ implementationNotes: val }),
                      })
                      onUpdateMessage({ id: message.id, implementationNotes: val })
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${IMPL_STATUS_COLORS[message.implementationStatus || "open"]}`}>
                  {IMPL_STATUS_LABELS[message.implementationStatus || "open"]}
                </span>
                {message.implementationNotes && (
                  <span className="text-xs text-muted-foreground">{message.implementationNotes}</span>
                )}
              </div>
            )}
            {message.implementedAt && message.implementedBy && (
              <p className="text-xs text-muted-foreground">
                Marked implemented by {message.implementedBy.name} on {formatDate(message.implementedAt)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t px-6 py-3">
        {message.type === "DIRECT_MESSAGE" && (
          <Button variant="outline" size="sm" onClick={onReply}>
            <Reply className="mr-1.5 h-4 w-4" />
            Reply
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onArchive}>
          <ArchiveX className="mr-1.5 h-4 w-4" />
          Archive
        </Button>
      </div>
    </div>
  )
}
