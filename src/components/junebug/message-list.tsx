"use client"

/**
 * MessageList (spec §7.7).
 *
 * Renders messages oldest-to-newest, handles:
 *   - Auto-scroll-to-bottom when a new message arrives AND the user is
 *     already near the bottom (don't yank them away if they scrolled up).
 *   - Infinite scroll upward via an IntersectionObserver sentinel above
 *     the first message. Preserves scroll position while prepending.
 *   - The "streaming" pulse marker on the last assistant message until done.
 */

import { useEffect, useLayoutEffect, useRef } from "react"
import { MessageBubble } from "./message-bubble"
import type { JunebugMessage } from "./types"

export interface MessageListProps {
  messages: JunebugMessage[]
  isStreaming: boolean
  hasMore: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  onRetry?: (message: JunebugMessage) => void
  onToggleTreat?: (message: JunebugMessage) => void
}

const BOTTOM_STICKINESS_PX = 80 // within this, auto-scroll on new message

export function MessageList({
  messages,
  isStreaming,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onRetry,
  onToggleTreat,
}: MessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const firstRenderRef = useRef(true)
  const lastMessageIdRef = useRef<string | null>(null)
  // Preserve scroll when prepending older messages
  const preserveRef = useRef<{ prevHeight: number; prevScroll: number } | null>(null)

  // --- Auto-scroll logic ---
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    // If we just prepended older messages, keep the viewport anchored.
    if (preserveRef.current) {
      const delta = scroller.scrollHeight - preserveRef.current.prevHeight
      scroller.scrollTop = preserveRef.current.prevScroll + delta
      preserveRef.current = null
      return
    }

    const last = messages[messages.length - 1]
    const lastId = last?.id ?? null
    const isNewTail = lastId !== lastMessageIdRef.current
    lastMessageIdRef.current = lastId

    if (firstRenderRef.current) {
      // On first load, pin to bottom
      scroller.scrollTop = scroller.scrollHeight
      firstRenderRef.current = false
      return
    }

    if (isNewTail || isStreaming) {
      // Only auto-scroll if the user was already close to the bottom
      const distanceFromBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      if (distanceFromBottom < BOTTOM_STICKINESS_PX * 4) {
        scroller.scrollTop = scroller.scrollHeight
      }
    }
  }, [messages, isStreaming])

  // --- IntersectionObserver for "load older" ---
  useEffect(() => {
    const sentinel = sentinelRef.current
    const scroller = scrollerRef.current
    if (!sentinel || !scroller || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loadingOlder) {
            // Capture scroll position before the prepend
            preserveRef.current = {
              prevHeight: scroller.scrollHeight,
              prevScroll: scroller.scrollTop,
            }
            onLoadOlder()
          }
        }
      },
      { root: scroller, rootMargin: "200px 0px 0px 0px", threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingOlder, onLoadOlder])

  return (
    <div
      ref={scrollerRef}
      className="flex-1 overflow-y-auto px-8 py-6 md:px-10"
      style={{ scrollBehavior: "auto" }}
    >
      {hasMore && (
        <div ref={sentinelRef} className="flex h-8 items-center justify-center">
          {loadingOlder ? (
            <span className="text-[11px] uppercase tracking-[0.04em] text-c-gray-500">
              Loading older…
            </span>
          ) : (
            <button
              type="button"
              onClick={onLoadOlder}
              className="text-[11px] uppercase tracking-[0.04em] text-c-gray-500 hover:text-c-gray-700"
            >
              Load older messages
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-6">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const streamingThisOne = isStreaming && isLast && m.role === "ASSISTANT"
          return (
            <MessageBubble
              key={m.id}
              message={m}
              isStreaming={streamingThisOne || !!m.streaming}
              onRetry={onRetry}
              onToggleTreat={onToggleTreat}
            />
          )
        })}
      </div>
    </div>
  )
}
