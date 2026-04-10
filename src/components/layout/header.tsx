"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPageContext } from "@/components/layout/navigation"
import { SidebarContent } from "@/components/layout/sidebar"

/**
 * Header — simplified for the dashboard redesign.
 *
 * What used to live here:
 *   - Search bar          — moved to the Rail (search modal, Cmd+K)
 *   - Notifications bell  — moved to the Rail
 *   - User avatar menu    — moved to the Rail footer
 *
 * What's left:
 *   - Mobile menu trigger (hamburger) — still needed for the drawer
 *   - Breadcrumb + page title         — kept for context on every route
 *
 * On desktop the Rail holds all navigation and personal actions, so the
 * header is a thin 48px strip that only shows "Cleared / {page name}".
 * On mobile the hamburger opens the full SidebarContent drawer because
 * the Rail is hidden below the `lg` breakpoint.
 */

interface HeaderProps {
  user: { name?: string | null; email?: string | null; role: string }
  pendingReviewCount?: number
  overdueDeadlineCount?: number
  unreadMessageCount?: number
}

export function Header({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const page = getPageContext(pathname, user.role)

  const segments = pathname.split("/").filter(Boolean)
  const showBreadcrumb = segments.length > 1

  return (
    <>
      <header
        className="sticky top-0 z-30"
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          background: "rgba(250,251,252,0.85)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: "0.5px solid var(--border-tertiary)",
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 lg:hidden mr-3"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          {showBreadcrumb && (
            <>
              <span
                className="hidden sm:inline"
                style={{
                  fontFamily: "var(--font-dm)",
                  fontSize: 11,
                  fontWeight: 400,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--c-gray-300)",
                }}
              >
                {segments[0]}
              </span>
              <ChevronRight
                className="h-3 w-3 hidden sm:inline"
                style={{ color: "var(--c-gray-200)" }}
              />
            </>
          )}
          <h1
            className="truncate"
            style={{
              fontFamily: "var(--font-dm)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--c-gray-800)",
              letterSpacing: "-0.005em",
            }}
          >
            {page.name}
          </h1>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0"
            style={{ background: "rgba(10,22,40,0.4)", backdropFilter: "blur(4px)" }}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 flex w-[min(85vw,18rem)] flex-col"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{
                background: "var(--c-rail-bg)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                  style={{
                    background: "linear-gradient(135deg, var(--c-cleared-green), #178560)",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  C
                </div>
                <span
                  className="text-sm text-white"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                >
                  Cleared
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="h-8 w-8 text-white/50 hover:text-white/80"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent
              user={user}
              pendingReviewCount={pendingReviewCount}
              overdueDeadlineCount={overdueDeadlineCount}
              unreadMessageCount={unreadMessageCount}
              showWordmark={false}
              onLinkClick={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
