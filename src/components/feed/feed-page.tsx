"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { FeedComposer } from "./feed-composer"
import { FeedCard } from "./feed-card"
import { FeedFilters } from "./feed-filters"
import { PinnedNowStrip } from "./pinned-now-strip"
import { Loader2, ChevronDown, ChevronRight } from "lucide-react"

type FilterType = "all" | "post" | "task" | "my_tasks" | "system_event"

interface FeedPageProps {
  currentUser: any
  initialPosts: any[]
  myTaskCount?: number
  pinnedPosts?: any[]
  cases?: { id: string; tabsNumber: string; clientName: string }[]
  users?: { id: string; name: string }[]
  /** If set, the feed is scoped to this case */
  caseId?: string
}

export function FeedPage({
  currentUser,
  initialPosts,
  myTaskCount = 0,
  pinnedPosts = [],
  cases = [],
  users = [],
  caseId,
}: FeedPageProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [filter, setFilter] = useState<FilterType>("all")
  const [caseFilter, setCaseFilter] = useState(caseId || "")
  const [cursor, setCursor] = useState<string | null>(
    initialPosts.length > 0
      ? initialPosts[initialPosts.length - 1].createdAt
      : null
  )
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newPostsAvailable, setNewPostsAvailable] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

  // Build query string for API calls
  function buildQuery(extra: Record<string, string> = {}) {
    const params = new URLSearchParams()
    if (caseFilter) params.set("caseId", caseFilter)
    if (filter === "post") params.set("postType", "post")
    else if (filter === "task") params.set("postType", "task")
    else if (filter === "my_tasks") params.set("postType", "my_tasks")
    else if (filter === "system_event") params.set("postType", "system_event")
    for (const [k, v] of Object.entries(extra)) {
      params.set(k, v)
    }
    return params.toString()
  }

  // Fetch posts (for refresh or filter change)
  const fetchPosts = useCallback(async () => {
    const query = buildQuery()
    const res = await fetch(`/api/feed?${query}`)
    if (res.ok) {
      const data = await res.json()
      setPosts(data.posts)
      setCursor(data.nextCursor)
      setHasMore(!!data.nextCursor)
      setNewPostsAvailable(false)
    }
  }, [filter, caseFilter])

  // Refetch when filter changes
  useEffect(() => {
    fetchPosts()
  }, [filter, caseFilter])

  // Load more (infinite scroll)
  async function loadMore() {
    if (loadingMore || !hasMore || !cursor) return
    setLoadingMore(true)
    try {
      const query = buildQuery({ cursor })
      const res = await fetch(`/api/feed?${query}`)
      if (res.ok) {
        const data = await res.json()
        setPosts((prev) => [...prev, ...data.posts])
        setCursor(data.nextCursor)
        setHasMore(!!data.nextCursor)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = loaderRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [cursor, hasMore, loadingMore])

  // Poll for new posts every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      if (posts.length === 0) return
      const latestTimestamp = posts[0]?.createdAt
      if (!latestTimestamp) return

      const query = buildQuery({ after: latestTimestamp })
      try {
        const res = await fetch(`/api/feed?${query}&limit=1`)
        if (res.ok) {
          const data = await res.json()
          if (data.posts.length > 0) {
            setNewPostsAvailable(true)
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [posts, filter, caseFilter])

  function handleShowNewPosts() {
    fetchPosts()
  }

  return (
    <div>
      {/* Pinned / Now strip */}
      {pinnedPosts.length > 0 && (
        <PinnedNowStrip posts={pinnedPosts} />
      )}

      {/* Composer */}
      <div className="mb-4">
        <FeedComposer
          currentUser={currentUser}
          cases={cases}
          users={users}
          preselectedCaseId={caseId}
          onPostCreated={fetchPosts}
        />
      </div>

      {/* Filter bar */}
      <FeedFilters
        filter={filter}
        onFilterChange={setFilter}
        myTaskCount={myTaskCount}
        caseFilter={caseFilter}
        onClearCaseFilter={caseId ? undefined : () => setCaseFilter("")}
      />

      {/* New posts indicator */}
      {newPostsAvailable && (
        <button
          onClick={handleShowNewPosts}
          className="w-full py-2 text-xs rounded-lg mb-3 transition-colors"
          style={{
            background: 'var(--c-teal-soft)',
            color: 'var(--c-teal)',
          }}
        >
          New posts available &mdash; click to refresh
        </button>
      )}

      {/* Feed — grouped by day with accordion */}
      <div>
        {posts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: 'var(--c-gray-300)' }}>No posts yet. Start a conversation!</p>
          </div>
        ) : (
          <DayGroupedFeed
            posts={posts}
            currentUser={currentUser}
            onRefresh={fetchPosts}
            onCaseFilter={caseId ? undefined : setCaseFilter}
          />
        )}
      </div>

      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-8 flex justify-center">
        {loadingMore && (
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--c-gray-300)' }} />
        )}
        {!hasMore && posts.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--c-gray-300)' }}>No more posts</p>
        )}
      </div>
    </div>
  )
}

// ── Day-grouped feed with accordion ──

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const postDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - postDay.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" })
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function getDayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function DayGroupedFeed({
  posts,
  currentUser,
  onRefresh,
  onCaseFilter,
}: {
  posts: any[]
  currentUser: any
  onRefresh: () => void
  onCaseFilter?: (id: string) => void
}) {
  // Group posts by day
  const dayGroups = useMemo(() => {
    const groups: { key: string; label: string; posts: any[] }[] = []
    const seen = new Map<string, number>()

    for (const post of posts) {
      const key = getDayKey(post.createdAt)
      if (seen.has(key)) {
        groups[seen.get(key)!].posts.push(post)
      } else {
        seen.set(key, groups.length)
        groups.push({ key, label: getDayLabel(post.createdAt), posts: [post] })
      }
    }
    return groups
  }, [posts])

  // Today expanded by default, others collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const set = new Set<string>()
    const todayKey = getDayKey(new Date().toISOString())
    for (const g of dayGroups) {
      if (g.key !== todayKey) set.add(g.key)
    }
    return set
  })

  const toggle = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {dayGroups.map(group => {
        const isCollapsed = collapsed.has(group.key)
        return (
          <div key={group.key}>
            {/* Day header */}
            <button
              onClick={() => toggle(group.key)}
              className="flex items-center gap-2 w-full py-2 px-1 group cursor-pointer"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--c-gray-300)' }} />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--c-gray-300)' }} />
              )}
              <span className="text-sm font-medium" style={{ color: 'var(--c-gray-700)' }}>
                {group.label}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-mono"
                style={{ background: 'var(--c-gray-50)', color: 'var(--c-gray-500)' }}
              >
                {group.posts.length}
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--c-gray-100)' }} />
            </button>

            {/* Posts — animate open/close */}
            <div
              style={{
                maxHeight: isCollapsed ? 0 : `${group.posts.length * 600}px`,
                overflow: "hidden",
                transition: "max-height 350ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              {group.posts.map((post: any) => (
                <FeedCard
                  key={post.id}
                  post={post}
                  currentUser={currentUser}
                  onRefresh={onRefresh}
                  onCaseFilter={onCaseFilter}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
