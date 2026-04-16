"use client"

/**
 * ThreadSidebar (spec §7.3).
 *
 *   - "New conversation" button (top).
 *   - Search input (full-text against message content server-side).
 *   - Show-archived toggle.
 *   - Case-scope toggle (only if workspace is scoped to a case).
 *   - Grouped thread list. When a search is active, flat ranked list
 *     with matched term highlighted on title/preview.
 */

import { useMemo, useState } from "react"
import { Plus, Search, X } from "lucide-react"
import type { JunebugThreadListItem } from "./types"
import { ThreadListItem } from "./thread-list-item"
import { groupThreads } from "./lib/group-threads"

export interface ThreadSidebarProps {
  threads: JunebugThreadListItem[]
  activeThreadId: string | null
  isLoading: boolean
  /** When present, we're embedded on a case page. */
  scopeToCaseId?: string | null
  caseScopeFilter: "all" | "current_case"
  onCaseScopeChange: (v: "all" | "current_case") => void
  showArchived: boolean
  onToggleArchived: (v: boolean) => void
  searchQuery: string
  onSearchChange: (v: string) => void

  onSelect: (threadId: string) => void
  onNewThread: () => void | Promise<void>
  onRename: (threadId: string, newTitle: string) => void | Promise<void>
  onPin: (threadId: string, next: boolean) => void | Promise<void>
  onArchive: (threadId: string, next: boolean) => void | Promise<void>
  onDelete: (threadId: string) => void | Promise<void>
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  isLoading,
  scopeToCaseId,
  caseScopeFilter,
  onCaseScopeChange,
  showArchived,
  onToggleArchived,
  searchQuery,
  onSearchChange,
  onSelect,
  onNewThread,
  onRename,
  onPin,
  onArchive,
  onDelete,
}: ThreadSidebarProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const grouped = useMemo(() => groupThreads(threads), [threads])
  const isSearching = searchQuery.trim().length > 0

  const confirmAndDelete = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      // Auto-clear the pending confirm after 4s
      setTimeout(() => setDeleteConfirmId((curr) => (curr === id ? null : curr)), 4000)
      return
    }
    setDeleteConfirmId(null)
    await onDelete(id)
  }

  const handleNew = async () => {
    if (creating) return
    try {
      setCreating(true)
      await onNewThread()
    } finally {
      setCreating(false)
    }
  }

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-c-gray-100 bg-white">
      {/* Header block */}
      <div className="flex flex-col gap-2 border-b border-c-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={handleNew}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-c-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-c-gray-700 transition-colors hover:border-c-gray-300 hover:bg-c-gray-50 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          New conversation
        </button>

        {/* Search */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-c-gray-300"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search threads…"
            className="w-full rounded-md border border-c-gray-100 bg-white py-1.5 pl-8 pr-7 text-[12.5px] placeholder:text-c-gray-300 focus:border-c-gray-200 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-c-gray-300 hover:text-c-gray-500"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.04em] text-c-gray-500"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          {scopeToCaseId ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onCaseScopeChange("current_case")}
                className={`rounded px-2 py-1 transition-colors ${
                  caseScopeFilter === "current_case"
                    ? "bg-c-gray-50 text-c-gray-700"
                    : "text-c-gray-500 hover:text-c-gray-700"
                }`}
              >
                This case
              </button>
              <button
                type="button"
                onClick={() => onCaseScopeChange("all")}
                className={`rounded px-2 py-1 transition-colors ${
                  caseScopeFilter === "all"
                    ? "bg-c-gray-50 text-c-gray-700"
                    : "text-c-gray-500 hover:text-c-gray-700"
                }`}
              >
                All
              </button>
            </div>
          ) : <span />}
          <button
            type="button"
            onClick={() => onToggleArchived(!showArchived)}
            className={`rounded px-2 py-1 transition-colors ${
              showArchived ? "bg-c-gray-50 text-c-gray-700" : "text-c-gray-500 hover:text-c-gray-700"
            }`}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && threads.length === 0 ? (
          <SidebarSkeleton />
        ) : threads.length === 0 ? (
          <EmptySidebar isSearching={isSearching} />
        ) : isSearching ? (
          <div className="flex flex-col gap-1">
            {threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                isActive={activeThreadId === t.id}
                searchHighlight={searchQuery}
                deleteConfirmId={deleteConfirmId}
                onSelect={onSelect}
                onRename={onRename}
                onPin={onPin}
                onArchive={onArchive}
                onDelete={confirmAndDelete}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <div key={group.key}>
                <div
                  className="mb-1 flex items-center gap-2 px-3 text-[10.5px] uppercase tracking-[0.08em] text-c-gray-500"
                  style={{ fontFamily: "var(--font-mono, monospace)" }}
                >
                  <span>{group.label}</span>
                  <span className="rounded bg-c-gray-50 px-1.5 py-[1px] text-[10px] text-c-gray-500">
                    {group.threads.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {group.threads.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      isActive={activeThreadId === t.id}
                      deleteConfirmId={deleteConfirmId}
                      onSelect={onSelect}
                      onRename={onRename}
                      onPin={onPin}
                      onArchive={onArchive}
                      onDelete={confirmAndDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function ThreadRow({
  thread,
  isActive,
  searchHighlight,
  deleteConfirmId,
  onSelect,
  onRename,
  onPin,
  onArchive,
  onDelete,
}: {
  thread: JunebugThreadListItem
  isActive: boolean
  searchHighlight?: string
  deleteConfirmId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, t: string) => void | Promise<void>
  onPin: (id: string, next: boolean) => void | Promise<void>
  onArchive: (id: string, next: boolean) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  return (
    <div>
      <ThreadListItem
        thread={thread}
        isActive={isActive}
        searchHighlight={searchHighlight}
        onSelect={onSelect}
        onRename={(id, t) => {
          void onRename(id, t)
        }}
        onPin={(id, next) => {
          void onPin(id, next)
        }}
        onArchive={(id, next) => {
          void onArchive(id, next)
        }}
        onDelete={(id) => {
          void onDelete(id)
        }}
      />
      {deleteConfirmId === thread.id && (
        <div className="mt-1 mx-1 rounded border border-c-danger/20 bg-c-danger/5 px-3 py-1.5 text-[11px] text-c-danger">
          Click delete again to confirm.
        </div>
      )}
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-2 py-2">
          <div className="h-3.5 w-3/4 rounded bg-c-gray-100 animate-pulse" />
          <div className="mt-2 h-2 w-1/2 rounded bg-c-gray-100/60 animate-pulse" />
          <div className="mt-1.5 h-2.5 w-full rounded bg-c-gray-100/40 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function EmptySidebar({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="mt-8 px-4 text-center">
      <p className="text-[13px] text-c-gray-500">
        {isSearching
          ? "No threads match that search."
          : "No conversations yet."}
      </p>
      {!isSearching && (
        <p className="mt-1 text-[12px] text-c-gray-300">
          Ask Junebug anything to get started.
        </p>
      )}
    </div>
  )
}
