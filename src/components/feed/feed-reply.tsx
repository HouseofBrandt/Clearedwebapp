"use client"

import { useState, useRef } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { JUNEBUG_LOADING_MESSAGES } from "@/lib/junebug/loading-messages"
import { Send } from "lucide-react"
import { FormattedText } from "./formatted-text"

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

interface FeedReplyListProps {
  replies: any[]
  totalReplyCount: number
  postId: string
  onReplyAdded?: () => void
}

export function FeedReplyList({ replies, totalReplyCount, postId, onReplyAdded }: FeedReplyListProps) {
  const [allReplies, setAllReplies] = useState(replies)
  const [showAll, setShowAll] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)

  async function loadAllReplies() {
    setLoadingAll(true)
    try {
      const res = await fetch(`/api/feed/${postId}/reply`)
      if (res.ok) {
        const data = await res.json()
        setAllReplies(data.replies)
        setShowAll(true)
      }
    } finally {
      setLoadingAll(false)
    }
  }

  const displayReplies = showAll ? allReplies : replies
  const hasMore = totalReplyCount > replies.length && !showAll

  if (displayReplies.length === 0) return null

  return (
    <div className="ml-4 pl-4 border-l border-border/50 mt-2 space-y-2">
      {displayReplies.map((reply: any) => (
        <ReplyItem key={reply.id} reply={reply} />
      ))}
      {hasMore && (
        <button
          onClick={loadAllReplies}
          disabled={loadingAll}
          className="text-xs text-primary hover:underline"
        >
          {loadingAll ? "Loading..." : `View ${totalReplyCount - replies.length} more replies`}
        </button>
      )}
    </div>
  )
}

function ReplyItem({ reply }: { reply: any }) {
  const isJunebug = reply.authorType === "junebug"
  const isThinking = reply.content === null

  // Rotating loading message for thinking state
  const [msgIndex, setMsgIndex] = useState(0)
  const pool = JUNEBUG_LOADING_MESSAGES.thinking
  useState(() => {
    if (!isThinking) return
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % pool.length)
    }, 5000)
    return () => clearInterval(interval)
  })

  return (
    <div className="flex items-start gap-2 py-1">
      {isJunebug ? (
        <div className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <JunebugIcon className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" animated={isThinking} />
        </div>
      ) : (
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-[10px]">
            {reply.author ? getInitials(reply.author.name) : "?"}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">
            {isJunebug ? "Junebug" : reply.author?.name || "Unknown"}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(reply.createdAt)}</span>
        </div>
        {isThinking ? (
          <p className="text-xs text-muted-foreground italic animate-pulse">
            {pool[msgIndex]}
          </p>
        ) : isJunebug ? (
          <FormattedText content={reply.content} className="mt-0.5" />
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap">{reply.content}</p>
        )}
      </div>
    </div>
  )
}

interface ReplyInputProps {
  postId: string
  onReplyAdded: () => void
}

export function ReplyInput({ postId, onReplyAdded }: ReplyInputProps) {
  const [content, setContent] = useState("")
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || sending) return

    setSending(true)
    try {
      // Detect @Junebug mention
      const hasJunebug = /@junebug/i.test(content)
      const mentions = hasJunebug ? [{ type: "junebug" as const, display: "@Junebug" }] : undefined

      const res = await fetch(`/api/feed/${postId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), mentions }),
      })
      if (res.ok) {
        setContent("")
        onReplyAdded()
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2 ml-4 pl-4 border-l border-border/50">
      <input
        ref={inputRef}
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Reply..."
        className="flex-1 text-sm bg-transparent border-b border-border/50 focus:border-primary outline-none py-1 px-0"
        disabled={sending}
      />
      <Button type="submit" variant="ghost" size="icon" className="h-7 w-7" disabled={!content.trim() || sending}>
        <Send className="h-3.5 w-3.5" />
      </Button>
    </form>
  )
}
