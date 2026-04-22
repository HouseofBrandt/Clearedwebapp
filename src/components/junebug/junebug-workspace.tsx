"use client"

/**
 * JunebugWorkspace — top-level layout (spec §4 + §7.2).
 *
 * Holds:
 *   - Active thread state (URL-driven if `initialThreadId` is passed)
 *   - Sidebar filter state (archived, case scope, search)
 *   - Sidebar collapse (mobile overlay vs desktop fixed)
 *
 * Wires:
 *   - useThreads → ThreadSidebar
 *   - useThread + useSendMessage → ThreadView
 *   - Starting a message from the splash screen creates a thread first,
 *     then hands off to ThreadView which sends the turn.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUpRight, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { ThreadSidebar } from "./thread-sidebar"
import { ThreadView } from "./thread-view"
import { ThreadEmptyState } from "./thread-empty-state"
import { useThreads } from "./hooks/use-threads"
import type { ComposerAttachment } from "./message-composer"
import type { JunebugThreadListItem } from "./types"
import { FullFetchProvider } from "@/components/assistant/full-fetch-context"

export interface JunebugWorkspaceProps {
  initialThreadId?: string
  scopeToCaseId?: string | null
  /** Suggestions override for the splash screen (e.g. on a case page). */
  suggestions?: string[]
  /**
   * Embedded mode — used when the workspace lives inside a dashboard pane
   * rather than the full-screen /junebug route. Changes:
   *   - Sidebar starts collapsed (the pane is narrow; threads would crowd
   *     the messages). Users toggle it from the chrome as needed.
   *   - A small "Open full workspace" link appears in the top chrome,
   *     inviting users to jump to /junebug[/threadId] when they want the
   *     full experience.
   *   - URL sync is skipped — the dashboard URL stays at /dashboard even
   *     as the user navigates between threads inside the pane.
   */
  embedded?: boolean
  /**
   * Callback for the "Open full workspace" link in embedded mode. Receives
   * the currently active thread id (if any) so the parent can route to
   * `/junebug/:id` or `/junebug` appropriately. If omitted in embedded
   * mode, the link is hidden.
   */
  onOpenFullWorkspace?: (activeThreadId: string | null) => void
}

export function JunebugWorkspace({
  initialThreadId,
  scopeToCaseId,
  suggestions,
  embedded = false,
  onOpenFullWorkspace,
}: JunebugWorkspaceProps) {
  // Feature-flag gating is handled by the page-level (server) entry
  // points — /junebug/page.tsx, /junebug/[threadId]/page.tsx, and the
  // dashboard pane (PR 3). Anything that renders this component has
  // already confirmed the user is in scope, so we don't re-check.
  const router = useRouter()
  const pathname = usePathname()

  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId ?? null
  )
  // Sidebar default: expanded in full-screen mode, collapsed when embedded
  // (a narrow dashboard pane can't fit a 280px sidebar + content).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(embedded)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [caseScopeFilter, setCaseScopeFilter] = useState<"all" | "current_case">(
    scopeToCaseId ? "current_case" : "all"
  )

  const filters = useMemo(
    () => ({
      archived: showArchived,
      caseId:
        scopeToCaseId && caseScopeFilter === "current_case" ? scopeToCaseId : undefined,
      search: searchQuery,
    }),
    [showArchived, scopeToCaseId, caseScopeFilter, searchQuery]
  )

  const threads = useThreads(filters)

  // One-shot migration: the legacy chat-panel wrote to sessionStorage
  // ("junebug-chat", "junebug-chat-case") and localStorage
  // ("junebug-full-fetch"). Those keys are dead once the threads
  // workspace ships. Clear them exactly once per browser so users who
  // upgraded mid-session don't drag orphan keys forever. Gated by a
  // marker key so we don't clear on every mount.
  useEffect(() => {
    try {
      if (localStorage.getItem("junebug-migration-v1") === "1") return
      sessionStorage.removeItem("junebug-chat")
      sessionStorage.removeItem("junebug-chat-case")
      localStorage.removeItem("junebug-full-fetch")
      localStorage.setItem("junebug-migration-v1", "1")
    } catch {
      /* private browsing / storage disabled — non-fatal */
    }
  }, [])

  // Sync activeThreadId with the URL-driven initialThreadId prop. This
  // matters for browser back/forward navigation: Next.js re-renders the
  // page with the new params, which would otherwise leave the workspace
  // pointing at the wrong thread. The lastPushedRef guard below prevents
  // a loop with our own router.replace.
  useEffect(() => {
    if (typeof initialThreadId === "undefined") return
    setActiveThreadId((prev) => (prev === initialThreadId ? prev : initialThreadId))
  }, [initialThreadId])

  // Keep URL in sync with active thread — only when mounted under
  // /junebug and not in embedded mode. When embedded on a dashboard
  // pane or case detail page we leave the URL alone so switching
  // threads inside the pane doesn't dirty the browser history or push
  // the user away from /dashboard.
  const lastPushedRef = useRef<string | null>(null)
  useEffect(() => {
    if (embedded) return
    if (!activeThreadId) return
    if (lastPushedRef.current === activeThreadId) return
    if (!pathname?.startsWith("/junebug")) return
    lastPushedRef.current = activeThreadId
    const qs = scopeToCaseId ? `?case=${scopeToCaseId}` : ""
    router.replace(`/junebug/${activeThreadId}${qs}`, { scroll: false })
  }, [embedded, activeThreadId, router, pathname, scopeToCaseId])

  const handleSelect = useCallback((id: string) => {
    setActiveThreadId(id)
    setMobileSidebarOpen(false)
  }, [])

  const handleNewThread = useCallback(async () => {
    const created = await threads.createThread(scopeToCaseId)
    setActiveThreadId(created.id)
    setMobileSidebarOpen(false)
  }, [threads, scopeToCaseId])

  /**
   * Splash-screen "start a conversation" handler. Creates the thread first,
   * then sets it active. The ThreadView, which mounts with that id, will
   * pick up the first turn — but since the turn was typed into the splash
   * composer, we need to post the first message ourselves. We store the
   * pending content in a ref and let ThreadView send it once mounted.
   */
  const pendingInitialMessageRef = useRef<
    | { threadId: string; content: string; attachments: ComposerAttachment[] }
    | null
  >(null)

  const handleSplashStart = useCallback(
    async (content: string, attachments: ComposerAttachment[]) => {
      const created = await threads.createThread(scopeToCaseId)
      pendingInitialMessageRef.current = {
        threadId: created.id,
        content,
        attachments,
      }
      setActiveThreadId(created.id)
    },
    [threads, scopeToCaseId]
  )

  const handleRename = useCallback(
    async (id: string, next: string) => {
      await threads.updateThread(id, { title: next })
    },
    [threads]
  )
  const handlePin = useCallback(
    async (id: string, next: boolean) => {
      await threads.updateThread(id, { pinned: next })
    },
    [threads]
  )
  const handleArchive = useCallback(
    async (id: string, next: boolean) => {
      await threads.updateThread(id, { archived: next })
    },
    [threads]
  )
  const handleDelete = useCallback(
    async (id: string) => {
      await threads.deleteThread(id)
      if (activeThreadId === id) setActiveThreadId(null)
    },
    [threads, activeThreadId]
  )

  const handleThreadBumped = useCallback(
    (patch: Partial<JunebugThreadListItem> & { id: string }) => {
      // Merge the bump into the list; if thread isn't in the list yet
      // (e.g. first message on a freshly-created thread), upsert it.
      const existing = threads.threads.find((x) => x.id === patch.id)
      if (existing) {
        // Optimistic patch; next poll confirms
        threads.upsertThread({ ...existing, ...patch } as JunebugThreadListItem)
      } else {
        threads.upsertThread({
          id: patch.id,
          title: patch.title ?? "New conversation",
          titleAutoGenerated: patch.titleAutoGenerated ?? true,
          caseId: patch.caseId ?? null,
          caseNumber: patch.caseNumber ?? null,
          clientName: patch.clientName ?? null,
          pinned: false,
          archived: false,
          lastMessageAt: patch.lastMessageAt ?? new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 0,
          lastMessagePreview: "",
          lastMessageRole: null,
        })
      }
    },
    [threads]
  )

  const activeThread = activeThreadId
    ? threads.threads.find((t) => t.id === activeThreadId) ?? null
    : null
  const splashScopedCaseNumber = scopeToCaseId
    ? activeThread?.caseNumber ??
      threads.threads.find((t) => t.caseId === scopeToCaseId)?.caseNumber ??
      null
    : null

  return (
    <FullFetchProvider>
    <div className="polish-junebug-target flex h-full w-full bg-white">
      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex transition-all duration-200 ${
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-[280px]"
        }`}
      >
        <ThreadSidebar
          threads={threads.threads}
          activeThreadId={activeThreadId}
          isLoading={threads.isLoading}
          scopeToCaseId={scopeToCaseId ?? null}
          caseScopeFilter={caseScopeFilter}
          onCaseScopeChange={setCaseScopeFilter}
          showArchived={showArchived}
          onToggleArchived={setShowArchived}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={handleSelect}
          onNewThread={handleNewThread}
          onRename={handleRename}
          onPin={handlePin}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-[280px] max-w-[85%] bg-white shadow-xl">
            <ThreadSidebar
              threads={threads.threads}
              activeThreadId={activeThreadId}
              isLoading={threads.isLoading}
              scopeToCaseId={scopeToCaseId ?? null}
              caseScopeFilter={caseScopeFilter}
              onCaseScopeChange={setCaseScopeFilter}
              showArchived={showArchived}
              onToggleArchived={setShowArchived}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelect={handleSelect}
              onNewThread={handleNewThread}
              onRename={handleRename}
              onPin={handlePin}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="flex-1 bg-black/30"
            aria-label="Close sidebar"
          />
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top chrome: collapse button (desktop) / menu (mobile) */}
        <div className="flex items-center gap-2 border-b border-c-gray-100 bg-white px-4 py-2">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="rounded p-1.5 text-c-gray-500 hover:bg-c-gray-50 md:hidden"
            aria-label="Open threads"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden rounded p-1.5 text-c-gray-500 hover:bg-c-gray-50 md:block"
            aria-label={sidebarCollapsed ? "Show threads" : "Hide threads"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <h2
            className="flex-1 truncate text-[14px] text-c-gray-900"
            style={{ fontFamily: "var(--font-display, Georgia), serif", fontWeight: 400 }}
          >
            {activeThread?.title ?? "Junebug"}
          </h2>
          {embedded && onOpenFullWorkspace ? (
            <button
              type="button"
              onClick={() => onOpenFullWorkspace(activeThreadId)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-c-gray-500 transition-colors hover:bg-c-gray-50 hover:text-c-gray-900"
              style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
              aria-label="Open full workspace"
            >
              Open workspace
              <ArrowUpRight className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {activeThreadId ? (
            <ThreadView
              key={activeThreadId}
              threadId={activeThreadId}
              currentRoute={typeof window !== "undefined" ? window.location.pathname : undefined}
              onThreadBumped={handleThreadBumped}
              initialSendContent={
                pendingInitialMessageRef.current?.threadId === activeThreadId
                  ? pendingInitialMessageRef.current.content
                  : undefined
              }
              initialSendAttachments={
                pendingInitialMessageRef.current?.threadId === activeThreadId
                  ? pendingInitialMessageRef.current.attachments
                  : undefined
              }
              onInitialSendDispatched={() => {
                if (pendingInitialMessageRef.current?.threadId === activeThreadId) {
                  pendingInitialMessageRef.current = null
                }
              }}
            />
          ) : (
            <ThreadEmptyState
              scopedCaseNumber={splashScopedCaseNumber}
              isCreating={threads.isLoading}
              onStart={handleSplashStart}
              suggestions={suggestions}
            />
          )}
        </div>
      </div>
    </div>
    </FullFetchProvider>
  )
}
