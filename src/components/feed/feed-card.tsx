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
import { Heart, MessageCircle, Copy, Paperclip, Download, Smile, Pencil, X, Check } from "lucide-react"

const QUICK_REACTIONS = [
  { emoji: "\uD83D\uDC4D", type: "thumbsup" },
  { emoji: "\u2705", type: "check" },
  { emoji: "\uD83D\uDE4F", type: "pray" },
  { emoji: "\uD83D\uDCA1", type: "idea" },
  { emoji: "\uD83D\uDD25", type: "fire" },
]

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
 * @mentions -> blue highlight
 * #CaseTags -> clickable links
 */
function renderContent(content: string, mentions?: any[], caseData?: any): React.ReactNode {
  if (!content) return null

  const parts: React.ReactNode[] = []
  const pattern = /(@\w+(?:\s\w+)?|#[\w-]+)/g
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
          className={`${
            isJunebug
              ? "text-amber-600 dark:text-amber-400 font-medium"
              : "text-primary font-medium bg-primary/5 rounded px-0.5"
          }`}
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
            className="text-primary font-medium hover:underline"
          >
            {token}
          </Link>
        )
      } else {
        parts.push(
          <span key={key++} className="text-primary font-medium">
            {token}
          </span>
        )
      }
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
  const [liked, setLiked] = useState(post.liked || false)
  const [likeCount, setLikeCount] = useState(post.likeCount || 0)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [myReactions, setMyReactions] = useState<string[]>(post.myReactions || [])
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
      // revert
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

  async function handleLike() {
    const newLiked = !liked
    setLiked(newLiked)
    setLikeCount((c: number) => c + (newLiked ? 1 : -1))
    try {
      await fetch(`/api/feed/${post.id}/like`, { method: "POST" })
    } catch {
      setLiked(!newLiked)
      setLikeCount((c: number) => c + (newLiked ? -1 : 1))
    }
  }

  async function handleReaction(type: string) {
    const hasReaction = myReactions.includes(type)
    if (hasReaction) {
      setMyReactions((prev) => prev.filter((r) => r !== type))
    } else {
      setMyReactions((prev) => [...prev, type])
    }
    setShowReactions(false)
    try {
      await fetch(`/api/feed/${post.id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
    } catch {
      // Revert
      if (hasReaction) {
        setMyReactions((prev) => [...prev, type])
      } else {
        setMyReactions((prev) => prev.filter((r) => r !== type))
      }
    }
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
    <div className="px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3">
        {isJunebug ? (
          <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <JunebugIcon className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </div>
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {post.author ? getInitials(post.author.name) : "?"}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          {/* Author line */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">
              {isJunebug ? "Junebug" : post.author?.name || "Unknown"}
            </span>
            {post.postType === "task_created" && (
              <span className="text-sm text-muted-foreground">created a task</span>
            )}
            {post.postType === "task_completed" && (
              <span className="text-sm text-green-600">completed a task</span>
            )}
            {post.postType === "task" && (
              <span className="text-sm text-muted-foreground">created a task</span>
            )}
            {isFileShare && (
              <span className="text-sm text-muted-foreground">shared a file</span>
            )}
            <span className="text-xs text-muted-foreground">
              · {timeAgo(post.createdAt)}
            </span>
            {wasEdited && (
              <span className="text-xs text-muted-foreground italic">
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
                    className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
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
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleSaveEdit}
                      disabled={editSaving || !editContent.trim()}
                      className="h-7 text-xs px-2.5"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {editSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEdit}
                      disabled={editSaving}
                      className="h-7 text-xs px-2.5"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      Ctrl+Enter to save · Esc to cancel
                    </span>
                  </div>
                </div>
              ) : (
                displayContent && (
                  isJunebug ? (
                    <FormattedText content={displayContent} className="mt-1" />
                  ) : (
                    <div className="mt-1 text-sm whitespace-pre-wrap">
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
                  className="inline-flex items-center gap-1.5 text-xs bg-muted rounded px-2 py-1 mr-2"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{att.fileName}</span>
                  <span className="text-muted-foreground">
                    ({(att.fileSize / 1024 / 1024).toFixed(1)} MB)
                  </span>
                  <button
                    onClick={() => window.open(`/api/documents/download?key=${encodeURIComponent(att.fileUrl)}`, "_blank")}
                    className="text-primary hover:text-primary/80"
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Reaction chips */}
          {myReactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {myReactions.map((r) => {
                const emoji = QUICK_REACTIONS.find((qr) => qr.type === r)?.emoji || r
                return (
                  <button
                    key={r}
                    onClick={() => handleReaction(r)}
                    className="text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 hover:bg-primary/20"
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>
          )}

          {/* Actions bar */}
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.replyCount > 0 && <span>{post.replyCount}</span>}
            </button>
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 text-xs transition-colors ${
                liked
                  ? "text-red-500"
                  : "text-muted-foreground hover:text-red-500"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
            {/* Reaction picker */}
            <div className="relative">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              {showReactions && (
                <div className="absolute bottom-6 left-0 bg-popover border rounded-lg shadow-lg p-1 flex gap-0.5 z-50">
                  {QUICK_REACTIONS.map((r) => (
                    <button
                      key={r.type}
                      onClick={() => handleReaction(r.type)}
                      className={`text-sm p-1 rounded hover:bg-muted transition-colors ${
                        myReactions.includes(r.type) ? "bg-primary/10" : ""
                      }`}
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {displayContent && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : ""}
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
