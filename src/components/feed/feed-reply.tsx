"use client"

import { useState, useRef, useEffect } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { JunebugIcon, TreatBoneIcon } from "@/components/assistant/junebug-icon"
import { JUNEBUG_LOADING_MESSAGES } from "@/lib/junebug/loading-messages"
import { FormattedText } from "./formatted-text"
import { TruncatedText } from "@/components/ui/truncated-text"
import { Send } from "lucide-react"

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

export function FeedReplyList({ replies, totalReplyCount, postId, onReplyAdded: _onReplyAdded }: FeedReplyListProps) {
  const [allReplies, setAllReplies] = useState(replies)
  const [showAll, setShowAll] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)

  // Keep local state in sync when the server-provided `replies` prop
  // changes (e.g. after a refetch following a new reply).
  useEffect(() => {
    setAllReplies(replies)
  }, [replies])

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

  // Poll for Junebug placeholder completion. If any visible reply is a
  // Junebug placeholder (authorType=junebug, content=null), poll the
  // replies endpoint every 3 seconds until the placeholder is filled in
  // or we hit the 20-poll cap (60 seconds total). This covers the case
  // where the junebug-complete lambda is still running when the feed
  // first renders — without polling the user would have to manually
  // refresh to see Junebug's answer.
  const hasThinkingJunebug = displayReplies.some(
    (r: any) => r.authorType === "junebug" && r.content === null
  )
  useEffect(() => {
    if (!hasThinkingJunebug) return
    let cancelled = false
    let pollsRemaining = 20
    const poll = async () => {
      if (cancelled || pollsRemaining <= 0) return
      pollsRemaining -= 1
      try {
        const res = await fetch(`/api/feed/${postId}/reply`)
        if (res.ok) {
          const data = await res.json()
          if (cancelled) return
          const nextReplies = data.replies || []
          setAllReplies(nextReplies)
          // Stop polling once every junebug placeholder has content.
          const stillThinking = nextReplies.some(
            (r: any) => r.authorType === "junebug" && r.content === null
          )
          if (!stillThinking) return
        }
      } catch {
        /* network hiccup — try again */
      }
      if (!cancelled) setTimeout(poll, 3000)
    }
    // First poll after 3s so the completion lambda has time to start.
    const starter = setTimeout(poll, 3000)
    return () => {
      cancelled = true
      clearTimeout(starter)
    }
  }, [hasThinkingJunebug, postId])

  const hasMore = totalReplyCount > replies.length && !showAll

  if (displayReplies.length === 0) return null

  return (
    <div className="ml-4 pl-4 mt-2 space-y-2" style={{ borderLeft: '1px solid var(--c-gray-100)' }}>
      {displayReplies.map((reply: any) => (
        <ReplyItem key={reply.id} reply={reply} postId={postId} />
      ))}
      {hasMore && (
        <button
          onClick={loadAllReplies}
          disabled={loadingAll}
          className="text-xs hover:underline"
          style={{ color: 'var(--c-teal)' }}
        >
          {loadingAll ? "Loading..." : `View ${totalReplyCount - replies.length} more replies`}
        </button>
      )}
    </div>
  )
}

function ReplyItem({ reply, postId }: { reply: any; postId: string }) {
  const isJunebug = reply.authorType === "junebug"
  const isThinking = reply.content === null
  const [treated, setTreated] = useState(false)
  const [treatAnimating, setTreatAnimating] = useState(false)
  const [iconMood, setIconMood] = useState<"idle" | "happy" | "thinking" | "treat">(
    isThinking ? "thinking" : "idle"
  )

  // Rotating loading message for thinking state
  const [msgIndex, setMsgIndex] = useState(0)
  const pool = JUNEBUG_LOADING_MESSAGES.thinking

  useEffect(() => {
    if (!isThinking) return
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % pool.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isThinking, pool.length])

  async function handleTreat() {
    if (treatAnimating) return
    setTreatAnimating(true)
    setTreated(!treated)
    setIconMood("treat")

    try {
      await fetch(`/api/feed/${postId}/treat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply.id }),
      })
    } catch {
      setTreated((prev) => !prev)
    }

    // Show happy mood for 2 seconds after treat
    setTimeout(() => {
      setIconMood(treated ? "idle" : "happy")
      setTreatAnimating(false)
    }, 600)

    // Return to idle after the happy period
    if (!treated) {
      setTimeout(() => setIconMood("idle"), 3000)
    }
  }

  return (
    <div className="flex items-start gap-2 py-1.5 group">
      {isJunebug ? (
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--c-teal-soft)' }}
        >
          <JunebugIcon
            className="h-4 w-4"
            style={{ color: 'var(--c-teal)' }}
            animated={isThinking}
            mood={iconMood}
          />
        </div>
      ) : (
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-[10px]" style={{ background: 'var(--c-gray-100)', color: 'var(--c-gray-500)' }}>
            {reply.author ? getInitials(reply.author.name) : "?"}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="font-medium"
            style={{
              fontSize: isJunebug ? '13px' : '12px',
              color: isJunebug ? 'var(--c-teal)' : 'var(--c-gray-700)',
            }}
          >
            {isJunebug ? "Junebug" : reply.author?.name || "Unknown"}
          </span>
          <span className="text-xs" style={{ color: 'var(--c-gray-300)' }}>{timeAgo(reply.createdAt)}</span>
          {/* Treat button — only for Junebug replies with content */}
          {isJunebug && !isThinking && (
            <button
              onClick={handleTreat}
              className="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium transition-all"
              style={{
                fontSize: '10px',
                color: treated ? 'var(--c-teal)' : 'var(--c-gray-300)',
                background: treated ? 'var(--c-teal-soft)' : 'transparent',
                opacity: treated ? 1 : undefined,
              }}
              title={treated ? "Treat given! Junebug will remember this." : "Give Junebug a treat for a helpful answer"}
            >
              <TreatBoneIcon className="h-3 w-3" />
              {treated ? "Good girl!" : ""}
            </button>
          )}
        </div>
        {isThinking ? (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs italic" style={{ color: 'var(--c-teal)', opacity: 0.6 }}>
              {pool[msgIndex]}
            </span>
            <span className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full animate-bounce" style={{ background: 'var(--c-teal)', animationDelay: "0ms" }} />
              <span className="h-1 w-1 rounded-full animate-bounce" style={{ background: 'var(--c-teal)', animationDelay: "150ms" }} />
              <span className="h-1 w-1 rounded-full animate-bounce" style={{ background: 'var(--c-teal)', animationDelay: "300ms" }} />
            </span>
          </div>
        ) : isJunebug ? (
          <TruncatedText lines={3} className="mt-0.5">
            <FormattedText content={reply.content} />
          </TruncatedText>
        ) : (
          <TruncatedText lines={3} className="mt-0.5">
            <p className="whitespace-pre-wrap" style={{ color: 'var(--c-gray-700)', fontSize: '14px', lineHeight: '1.65' }}>{reply.content}</p>
          </TruncatedText>
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
      const mentions = hasJunebug
        ? [{ type: "junebug" as const, display: "@Junebug" }]
        : undefined
      const trimmed = content.trim()

      const res = await fetch(`/api/feed/${postId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, mentions }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)

        // If Junebug was tagged in this reply, the server created a
        // placeholder and returned its ID. Fire the completion request
        // in a separate lambda (maxDuration = 60) so the AI call actually
        // gets time to finish. Fire-and-forget from the client — the
        // stale sweeper covers us if the network call drops.
        if (data?.junebugPlaceholderId) {
          fetch(`/api/feed/${postId}/junebug-complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              placeholderId: data.junebugPlaceholderId,
              message: trimmed,
              caseId: null,
            }),
          }).catch((err) => {
            console.error("[Junebug] reply trigger failed:", err)
          })
        }

        setContent("")
        onReplyAdded()
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 mt-2 ml-4 pl-4"
      style={{ borderLeft: '1px solid var(--c-gray-100)' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Reply..."
        className="flex-1 text-sm bg-transparent outline-none py-1 px-0"
        style={{
          borderBottom: '1px solid var(--c-gray-100)',
          color: 'var(--c-gray-700)',
        }}
        disabled={sending}
      />
      <button
        type="submit"
        disabled={!content.trim() || sending}
        className="h-7 w-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
        style={{ color: 'var(--c-gray-300)' }}
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </form>
  )
}
