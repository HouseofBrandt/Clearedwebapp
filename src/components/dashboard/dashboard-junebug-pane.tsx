"use client"

/**
 * DashboardJunebugPane
 * --------------------
 * Thin wrapper that embeds the Junebug workspace inside a fixed-height
 * dashboard card.
 *
 * Responsibilities:
 *   - Lazy-load `JunebugWorkspace` so the dashboard route chunk doesn't
 *     pull in the SSE parser, `marked`, `DOMPurify`, and the ten-plus
 *     Junebug components until the user actually interacts.
 *   - Bound the pane's height so it never stretches the overall page
 *     layout. The MessageList inside has its own overflow.
 *   - Hand JunebugWorkspace a navigation callback so "Open full
 *     workspace" jumps to /junebug(/threadId) without a page reload
 *     round-trip.
 *
 * Bundle note: `next/dynamic({ ssr: false })` keeps the workspace out
 * of the server-rendered HTML AND out of the dashboard's initial JS
 * chunk. If bundle analyzer ever shows the workspace leaking into
 * /dashboard anyway, double-check that no server component is
 * importing JunebugWorkspace directly.
 */

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { JunebugIcon } from "@/components/assistant/junebug-icon"

const JunebugWorkspace = dynamic(
  () =>
    import("@/components/junebug/junebug-workspace").then(
      (m) => m.JunebugWorkspace
    ),
  {
    ssr: false,
    loading: () => <JunebugPaneSkeleton />,
  }
)

interface DashboardJunebugPaneProps {
  currentUser: { id: string; name: string; role: string }
}

export function DashboardJunebugPane({
  currentUser: _currentUser,
}: DashboardJunebugPaneProps) {
  // currentUser isn't consumed by the workspace today — JunebugWorkspace
  // reads session via its own hooks — but we keep it in the prop
  // contract so the pane's API matches what callers already pass to
  // <FeedPage>. Avoids a two-pattern mismatch on the dashboard page.
  const router = useRouter()

  return (
    <PaneFrame>
      <JunebugWorkspace
        embedded
        onOpenFullWorkspace={(activeThreadId) => {
          router.push(activeThreadId ? `/junebug/${activeThreadId}` : "/junebug")
        }}
      />
    </PaneFrame>
  )
}

/**
 * The pane's outer card. Matches the feed's card treatment (white
 * background, 1px warm-gray border, the project's shared panel
 * shadow) so the two columns feel like siblings rather than one
 * raised card next to a flat one.
 *
 * Height formula:
 *   - `min(calc(100vh - 260px), 720px)` keeps the pane visible above
 *     the fold without letting it dominate on tall monitors. 260px
 *     accounts for the dashboard header (~56), greeting block (~120),
 *     and a little breathing room for the bottom of the viewport.
 *   - Mobile (stacked) mode falls through the same min() and lands
 *     around 500–600px on most phones — enough for ~5 messages + the
 *     composer, with the thread scroll taking care of the rest.
 */
function PaneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl bg-white"
      style={{
        border: "1px solid var(--c-gray-100)",
        boxShadow: "var(--shadow-panel)",
        height: "min(calc(100vh - 260px), 720px)",
      }}
    >
      {children}
    </div>
  )
}

/**
 * Skeleton shown while the workspace bundle loads. Reserves the pane's
 * height so there's no layout shift when the real workspace hydrates,
 * and the editorial chrome matches the loaded state (top bar, message
 * area, composer). Intentionally low-contrast — this should feel like
 * the pane warming up, not an error.
 */
function JunebugPaneSkeleton() {
  return (
    <PaneFrame>
      <div
        className="flex items-center gap-2 border-b px-4 py-2"
        style={{ borderColor: "var(--c-gray-100)" }}
      >
        <div
          className="h-4 w-4 rounded"
          style={{ background: "var(--c-gray-100)" }}
          aria-hidden
        />
        <div
          className="h-4 w-32 rounded"
          style={{ background: "var(--c-gray-100)" }}
          aria-hidden
        />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8">
        <JunebugIcon
          className="h-7 w-7"
          style={{ color: "var(--c-gray-300)" }}
        />
        <p
          className="text-[11px]"
          style={{
            fontFamily: "var(--font-jetbrains, monospace)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--c-gray-500)",
          }}
        >
          Loading workspace
        </p>
      </div>
      <div
        className="border-t px-4 py-3"
        style={{ borderColor: "var(--c-gray-100)" }}
      >
        <div
          className="h-10 w-full rounded-lg"
          style={{ background: "var(--c-gray-50)" }}
          aria-hidden
        />
      </div>
    </PaneFrame>
  )
}
