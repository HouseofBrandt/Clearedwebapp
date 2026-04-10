"use client"

import { useState, useRef, useCallback } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { MentionAutocomplete, useMentionDetection } from "./mention-autocomplete"
import { PenLine, CheckSquare, Paperclip, Send, X, Loader2, Flag } from "lucide-react"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

type ComposerMode = "post" | "task" | "file"

interface FeedComposerProps {
  currentUser: any
  cases?: { id: string; tabsNumber: string; clientName: string }[]
  users?: { id: string; name: string }[]
  preselectedCaseId?: string
  onPostCreated?: () => void
}

export function FeedComposer({
  currentUser,
  cases = [],
  users = [],
  preselectedCaseId,
  onPostCreated,
}: FeedComposerProps) {
  const [mode, setMode] = useState<ComposerMode>("post")
  const [content, setContent] = useState("")
  const [caseId, setCaseId] = useState(preselectedCaseId || "")
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Task mode fields
  const [taskTitle, setTaskTitle] = useState("")
  const [taskAssigneeId, setTaskAssigneeId] = useState("")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskPriority, setTaskPriority] = useState<string>("normal")

  // File mode
  const [attachments, setAttachments] = useState<{ fileName: string; fileUrl: string; fileType: string; fileSize: number }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mention autocomplete
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [cursorPos, setCursorPos] = useState(0)
  const mentionState = useMentionDetection(content, cursorPos)
  const [mentions, setMentions] = useState<{ type: "user" | "junebug" | "case"; id?: string; display: string }[]>([])

  const handleMentionSelect = useCallback(
    (suggestion: { type: "user" | "junebug" | "case"; id?: string; display: string; label: string }) => {
      if (!mentionState) return
      const before = content.slice(0, mentionState.startIndex)
      const after = content.slice(cursorPos)
      const newContent = before + suggestion.display + " " + after
      setContent(newContent)
      setMentions((prev) => [...prev, { type: suggestion.type, id: suggestion.id, display: suggestion.display }])

      if (suggestion.type === "case" && suggestion.id) {
        setCaseId(suggestion.id)
      }
    },
    [mentionState, cursorPos, content]
  )

  function handleAskJunebug() {
    if (!content.startsWith("@Junebug ")) {
      setContent("@Junebug " + content)
    }
    setMentions((prev) => {
      if (prev.some((m) => m.type === "junebug")) return prev
      return [...prev, { type: "junebug", display: "@Junebug" }]
    })
    setExpanded(true)
    textareaRef.current?.focus()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/feed/upload", { method: "POST", body: formData })
        if (res.ok) {
          const data = await res.json()
          setAttachments((prev) => [...prev, data])
        }
      }
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setContent("")
    setCaseId(preselectedCaseId || "")
    setTaskTitle("")
    setTaskAssigneeId("")
    setTaskDueDate("")
    setTaskPriority("normal")
    setAttachments([])
    setMentions([])
    setExpanded(false)
    setMode("post")
  }

  async function handleSubmit() {
    if (sending) return

    if (mode === "task") {
      if (!taskTitle.trim() || !taskAssigneeId) return
    } else {
      if (!content.trim() && attachments.length === 0) return
    }

    setSending(true)
    try {
      if (mode === "task") {
        const res = await fetch("/api/feed/task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskTitle: taskTitle.trim(),
            content: content.trim() || undefined,
            caseId: caseId || undefined,
            taskAssigneeId,
            taskDueDate: taskDueDate || undefined,
            priority: taskPriority !== "normal" ? taskPriority : undefined,
          }),
        })
        if (res.ok) {
          reset()
          onPostCreated?.()
        }
      } else {
        const postType = attachments.length > 0 ? "file_share" : "post"
        const trimmedContent = content.trim()
        const postMentions = mentions.length > 0 ? mentions : undefined
        const res = await fetch("/api/feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postType,
            content: trimmedContent,
            caseId: caseId || undefined,
            mentions: postMentions,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        })
        if (res.ok) {
          const data = await res.json().catch(() => null)

          // If the post tagged @Junebug, the server created a placeholder
          // reply and returned its ID. We now fire a SEPARATE request to
          // /api/feed/[postId]/junebug-complete to run the AI in its own
          // lambda (which has maxDuration = 60). This is fire-and-forget
          // from the client's perspective but synchronous server-side —
          // the fresh lambda instance gets its full time budget and
          // reliably finishes the Anthropic call.
          if (data?.id && data?.junebugPlaceholderId) {
            fetch(`/api/feed/${data.id}/junebug-complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                placeholderId: data.junebugPlaceholderId,
                message: trimmedContent,
                caseId: caseId || null,
              }),
            }).catch((err) => {
              // Client-side failure is non-fatal — the stale placeholder
              // sweeper on the feed GET will clear it if the server never
              // receives this trigger.
              console.error("[Junebug] trigger failed:", err)
            })
          }

          reset()
          onPostCreated?.()
        }
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="rounded-xl border border-[var(--c-gray-100)] transition-all"
      style={{ background: expanded ? 'var(--c-white)' : 'var(--c-snow)' }}
    >
      {/* Compact view when not expanded */}
      {!expanded ? (
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-text"
          onClick={() => { setExpanded(true); setTimeout(() => textareaRef.current?.focus(), 0) }}
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px]" style={{ background: 'var(--c-gray-100)', color: 'var(--c-gray-500)' }}>
              {getInitials(currentUser.name || "U")}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm" style={{ color: 'var(--c-gray-300)' }}>Add a note, task, or update...</span>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Mode tabs — small pills */}
          <div className="flex items-center gap-1">
            {(
              [
                { key: "post", icon: PenLine, label: "Post" },
                { key: "task", icon: CheckSquare, label: "Task" },
                { key: "file", icon: Paperclip, label: "File" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors"
                style={{
                  background: mode === key ? 'var(--c-teal-soft)' : 'transparent',
                  color: mode === key ? 'var(--c-teal)' : 'var(--c-gray-300)',
                }}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Task-specific fields */}
          {mode === "task" && (
            <div className="space-y-2">
              <Input
                placeholder="Task title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="h-8 text-sm rounded-lg border-[var(--c-gray-100)]"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={taskAssigneeId} onValueChange={setTaskAssigneeId}>
                    <SelectTrigger className="h-8 text-sm border-[var(--c-gray-100)]">
                      <SelectValue placeholder="Assign to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="h-8 text-sm w-40 border-[var(--c-gray-100)]"
                  placeholder="Due date"
                />
              </div>
              <div className="flex gap-2">
                <Select value={taskPriority} onValueChange={setTaskPriority}>
                  <SelectTrigger className="h-8 text-sm w-32 border-[var(--c-gray-100)]">
                    <Flag className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Text area */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setCursorPos(e.target.selectionStart || 0)
              }}
              onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || 0)}
              onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !mentionState?.active) {
                  if (mode !== "task" || taskTitle.trim()) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }
              }}
              placeholder={
                mode === "task"
                  ? "Task details (optional)..."
                  : mode === "file"
                    ? "Add a caption..."
                    : "Add a note, task, or update... Use @ to mention, # to tag a case"
              }
              rows={3}
              className="w-full resize-none bg-transparent text-sm outline-none leading-relaxed"
              style={{ color: 'var(--c-gray-700)' }}
            />

            {/* Mention autocomplete */}
            {mentionState?.active && (
              <MentionAutocomplete
                query={mentionState.query}
                triggerChar={mentionState.triggerChar}
                position={{ top: -8, left: 0 }}
                onSelect={handleMentionSelect}
                onDismiss={() => setCursorPos(0)}
              />
            )}
          </div>

          {/* File upload area */}
          {mode === "file" && (
            <div
              className="border border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors"
              style={{ borderColor: 'var(--c-gray-200)', background: 'var(--c-snow)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--c-gray-300)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--c-gray-300)' }}>Click or drag to upload files</p>
              )}
            </div>
          )}

          {/* Attached files preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                  style={{ background: 'var(--c-gray-50)', color: 'var(--c-gray-500)' }}
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[150px]">{att.fileName}</span>
                  <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--c-gray-100)]">
            <div className="flex items-center gap-2">
              {/* Case selector */}
              <Select value={caseId || "__none__"} onValueChange={(v) => setCaseId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs w-40 border-[var(--c-gray-100)]">
                  <SelectValue placeholder="Tag a case..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No case</SelectItem>
                  {cases.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.clientName || c.tabsNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Ask Junebug button */}
              {mode === "post" && (
                <button
                  onClick={handleAskJunebug}
                  className="flex items-center gap-1 text-xs transition-colors hover:text-c-warning"
                  style={{ color: 'var(--c-gray-300)' }}
                >
                  <JunebugIcon className="h-4 w-4" /> Ask Junebug
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={reset}
                className="text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--c-gray-50)]"
                style={{ color: 'var(--c-gray-300)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  sending ||
                  (mode === "task" ? !taskTitle.trim() || !taskAssigneeId : !content.trim() && attachments.length === 0)
                }
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40"
                style={{ background: 'var(--c-teal)' }}
              >
                {sending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                {mode === "task" ? "Create Task" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
