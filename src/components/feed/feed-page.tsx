"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { FeedComposer } from "./feed-composer"
import { FeedCard } from "./feed-card"
import { Loader2 } from "lucide-react"

type FilterType = "all" | "post" | "task" | "my_tasks"

interface FeedPageProps {
  currentUser: any
  initialPosts: any[]
  myTaskCount?: number
  cases?: { id: string; tabsNumber: string; clientName: string }[]
  users?: { id: string; name: string }[]
  /** If set, the feed is scoped to this case */
  caseId?: string
}

export function FeedPage({
  currentUser,
  initialPosts,
  myTaskCount = 0,
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

  const filters: { key: FilterType; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "post", label: "Posts" },
    { key: "task", label: "Tasks" },
    { key: "my_tasks", label: "My Tasks", count: myTaskCount },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      {/* Composer */}
      <div className="p-4 pb-0">
        <FeedComposer
          currentUser={currentUser}
          cases={cases}
          users={users}
          preselectedCaseId={caseId}
          onPostCreated={fetchPosts}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-3 border-b">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            {f.count != null && f.count > 0 && (
              <span className="ml-1 bg-primary-foreground/20 rounded-full px-1.5 text-[10px]">
                {f.count}
              </span>
            )}
          </button>
        ))}
        {caseFilter && !caseId && (
          <button
            onClick={() => setCaseFilter("")}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary"
          >
            Case filtered
            <span className="ml-1">&times;</span>
          </button>
        )}
      </div>

      {/* New posts indicator */}
      {newPostsAvailable && (
        <button
          onClick={handleShowNewPosts}
          className="w-full py-2 text-xs text-primary bg-primary/5 hover:bg-primary/10 transition-colors border-b"
        >
          New posts available — click to refresh
        </button>
      )}

      {/* Feed */}
      <div>
        {posts.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p className="text-sm">No posts yet. Start a conversation!</p>
          </div>
        ) : (
          posts.map((post: any) => (
            <FeedCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              onRefresh={fetchPosts}
              onCaseFilter={caseId ? undefined : setCaseFilter}
            />
          ))
        )}
      </div>

      {/* Infinite scroll loader */}
      <div ref={loaderRef} className="py-8 flex justify-center">
        {loadingMore && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
        {!hasMore && posts.length > 0 && (
          <p className="text-xs text-muted-foreground">No more posts</p>
        )}
      </div>
    </div>
  )
}
