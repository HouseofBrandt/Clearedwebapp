"use client"

/**
 * useThreads — fetch + mutate the current user's thread list (spec §7.9).
 *
 * Keeps state locally with useState; no SWR/React Query per non-goals (§3).
 * Background refresh every 30s while the tab is visible. Paused on hide.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { JunebugThreadListItem } from "../types"

export interface UseThreadsFilters {
  archived?: boolean
  caseId?: string
  pinnedOnly?: boolean
  search?: string
}

interface ThreadsResponse {
  threads: JunebugThreadListItem[]
  nextCursor: string | null
}

const POLL_INTERVAL_MS = 30_000

function buildQuery(filters: UseThreadsFilters, cursor?: string): string {
  const sp = new URLSearchParams()
  if (filters.archived) sp.set("archived", "true")
  if (filters.caseId) sp.set("caseId", filters.caseId)
  if (filters.pinnedOnly) sp.set("pinnedOnly", "true")
  if (filters.search && filters.search.trim()) sp.set("search", filters.search.trim())
  if (cursor) sp.set("cursor", cursor)
  const qs = sp.toString()
  return qs ? `?${qs}` : ""
}

export function useThreads(filters: UseThreadsFilters = {}) {
  const [threads, setThreads] = useState<JunebugThreadListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters that refetch when they change — stable dependency string
  const key = JSON.stringify({
    archived: !!filters.archived,
    caseId: filters.caseId ?? null,
    pinnedOnly: !!filters.pinnedOnly,
    search: filters.search?.trim() ?? "",
  })

  const abortRef = useRef<AbortController | null>(null)

  const fetchList = useCallback(
    async (signal?: AbortSignal) => {
      setError(null)
      try {
        const res = await fetch(`/api/junebug/threads${buildQuery(filters)}`, {
          signal,
          credentials: "same-origin",
        })
        if (!res.ok) {
          // 404 when the feature flag is off — treat as empty, not an error.
          if (res.status === 404) {
            setThreads([])
            setNextCursor(null)
            return
          }
          throw new Error(`Failed to load threads: ${res.status}`)
        }
        const data: ThreadsResponse = await res.json()
        setThreads(data.threads)
        setNextCursor(data.nextCursor)
      } catch (err: any) {
        if (err?.name === "AbortError") return
        setError(err?.message || "Failed to load threads")
      }
    },
    // fetchList depends only on the filter key; closure captures filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )

  // Initial load + refetch when filter key changes
  useEffect(() => {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsLoading(true)
    fetchList(ctrl.signal).finally(() => setIsLoading(false))
    return () => ctrl.abort()
  }, [fetchList])

  // Poll every 30s while visible
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (timer) return
      timer = setInterval(() => {
        // Don't refetch if a request is already in flight
        fetchList()
      }, POLL_INTERVAL_MS)
    }
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") startPolling()
      else stopPolling()
    }

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      startPolling()
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility)
    }
    return () => {
      stopPolling()
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility)
      }
    }
  }, [fetchList])

  // ------------------------------------------------------------------
  // Mutators
  // ------------------------------------------------------------------

  const createThread = useCallback(
    async (caseId?: string | null): Promise<JunebugThreadListItem> => {
      const res = await fetch("/api/junebug/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ caseId: caseId ?? null }),
      })
      if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`)
      const data = await res.json()
      const created: JunebugThreadListItem = data.thread
      // Optimistically prepend; server will confirm on next poll
      setThreads((prev) => [created, ...prev.filter((t) => t.id !== created.id)])
      return created
    },
    []
  )

  const updateThread = useCallback(
    async (
      id: string,
      patch: Partial<Pick<JunebugThreadListItem, "title" | "pinned" | "archived" | "caseId">>
    ): Promise<JunebugThreadListItem> => {
      // Optimistic update
      setThreads((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } as JunebugThreadListItem : t))
      )
      const res = await fetch(`/api/junebug/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        // Revert by refetching
        await fetchList()
        throw new Error(`Failed to update thread: ${res.status}`)
      }
      const data = await res.json()
      const updated: JunebugThreadListItem = data.thread
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      return updated
    },
    [fetchList]
  )

  const deleteThread = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/junebug/threads/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-Confirm-Delete": "true" },
      })
      if (!res.ok && res.status !== 204) {
        throw new Error(`Failed to delete thread: ${res.status}`)
      }
      setThreads((prev) => prev.filter((t) => t.id !== id))
    },
    []
  )

  /** Merge or prepend a thread we just discovered (e.g. after sending a message). */
  const upsertThread = useCallback((t: JunebugThreadListItem) => {
    setThreads((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id)
      if (idx === -1) return [t, ...prev]
      const next = [...prev]
      next[idx] = { ...next[idx], ...t }
      return next
    })
  }, [])

  return {
    threads,
    nextCursor,
    isLoading,
    error,
    mutate: fetchList,
    createThread,
    updateThread,
    deleteThread,
    upsertThread,
  }
}
