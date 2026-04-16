"use client"

/**
 * useThread — fetch a single thread + paginated message history.
 *
 * Spec §6.3 / §7.5 / §7.7. Messages are returned ascending (oldest first).
 * `loadOlder()` paginates backward — prepends older messages.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { JunebugMessage, JunebugThreadDetail } from "../types"

interface ThreadGetResponse {
  thread: JunebugThreadDetail
  messages: JunebugMessage[]
  hasMoreMessages: boolean
  oldestMessageCursor: string | null
}

export function useThread(threadId: string | null) {
  const [thread, setThread] = useState<JunebugThreadDetail | null>(null)
  const [messages, setMessages] = useState<JunebugMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const fetchThread = useCallback(
    async (id: string, signal?: AbortSignal) => {
      setError(null)
      const res = await fetch(`/api/junebug/threads/${id}`, {
        signal,
        credentials: "same-origin",
      })
      if (res.status === 404) {
        throw new Error("Thread not found")
      }
      if (!res.ok) {
        throw new Error(`Failed to load thread: ${res.status}`)
      }
      const data: ThreadGetResponse = await res.json()
      setThread(data.thread)
      setMessages(data.messages)
      setHasMore(data.hasMoreMessages)
      setOlderCursor(data.oldestMessageCursor)
    },
    []
  )

  // Refetch whenever threadId changes
  useEffect(() => {
    if (!threadId) {
      setThread(null)
      setMessages([])
      setHasMore(false)
      setOlderCursor(null)
      setIsLoading(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsLoading(true)
    fetchThread(threadId, ctrl.signal)
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err?.message || "Failed to load thread")
      })
      .finally(() => setIsLoading(false))
    return () => ctrl.abort()
  }, [threadId, fetchThread])

  const loadOlder = useCallback(async () => {
    if (!threadId || !hasMore || !olderCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const res = await fetch(
        `/api/junebug/threads/${threadId}?messagesCursor=${encodeURIComponent(olderCursor)}`,
        { credentials: "same-origin" }
      )
      if (!res.ok) throw new Error(`Failed to load older messages: ${res.status}`)
      const data: ThreadGetResponse = await res.json()
      // Prepend older messages (they come back ascending; older than current head)
      setMessages((prev) => [...data.messages, ...prev])
      setHasMore(data.hasMoreMessages)
      setOlderCursor(data.oldestMessageCursor)
    } catch (err: any) {
      setError(err?.message || "Failed to load older messages")
    } finally {
      setLoadingOlder(false)
    }
  }, [threadId, hasMore, olderCursor, loadingOlder])

  // ------------------------------------------------------------------
  // Local mutators — used by the send-message hook to update state
  // without a full refetch round-trip.
  // ------------------------------------------------------------------

  const appendMessage = useCallback((msg: JunebugMessage) => {
    setMessages((prev) => {
      // Avoid duplicates when the server confirms a message we already have
      const idx = prev.findIndex((m) => m.id === msg.id)
      if (idx === -1) return [...prev, msg]
      const next = [...prev]
      next[idx] = { ...next[idx], ...msg }
      return next
    })
  }, [])

  const patchMessage = useCallback((id: string, patch: Partial<JunebugMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  /** Append a delta to an existing assistant message without needing the
   *  current messages array in scope — avoids stale-closure bugs during a
   *  long-running stream. */
  const appendToMessage = useCallback((id: string, delta: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
    )
  }, [])

  const removeMessagesFrom = useCallback((fromId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === fromId)
      if (idx === -1) return prev
      return prev.slice(0, idx)
    })
  }, [])

  const patchThread = useCallback((patch: Partial<JunebugThreadDetail>) => {
    setThread((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const refetch = useCallback(async () => {
    if (!threadId) return
    await fetchThread(threadId)
  }, [threadId, fetchThread])

  return {
    thread,
    messages,
    isLoading,
    loadingOlder,
    hasMore,
    error,
    loadOlder,
    appendMessage,
    patchMessage,
    appendToMessage,
    removeMessagesFrom,
    patchThread,
    refetch,
  }
}
