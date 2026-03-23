"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { SystemEventCard } from "./system-event-card"
import { TaskCard } from "./task-card"
import { FeedReplyList, ReplyInput } from "./feed-reply"
import { Heart, MessageCircle, Copy, Paperclip, Download } from "lucide-react"

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
 * @mentions → blue highlight
 * #CaseTags → clickable links
 */
function renderContent(content: string, mentions?: any[], caseData?: any): React.ReactNode {
  if (!content) return null

  // Replace @Junebug and @mentions with styled spans
  // Replace #CaseTag patterns with links
  const parts: React.ReactNode[] = []
  let remaining = content
  let key = 0

  // Simple regex-based rendering for @mentions and #tags
  const pattern = /(@\w+(?:\s\w+)?|#[\w-]+)/g
  let match
  let lastIndex = 0

  while ((match = pattern.exec(content)) !== null) {
    // Add text before match
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
      // If we have case data and the tag matches, link to it
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

  // Add remaining text
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

  const handleReplyAdded = useCallback(() => {
    onRefresh?.()
    setShowReplyInput(false)
  }, [onRefresh])

  // System events get compact rendering
  if (post.postType === "system_event") {
    return <SystemEventCard post={post} />
  }

  const isJunebug = post.authorType === "junebug"
  const isTask = post.postType === "task"
  const isFileShare = post.postType === "file_share"

  async function handleLike() {
    const newLiked = !liked
    setLiked(newLiked)
    setLikeCount((c: number) => c + (newLiked ? 1 : -1))
    try {
      await fetch(`/api/feed/${post.id}/like`, { method: "POST" })
    } catch {
      // Revert optimistic update
      setLiked(!newLiked)
      setLikeCount((c: number) => c + (newLiked ? -1 : 1))
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
            {isTask && (
              <span className="text-sm text-muted-foreground">created a task</span>
            )}
            {isFileShare && (
              <span className="text-sm text-muted-foreground">shared a file</span>
            )}
            <span className="text-xs text-muted-foreground">
              · {timeAgo(post.createdAt)}
            </span>
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

          {/* Content */}
          {post.content && !isTask && (
            <div className="mt-1 text-sm whitespace-pre-wrap">
              {renderContent(post.content, post.mentions, post.case)}
            </div>
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
            {post.content && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : ""}
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
