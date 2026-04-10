"use client"

import Link from "next/link"
import { useState, useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { Sparkles, Search, LogOut } from "lucide-react"
import { NotificationsCenter } from "@/components/layout/notifications-center"
import { getVisibleNavItems, type NavSection } from "@/components/layout/navigation"

/**
 * Rail — the 56px dark icon-only navigation column for the Cleared redesign.
 *
 * Replaces the 248px labeled sidebar. Everything essential lives here:
 *
 *   [top]      Cleared mark (logo icon only)
 *              MAIN nav items (dashboard, cases, review, tasks, calendar,
 *                              portfolio, knowledge, research, inbox, news)
 *              — divider —
 *              TOOLS (transcript, OIC, penalty, forms, pippen)
 *              — divider (admin only) —
 *              ADMIN (soc2, work product, audit log, switchboard, …)
 *   [spacer]
 *              Search (opens a simple case search modal)
 *              Notifications (mounts NotificationsCenter — the bell, the badge,
 *                             the grouped panel)
 *   [bottom]   User avatar (opens a small menu: Settings, Sign out)
 *
 * All icons are thin-stroke 1.5px lucide icons at 18px. Labels are shown
 * as native `title` tooltips on hover. The active route gets a Cleared-green
 * glow + a 2px left accent bar (the one place green appears in the rail).
 *
 * The rail is `hidden lg:flex`. On mobile the existing SidebarContent drawer
 * handles navigation (triggered from the Header's menu button).
 */

interface RailProps {
  user: { name?: string | null; email?: string | null; role?: string }
  pendingReviewCount?: number
  overdueDeadlineCount?: number
  unreadMessageCount?: number
}

function getInitials(name?: string | null) {
  if (!name) return "U"
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

const SECTION_ORDER: NavSection[] = ["MAIN", "TOOLS", "ADMIN"]

export function Rail({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
}: RailProps) {
  const pathname = usePathname()
  const router = useRouter()
  const allItems = getVisibleNavItems(user.role)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Group items by section; drop the standalone Settings item from the loop
  // since we render it in the footer next to the user menu.
  const sectionItems: Record<NavSection, typeof allItems> = {
    MAIN: [],
    TOOLS: [],
    ADMIN: [],
  }
  for (const item of allItems) {
    if (item.name === "Settings") continue
    sectionItems[item.section].push(item)
  }

  // Debounced case search — cancels the previous timer on every keystroke.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cases?search=${encodeURIComponent(searchQuery)}&limit=8`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.cases || [])
        }
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery("")
    setSearchResults([])
  }

  // Close menus on Escape — real listener attached via useEffect.
  useEffect(() => {
    if (!menuOpen && !searchOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false)
        setSearchOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [menuOpen, searchOpen])

  // Cmd/Ctrl+K shortcut to open search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <aside
        className="hidden lg:flex shrink-0 flex-col items-center relative"
        style={{
          width: 56,
          background: "var(--c-rail-bg)",
          borderRight: "0.5px solid rgba(255,255,255,0.06)",
        }}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center justify-center mt-3 mb-3"
          style={{ width: 40, height: 40, borderRadius: 10 }}
          aria-label="Cleared — go to dashboard"
          title="Cleared"
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "linear-gradient(135deg, var(--c-cleared-green) 0%, #178560 100%)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.75} style={{ color: "#FFFFFF", opacity: 0.95 }} />
          </div>
        </Link>

        {/* Nav — scrollable if overflow, scrollbar hidden via .rail-nav CSS */}
        <nav className="rail-nav flex flex-col items-center gap-1 flex-1 overflow-y-auto w-full py-1">
          {SECTION_ORDER.map((section, si) => {
            const items = sectionItems[section]
            if (items.length === 0) return null
            return (
              <div key={section} className="flex flex-col items-center gap-1 w-full">
                {si > 0 && (
                  <div
                    className="my-2"
                    style={{
                      width: 20,
                      height: "0.5px",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                )}
                {items.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const badge =
                    item.name === "Review Queue" && (pendingReviewCount ?? 0) > 0
                      ? pendingReviewCount!
                      : item.name === "Calendar" && (overdueDeadlineCount ?? 0) > 0
                      ? overdueDeadlineCount!
                      : item.name === "Inbox" && (unreadMessageCount ?? 0) > 0
                      ? unreadMessageCount!
                      : 0
                  return (
                    <RailLink
                      key={item.name}
                      href={item.href}
                      label={item.name}
                      Icon={item.icon}
                      isActive={isActive}
                      badge={badge}
                    />
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer tools */}
        <div className="flex flex-col items-center gap-1 pb-2 pt-2 w-full" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
          {/* Search */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search cases"
            aria-label="Search cases"
            className="flex items-center justify-center transition-colors"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            <Search
              className="h-[18px] w-[18px]"
              strokeWidth={1.5}
              style={{ color: "rgba(255,255,255,0.48)" }}
            />
          </button>

          {/* Notifications bell — uses the existing NotificationsCenter */}
          <div className="flex items-center justify-center" style={{ width: 40, height: 40 }}>
            <NotificationsCenter
              initialUnreadCount={
                (pendingReviewCount || 0) +
                (overdueDeadlineCount || 0) +
                (unreadMessageCount || 0)
              }
            />
          </div>

          {/* User avatar — opens a tiny popover menu */}
          <div className="relative flex items-center justify-center" style={{ width: 44, height: 44, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title={user.name || "User"}
              aria-label="User menu"
              className="flex items-center justify-center transition-all"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--c-navy-700), var(--c-navy-800))",
                border: "0.5px solid rgba(255,255,255,0.12)",
                color: "#FFFFFF",
                fontFamily: "var(--font-dm)",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.03em",
                cursor: "pointer",
              }}
            >
              {getInitials(user.name)}
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  className="absolute bottom-0 z-50"
                  style={{
                    left: 56,
                    minWidth: 220,
                    background: "var(--c-white)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: 12,
                    boxShadow: "0 16px 48px rgba(10,22,40,0.14), 0 2px 8px rgba(10,22,40,0.04)",
                    padding: 6,
                    animation: "cardIn 180ms var(--ease-out-expo) both",
                  }}
                >
                  <div className="px-3 py-2.5" style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}>
                    <div
                      className="truncate"
                      style={{
                        fontFamily: "var(--font-dm)",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--c-gray-800)",
                      }}
                    >
                      {user.name}
                    </div>
                    {user.email && (
                      <div
                        className="truncate mt-0.5"
                        style={{
                          fontFamily: "var(--font-dm)",
                          fontSize: 11,
                          fontWeight: 400,
                          color: "var(--c-gray-400)",
                        }}
                      >
                        {user.email}
                      </div>
                    )}
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors hover:bg-[var(--c-snow)]"
                    style={{
                      fontFamily: "var(--font-dm)",
                      fontSize: 13,
                      fontWeight: 400,
                      color: "var(--c-gray-700)",
                    }}
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      signOut({ callbackUrl: "/login" })
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors hover:bg-[var(--c-snow)]"
                    style={{
                      fontFamily: "var(--font-dm)",
                      fontSize: 13,
                      fontWeight: 400,
                      color: "var(--c-gray-700)",
                      textAlign: "left",
                    }}
                  >
                    <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Search modal — simple centered case search */}
      {searchOpen && (
        <div
          className="fixed inset-0 flex items-start justify-center"
          style={{
            zIndex: 300,
            paddingTop: "15vh",
            background: "rgba(20, 24, 32, 0.32)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            animation: "fadeIn 160ms var(--ease-smooth) both",
          }}
          onClick={closeSearch}
        >
          <div
            className="flex flex-col overflow-hidden"
            style={{
              width: 520,
              maxWidth: "calc(100vw - 48px)",
              maxHeight: "60vh",
              background: "var(--c-white)",
              border: "0.5px solid var(--border-tertiary)",
              borderRadius: 16,
              boxShadow: "0 24px 64px rgba(10,22,40,0.18), 0 4px 16px rgba(10,22,40,0.06)",
              animation: "cardIn 220ms var(--ease-out-expo) both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-3 px-5 py-4"
              style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}
            >
              <Search
                className="h-4 w-4 shrink-0"
                strokeWidth={1.5}
                style={{ color: "var(--c-gray-300)" }}
              />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch()
                  if (e.key === "Enter" && searchResults.length > 0) {
                    router.push(`/cases/${searchResults[0].id}`)
                    closeSearch()
                  }
                }}
                placeholder="Search cases by client name or TABS number…"
                className="flex-1 bg-transparent outline-none"
                style={{
                  fontFamily: "var(--font-dm)",
                  fontSize: 15,
                  fontWeight: 300,
                  color: "var(--c-gray-800)",
                  letterSpacing: "0.005em",
                }}
              />
              <kbd
                style={{
                  fontFamily: "var(--font-dm)",
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "var(--c-gray-50)",
                  border: "0.5px solid var(--border-tertiary)",
                  color: "var(--c-gray-400)",
                }}
              >
                esc
              </kbd>
            </div>

            <div className="flex-1 overflow-y-auto">
              {searching && searchResults.length === 0 && (
                <div className="py-10 text-center">
                  <div
                    className="inline-block h-4 w-4 rounded-full animate-spin"
                    style={{
                      border: "1.5px solid var(--c-gray-100)",
                      borderTopColor: "var(--c-cleared-green)",
                    }}
                  />
                </div>
              )}
              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="py-10 text-center">
                  <p
                    style={{
                      fontFamily: "var(--font-editorial)",
                      fontSize: 16,
                      fontWeight: 300,
                      fontStyle: "italic",
                      color: "var(--c-gray-400)",
                    }}
                  >
                    No matches.
                  </p>
                </div>
              )}
              {searchResults.map((c: any) => (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}`}
                  onClick={closeSearch}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--c-snow)]"
                  style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate"
                      style={{
                        fontFamily: "var(--font-dm)",
                        fontSize: 14,
                        fontWeight: 500,
                        color: "var(--c-gray-800)",
                      }}
                    >
                      {c.clientName || "Unknown"}
                    </div>
                    <div
                      className="truncate mt-0.5"
                      style={{
                        fontFamily: "var(--font-dm)",
                        fontSize: 11,
                        fontWeight: 400,
                        color: "var(--c-gray-400)",
                      }}
                    >
                      {c.caseType} · {c.status}
                    </div>
                  </div>
                  <span
                    className="font-mono shrink-0 ml-3"
                    style={{ fontSize: 11, color: "var(--c-gray-300)" }}
                  >
                    {c.tabsNumber}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Individual rail icon button ─────────────────────────────────

function RailLink({
  href,
  label,
  Icon,
  isActive,
  badge,
}: {
  href: string
  label: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>
  isActive: boolean
  badge: number
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className="relative flex items-center justify-center transition-colors"
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: isActive ? "rgba(29,158,117,0.14)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.06)"
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent"
      }}
    >
      {/* Active indicator — Cleared-green left accent bar */}
      {isActive && (
        <span
          className="absolute rounded-r-sm"
          style={{
            left: -12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 18,
            background: "var(--c-cleared-green)",
            boxShadow: "0 0 10px rgba(29,158,117,0.5)",
          }}
        />
      )}
      <Icon
        className="h-[18px] w-[18px]"
        strokeWidth={1.5}
        style={{
          color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.48)",
          transition: "color 150ms var(--ease-smooth)",
        }}
      />
      {/* Badge — top-right of the icon */}
      {badge > 0 && (
        <span
          className="absolute flex items-center justify-center"
          style={{
            top: 4,
            right: 4,
            height: 14,
            minWidth: 14,
            padding: "0 3px",
            borderRadius: 999,
            background: "#EF4444",
            color: "#FFFFFF",
            fontFamily: "var(--font-dm)",
            fontSize: 9,
            fontWeight: 500,
            boxShadow: "0 0 0 1.5px var(--c-rail-bg)",
            lineHeight: 1,
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  )
}
