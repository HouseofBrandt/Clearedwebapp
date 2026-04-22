"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings, Sparkles, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "@/types"
import { getVisibleNavItems, type NavSection } from "@/components/layout/navigation"

/**
 * Sidebar tier classification (polish spec §10.1). Hierarchy is subtle but
 * meaningful: primary items feel anchored, secondary/tertiary recede.
 *
 * Primary — the daily landing surfaces a practitioner returns to
 *   constantly: Dashboard, Daily News, Cases, Review Queue, Tasks.
 * Secondary — second-tier surfaces: Calendar, Portfolio, Inbox, Research,
 *   Knowledge Base, Junebug.
 * Tertiary — tools & admin: Transcript Decoder, OIC Modeler, SOC 2, etc.
 */
const TIER_PRIMARY = new Set([
  "Dashboard", "Daily News", "Cases", "Review Queue", "Tasks",
])
const TIER_SECONDARY = new Set([
  "Calendar", "Portfolio", "Inbox", "Research", "Knowledge Base", "Junebug",
])
function getTier(name: string): "primary" | "secondary" | "tertiary" {
  if (TIER_PRIMARY.has(name)) return "primary"
  if (TIER_SECONDARY.has(name)) return "secondary"
  return "tertiary"
}

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
  MAIN: "",
  TOOLS: "Tools",
  ADMIN: "Admin",
}

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
    <div
      className="flex h-full flex-col relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0D1B2E 0%, #0A1628 40%, #081220 100%)",
      }}
    >
      {/* Subtle dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.5' fill='%23fff'/%3E%3C/svg%3E")`,
          backgroundSize: "20px 20px",
        }}
      />

      {/* Wordmark area (polish §10.4) */}
      {showWordmark && (
        <div className="relative pt-6 pb-5">
          <Link href="/dashboard" onClick={onLinkClick} className="polish-sidebar-wordmark">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[10px] shrink-0"
              style={{
                background: "linear-gradient(135deg, #2A8FA8 0%, #1E6E82 100%)",
                boxShadow: "0 2px 8px rgba(42, 143, 168, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <Sparkles className="h-[18px] w-[18px] text-white" style={{ opacity: 0.9 }} />
            </div>
            <div>
              <span className="polish-sidebar-wordmark-title">Cleared</span>
              <span className="polish-sidebar-wordmark-tag">Tax Resolution</span>
            </div>
          </Link>
          <div
            className="absolute bottom-0 left-6 right-6 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(42,143,168,0.18), transparent)" }}
          />
        </div>
      )}

      {/* Navigation (polish §10.1, §10.3) */}
      <nav className="flex-1 overflow-y-auto pb-4 relative z-10">
        {SECTION_ORDER.map((section) => {
          const items = sectionItems[section]
          if (items.length === 0) return null
          return (
            <div key={section} className={cn(section !== "MAIN" ? "mt-4" : "mt-1")}>
              {section !== "MAIN" && SECTION_LABELS[section] && (
                <p className="polish-sidebar-section-header">
                  {SECTION_LABELS[section]}
                </p>
              )}
              <div>
                {items.map((item) => (
                  <NavLink
                    key={item.name}
                    item={item}
                    pathname={pathname}
                    onLinkClick={onLinkClick}
                    badgeKind={
                      item.name === "Review Queue" && (pendingReviewCount ?? 0) > 0 ? "danger"
                      : item.name === "Calendar" && (overdueDeadlineCount ?? 0) > 0 ? "warning"
                      : item.name === "Inbox" && (unreadMessageCount ?? 0) > 0 ? "info"
                      : null
                    }
                    badgeCount={
                      item.name === "Review Queue" ? pendingReviewCount
                      : item.name === "Calendar" ? overdueDeadlineCount
                      : item.name === "Inbox" ? unreadMessageCount
                      : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer: Settings + User */}
      <div className="relative z-10 px-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 100%, rgba(42,143,168,0.04), transparent 70%)",
          }}
        />

        <Link
          href="/settings"
          onClick={onLinkClick}
          className="polish-sidebar-item"
          data-tier="secondary"
          data-active={pathname === "/settings" || pathname.startsWith("/settings/")}
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          <span>Settings</span>
        </Link>

        <Link
          href="/settings/profile"
          onClick={onLinkClick}
          className="polish-sidebar-userblock"
          aria-label="Open user menu"
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-[12px] text-white"
            style={{
              background: "linear-gradient(135deg, #2B5080, #1E3A5F)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
            }}
          >
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="polish-sidebar-userblock-name truncate">
              {user.name || "User"}
            </p>
            <p className="polish-sidebar-userblock-role truncate">
              {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role || "Member"}
            </p>
          </div>
          <ChevronRight className="polish-sidebar-userblock-chevron h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}

type BadgeKind = "danger" | "warning" | "info" | null

function NavLink({
  item,
  pathname,
  onLinkClick,
  badgeKind,
  badgeCount,
}: {
  item: { name: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; description: string }
  pathname: string
  onLinkClick?: () => void
  badgeKind: BadgeKind
  badgeCount?: number
}) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
  const tier = getTier(item.name)

  return (
    <Link
      href={item.href}
      title={item.description}
      onClick={onLinkClick}
      aria-current={isActive ? "page" : undefined}
      className="polish-sidebar-item"
      data-tier={tier}
      data-active={isActive}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">{item.name}</span>
      {badgeKind && badgeCount && badgeCount > 0 && (
        <span
          className={cn(
            "polish-sidebar-badge",
            badgeKind === "info" && "polish-sidebar-badge--info",
            badgeKind === "warning" && "polish-sidebar-badge--warning",
          )}
          aria-label={`${badgeCount} ${badgeCount === 1 ? "item" : "items"}`}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </Link>
  )
}

export function Sidebar({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
}: SidebarProps) {
  return (
    <aside
      className="hidden flex-shrink-0 lg:flex lg:flex-col"
      style={{ width: "248px" }}
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
