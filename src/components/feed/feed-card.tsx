"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { SystemEventCard } from "./system-event-card"
import { FormattedText } from "./formatted-text"
import { TaskCard } from "./task-card"
import { FeedReplyList, ReplyInput } from "./feed-reply"
import { MessageCircle, Copy, Paperclip, Download, Pencil, X, Check, Eye, Bookmark } from "lucide-react"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
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
  return `${days}d ago`
}

/**
 * Renders inline mentions and case tags as styled elements.
 * @mentions -> teal highlight
 * #CaseTags -> clickable links with mono font
 */
function renderContent(content: string, mentions?: any[], caseData?: any): React.ReactNode {
  if (!content) return null

  const parts: React.ReactNode[] = []
  const pattern = /(@\w+(?:\s\w+)?|#[\w-]+|\$[\d,]+(?:\.\d{2})?)/g
  let match
  let lastIndex = 0
  let key = 0

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith("@")) {
      const isJunebug = /^@junebug$/i.test(token)
      parts.push(
        <span
          key={key++}
          className="font-medium"
          style={{
            color: isJunebug ? 'var(--c-warning)' : 'var(--c-teal)',
          }}
        >
          {token}
        </span>
      )
    } else if (token.startsWith("#")) {
      if (caseData) {
        parts.push(
          <Link
            key={key++}
            href={`/cases/${caseData.id}`}
            className="font-mono text-xs font-medium hover:underline"
            style={{ color: 'var(--c-teal)' }}
          >
            {token}
          </Link>
        )
      } else {
        parts.push(
          <span key={key++} className="font-mono text-xs font-medium" style={{ color: 'var(--c-teal)' }}>
            {token}
          </span>
        )
      }
    } else if (token.startsWith("$")) {
      parts.push(
        <span key={key++} className="font-mono tabular-nums">
          {token}
        </span>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : content
}

interface FeedCardProps {
  post: any
  currentUser: any
  onRefresh?: () => void
  onCaseFilter?: (caseId: string) => void
}

export function FeedCard({ post, currentUser, onRefresh, onCaseFilter }: FeedCardProps) {
  const [acknowledged, setAcknowledged] = useState(post.liked || false)
  const [ackCount, setAckCount] = useState(post.likeCount || 0)
  const [saved, setSaved] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content || "")
  const [displayContent, setDisplayContent] = useState(post.content || "")
  const [editSaving, setEditSaving] = useState(false)

  const isAuthor = currentUser?.id === post.authorId
  const isEditableType = (post.postType === "post" || post.postType === "file_share") && post.authorType === "user"
  const canEdit = isAuthor && isEditableType
  const wasEdited = post.updatedAt && post.createdAt && new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 1000

  async function handleSaveEdit() {
    if (!editContent.trim() || editContent === displayContent) {
      setIsEditing(false)
      setEditContent(displayContent)
      return
    }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/feed/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      })
      if (res.ok) {
        setDisplayContent(editContent)
        setIsEditing(false)
      }
    } catch {
      setEditContent(displayContent)
    } finally {
      setEditSaving(false)
    }
  }

  function handleCancelEdit() {
    setEditContent(displayContent)
    setIsEditing(false)
  }

  const handleReplyAdded = useCallback(() => {
    onRefresh?.()
    setShowReplyInput(false)
  }, [onRefresh])

  // System events get compact rendering
  if (post.postType === "system_event") {
    return <SystemEventCard post={post} />
  }

  const isJunebug = post.authorType === "junebug"
  const isTask = post.postType === "task" || post.postType === "task_created" || post.postType === "task_completed"
  const isFileShare = post.postType === "file_share"

  async function handleAcknowledge() {
    const newAck = !acknowledged
    setAcknowledged(newAck)
    setAckCount((c: number) => c + (newAck ? 1 : -1))
    try {
      await fetch(`/api/feed/${post.id}/like`, { method: "POST" })
    } catch {
      setAcknowledged(!newAck)
      setAckCount((c: number) => c + (newAck ? -1 : 1))
    }
  }

  function handleSave() {
    setSaved(!saved)
  }

  function handleCopy() {
    if (post.content) {
      navigator.clipboard.writeText(post.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const attachments = post.attachments as { fileName: string; fileUrl: string; fileType: string; fileSize: number }[] | null

  return (
    <div
      className="rounded-xl border border-[var(--c-gray-100)] p-5 mb-3 transition-colors"
      style={{
        background: isJunebug ? 'rgba(46, 134, 171, 0.03)' : 'var(--c-white)',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {isJunebug ? (
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--c-teal-soft)' }}
          >
            <JunebugIcon className="h-5 w-5" style={{ color: 'var(--c-teal)' }} />
          </div>
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-[10px]" style={{ background: 'var(--c-gray-100)', color: 'var(--c-gray-500)' }}>
              {post.author ? getInitials(post.author.name) : "?"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          {/* Author line */}
          <div className="flex items-center gap-1.5">
            <span
              className="text-sm font-medium"
              style={{
                color: isJunebug ? 'var(--c-teal)' : 'var(--c-gray-700)',
                fontSize: isJunebug ? '13px' : '14px',
              }}
            >
              {isJunebug ? "Junebug" : post.author?.name || "Unknown"}
            </span>
            {post.postType === "task_created" && (
              <span className="text-xs" style={{ color: 'var(--c-gray-300)' }}>created a task</span>
            )}
            {post.postType === "task_completed" && (
              <span className="text-xs" style={{ color: 'var(--c-success)' }}>completed a task</span>
            )}
            {post.postType === "task" && (
              <span className="text-xs" style={{ color: 'var(--c-gray-300)' }}>created a task</span>
            )}
            {isFileShare && (
              <span className="text-xs" style={{ color: 'var(--c-gray-300)' }}>shared a file</span>
            )}
            <span className="text-xs" style={{ color: 'var(--c-gray-300)' }}>
              &middot; {timeAgo(post.createdAt)}
            </span>
            {wasEdited && (
              <span className="italic" style={{ color: 'var(--c-gray-300)', fontSize: '11px' }}>
                (edited)
              </span>
            )}
          </div>

          {/* Task card */}
          {isTask && (
            <div className="mt-2">
              <TaskCard
                post={post}
                currentUserId={currentUser.id}
                onComplete={onRefresh}
              />
            </div>
          )}

          {/* Content — editable inline */}
          {!isTask && (
            <>
              {isEditing ? (
                <div className="mt-1.5">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full text-sm rounded-lg border px-3 py-2 focus:outline-none focus:ring-1 resize-none"
                    style={{
                      borderColor: 'var(--c-gray-100)',
                      background: 'var(--c-snow)',
                      color: 'var(--c-gray-700)',
                    }}
                    rows={Math.max(2, editContent.split("\n").length)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        handleSaveEdit()
                      }
                      if (e.key === "Escape") handleCancelEdit()
                    }}
                  />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSaving || !editContent.trim()}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md text-white disabled:opacity-40"
                      style={{ background: 'var(--c-teal)' }}
                    >
                      <Check className="h-3 w-3" />
                      {editSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={editSaving}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--c-gray-50)]"
                      style={{ color: 'var(--c-gray-300)' }}
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </button>
                    <span className="text-xs ml-1" style={{ color: 'var(--c-gray-300)', fontSize: '10px' }}>
                      Ctrl+Enter to save &middot; Esc to cancel
                    </span>
                  </div>
                </div>
              ) : (
                displayContent && (
                  isJunebug ? (
                    <FormattedText content={displayContent} className="mt-1" />
                  ) : (
                    <div className="mt-1 text-sm whitespace-pre-wrap" style={{ color: 'var(--c-gray-700)', lineHeight: '1.65' }}>
                      {renderContent(displayContent, post.mentions, post.case)}
                    </div>
                  )
                )
              )}
            </>
          )}

          {/* File attachments */}
          {attachments && attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 mr-2"
                  style={{ background: 'var(--c-gray-50)', color: 'var(--c-gray-500)' }}
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{att.fileName}</span>
                  <span style={{ color: 'var(--c-gray-300)' }}>
                    ({(att.fileSize / 1024 / 1024).toFixed(1)} MB)
                  </span>
                  <button
                    onClick={() => window.open(`/api/documents/download?key=${encodeURIComponent(att.fileUrl)}`, "_blank")}
                    style={{ color: 'var(--c-teal)' }}
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actions bar — tiny and quiet */}
          <div className="flex items-center gap-3 mt-2.5">
            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--c-gray-700)]"
              style={{ color: 'var(--c-gray-300)', fontSize: '12px' }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.replyCount > 0 && <span>{post.replyCount}</span>}
            </button>
            <button
              onClick={handleAcknowledge}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{
                color: acknowledged ? 'var(--c-teal)' : 'var(--c-gray-300)',
                fontSize: '12px',
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              {ackCount > 0 && <span>{ackCount}</span>}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{
                color: saved ? 'var(--c-teal)' : 'var(--c-gray-300)',
                fontSize: '12px',
              }}
            >
              <Bookmark className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
            </button>
            {displayContent && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--c-gray-700)]"
                style={{ color: 'var(--c-gray-300)', fontSize: '12px' }}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : ""}
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--c-gray-700)]"
                style={{ color: 'var(--c-gray-300)', fontSize: '12px' }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Replies */}
          <FeedReplyList
            replies={post.replies || []}
            totalReplyCount={post.replyCount || 0}
            postId={post.id}
            onReplyAdded={handleReplyAdded}
          />

          {/* Reply input */}
          {showReplyInput && (
            <ReplyInput postId={post.id} onReplyAdded={handleReplyAdded} />
          )}
        </div>
      </div>
    </div>
  )
}
