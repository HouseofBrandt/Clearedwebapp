"use client"

/**
 * DashboardSplit
 * --------------
 * Responsive two-pane layout for the bifurcated dashboard: feed on the
 * left, Junebug workspace on the right. Zero data logic — pure layout —
 * so it can be unit-tested (and visually tweaked) without mocking either
 * pane. The caller passes both panes as React nodes.
 *
 * Breakpoints (Tailwind's default md=768, lg=1024, xl=1280):
 *
 *   - `< md`    : tab switcher at the top; one pane visible at a time.
 *                 Selection persists in sessionStorage so a user who
 *                 reloads or navigates away and back stays on the pane
 *                 they last chose. Feed is the default (the reflex for
 *                 "open dashboard → check the team's activity").
 *   - `md..lg`  : both panes stacked vertically, each sized to roughly
 *                 70vh so the user can see the feed above and scroll to
 *                 the Junebug pane below without losing context. No tabs.
 *   - `lg..xl`  : 60/40 side-by-side. Feed stays close to its native
 *                 ~680px column; Junebug gets a narrower but usable
 *                 pane for thread view + composer.
 *   - `>= xl`   : 50/50. Both panes have breathing room.
 *
 * No resizable divider, no collapsible columns, no localStorage state —
 * those accumulate bugs for marginal benefit. A later pass can add them
 * once the base layout has dogfooded for a couple of weeks.
 *
 * No new design tokens: uses `--c-navy-950`, `--c-gray-50/100/500/700`,
 * shadow-panel, and `--font-jetbrains` for the pill labels.
 */

import { useEffect, useState } from "react"

type MobileTab = "feed" | "junebug"

const MOBILE_TAB_STORAGE_KEY = "cleared:dashboard:mobile-tab"

interface DashboardSplitProps {
  feedSlot: React.ReactNode
  junebugSlot: React.ReactNode
}

export function DashboardSplit({ feedSlot, junebugSlot }: DashboardSplitProps) {
  // Mobile tab — starts at "feed" for everyone; hydrates from
  // sessionStorage on mount. We don't read from storage during initial
  // render to avoid hydration mismatches; the brief flash to "feed"
  // before switching to the saved preference is fine at <768 (mobile
  // users rarely notice a <100ms re-render).
  const [mobileTab, setMobileTab] = useState<MobileTab>("feed")

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(MOBILE_TAB_STORAGE_KEY)
      if (saved === "junebug" || saved === "feed") {
        setMobileTab(saved)
      }
    } catch {
      /* private browsing / storage disabled — just stick with default */
    }
  }, [])

  const selectTab = (next: MobileTab) => {
    setMobileTab(next)
    try {
      sessionStorage.setItem(MOBILE_TAB_STORAGE_KEY, next)
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div className="w-full">
      {/* Mobile tab pills — only visible below md. Mirrors the existing
          pill-style of action rows (e.g. review queue filters) with
          JetBrains Mono labels for the monospaced editorial feel. */}
      <div className="md:hidden mb-5 flex gap-2" role="tablist" aria-label="Dashboard panes">
        <TabPill
          label="Feed"
          active={mobileTab === "feed"}
          onClick={() => selectTab("feed")}
        />
        <TabPill
          label="Junebug"
          active={mobileTab === "junebug"}
          onClick={() => selectTab("junebug")}
        />
      </div>

      {/* Layout grid. `grid-cols-1` handles both <md (where only the
          active tab's pane renders) and md..lg (where both panes stack).
          `lg:grid-cols-[3fr_2fr]` is the 60/40 split; `xl:grid-cols-2`
          is the 50/50 split. Gap scales from 24px on narrow screens to
          32px at md+ for the breathing room the editorial style expects. */}
      <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[3fr_2fr] xl:grid-cols-2">
        {/* Feed pane — hidden on mobile when the user has the Junebug
            tab selected. At md+ the class list becomes empty and the
            pane renders normally. */}
        <div
          role="tabpanel"
          aria-hidden={mobileTab === "junebug"}
          className={mobileTab === "feed" ? "" : "hidden md:block"}
        >
          {feedSlot}
        </div>

        {/* Junebug pane — mirror logic. */}
        <div
          role="tabpanel"
          aria-hidden={mobileTab === "feed"}
          className={mobileTab === "junebug" ? "" : "hidden md:block"}
        >
          {junebugSlot}
        </div>
      </div>
    </div>
  )
}

interface TabPillProps {
  label: string
  active: boolean
  onClick: () => void
}

function TabPill({ label, active, onClick }: TabPillProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex-1 rounded-lg px-3 py-2 text-[11px] transition-colors"
      style={{
        fontFamily: "var(--font-jetbrains, monospace)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: active ? 500 : 400,
        background: active ? "var(--c-navy-950)" : "var(--c-gray-50)",
        color: active ? "#fff" : "var(--c-gray-700)",
      }}
    >
      {label}
    </button>
  )
}
