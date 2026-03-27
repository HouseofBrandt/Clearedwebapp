"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "@/types"
import { getVisibleNavItems, type NavSection } from "@/components/layout/navigation"

interface SidebarProps {
  user: { name?: string | null; role?: string }
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
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

const SECTION_ORDER: NavSection[] = ["MAIN", "TOOLS", "ADMIN"]
const SECTION_LABELS: Record<NavSection, string> = {
  MAIN: "MAIN",
  TOOLS: "TOOLS",
  ADMIN: "ADMIN",
}

/** Items that are pulled out of the normal nav flow */
const STANDALONE_ITEMS = new Set(["Settings"])

export function SidebarContent({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
  showWordmark = true,
  onLinkClick,
}: SidebarProps & { showWordmark?: boolean; onLinkClick?: () => void }) {
  const pathname = usePathname()
  const allItems = getVisibleNavItems(user.role)

  // Group items by section, excluding standalone items
  const sectionItems: Record<NavSection, typeof allItems> = {
    MAIN: [],
    TOOLS: [],
    ADMIN: [],
  }
  for (const item of allItems) {
    if (!STANDALONE_ITEMS.has(item.name)) {
      sectionItems[item.section].push(item)
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: "var(--c-navy-950)" }}>
      {/* Wordmark */}
      {showWordmark && (
        <div className="px-6 pt-5 pb-4">
          <Link href="/dashboard" className="group flex items-center gap-2" onClick={onLinkClick}>
            <span
              className="text-[17px] tracking-[-0.02em] text-white"
              style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
            >
              Cleared
            </span>
          </Link>
        </div>
      )}

      {/* Sectioned Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {SECTION_ORDER.map((section) => {
          const items = sectionItems[section]
          if (items.length === 0) return null
          return (
            <div key={section} className={cn(section !== "MAIN" ? "mt-5" : "")}>
              {section !== "MAIN" && (
                <p
                  className="mb-2 px-5 text-[10px] tracking-[0.1em] uppercase"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.25)",
                    letterSpacing: "0.1em",
                  }}
                >
                  {SECTION_LABELS[section]}
                </p>
              )}
              <div className="space-y-px">
                {items.map((item) => (
                  <NavLink
                    key={item.name}
                    item={item}
                    pathname={pathname}
                    onLinkClick={onLinkClick}
                    badge={
                      item.name === "Review Queue" && (pendingReviewCount ?? 0) > 0 ? (
                        <span
                          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums text-white"
                          style={{ backgroundColor: "var(--c-danger)", fontWeight: 500 }}
                        >
                          {pendingReviewCount! > 99 ? "99+" : pendingReviewCount}
                        </span>
                      ) : item.name === "Calendar" && (overdueDeadlineCount ?? 0) > 0 ? (
                        <span
                          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums text-white"
                          style={{ backgroundColor: "var(--c-warning)", fontWeight: 500 }}
                        >
                          {overdueDeadlineCount! > 99 ? "99+" : overdueDeadlineCount}
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer: Settings + User */}
      <div
        className="px-3 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Settings link */}
        <Link
          href="/settings"
          onClick={onLinkClick}
          className={cn(
            "group flex items-center gap-2.5 rounded-md px-5 py-2 text-[13px] transition-colors",
            pathname === "/settings" || pathname.startsWith("/settings/")
              ? "text-white"
              : "hover:text-[rgba(255,255,255,0.85)]"
          )}
          style={{
            fontFamily: "var(--font-body)",
            fontWeight: pathname === "/settings" || pathname.startsWith("/settings/") ? 500 : 400,
            color: pathname === "/settings" || pathname.startsWith("/settings/")
              ? "#FFFFFF"
              : "rgba(255,255,255,0.55)",
            backgroundColor: pathname === "/settings" || pathname.startsWith("/settings/")
              ? "rgba(255,255,255,0.08)"
              : "transparent",
          }}
        >
          <Settings className="h-4 w-4 flex-shrink-0" style={{ opacity: 0.7 }} />
          <span>Settings</span>
        </Link>

        {/* User card */}
        <div className="mt-2 flex items-center gap-2.5 px-5 py-2">
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] text-white"
            style={{
              backgroundColor: "var(--c-navy-800)",
              fontFamily: "var(--font-body)",
              fontWeight: 500,
            }}
          >
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] text-white"
              style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
            >
              {user.name || "User"}
            </p>
            <p
              className="truncate text-[11px]"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 400,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role || "Member"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Individual nav link ──────────────────────────────────────────── */

function NavLink({
  item,
  pathname,
  onLinkClick,
  badge,
}: {
  item: { name: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; description: string }
  pathname: string
  onLinkClick?: () => void
  badge?: React.ReactNode
}) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <Link
      href={item.href}
      title={item.description}
      onClick={onLinkClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md transition-colors",
        isActive
          ? "text-white"
          : "hover:text-[rgba(255,255,255,0.85)]"
      )}
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "13px",
        fontWeight: isActive ? 500 : 400,
        color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.55)",
        padding: "8px 20px 8px 24px",
        backgroundColor: isActive ? "rgba(255,255,255,0.08)" : "transparent",
        ...(isActive ? {} : {}),
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent"
        }
      }}
    >
      {/* Active left border */}
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
          style={{
            width: "2px",
            height: "16px",
            backgroundColor: "var(--c-teal)",
          }}
        />
      )}

      <item.icon
        className="h-4 w-4 flex-shrink-0"
        style={{ opacity: isActive ? 0.9 : 0.5 }}
      />
      <span className="flex-1 truncate">{item.name}</span>
      {badge}
    </Link>
  )
}

/* ── Outer sidebar wrapper (desktop) ──────────────────────────────── */

export function Sidebar({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
}: SidebarProps) {
  return (
    <aside
      className="hidden flex-shrink-0 lg:flex lg:flex-col"
      style={{ width: "240px", backgroundColor: "var(--c-navy-950)" }}
    >
      <SidebarContent
        user={user}
        pendingReviewCount={pendingReviewCount}
        overdueDeadlineCount={overdueDeadlineCount}
        unreadMessageCount={unreadMessageCount}
        showWordmark
      />
    </aside>
  )
}
