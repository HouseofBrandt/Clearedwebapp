"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "@/types"
import { getVisibleNavItems, type NavSection } from "@/components/layout/navigation"

interface SidebarProps {
  user: { name?: string | null; role?: string }
  pendingReviewCount?: number
  overdueDeadlineCount?: number
  unreadMessageCount?: number
  /**
   * Server-computed boolean: is the Junebug Threads workspace visible
   * for this user? Combines the global flag with the optional
   * JUNEBUG_BETA_EMAIL_DOMAINS email-domain gate. When undefined,
   * falls back to the plain global-flag check in navigation.ts so
   * existing callers that haven't been updated yet don't break.
   */
  junebugVisible?: boolean
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
  junebugVisible,
  showWordmark = true,
  onLinkClick,
}: SidebarProps & { showWordmark?: boolean; onLinkClick?: () => void }) {
  const pathname = usePathname()
  const allItems = getVisibleNavItems(user.role, { junebugVisible })

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

      {/* Wordmark area */}
      {showWordmark && (
        <div className="relative px-6 pt-6 pb-5">
          <Link href="/dashboard" className="group flex items-center gap-2.5" onClick={onLinkClick}>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-[10px] shrink-0"
              style={{
                background: "linear-gradient(135deg, #2A8FA8 0%, #1E6E82 100%)",
                boxShadow: "0 2px 8px rgba(42, 143, 168, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <Sparkles className="h-4 w-4 text-white" style={{ opacity: 0.9 }} />
            </div>
            <div>
              <span
                className="text-[17px] text-white block leading-tight"
                style={{ fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: "-0.02em" }}
              >
                Cleared
              </span>
              <span
                className="text-[9.5px] block"
                style={{
                  color: "rgba(255,255,255,0.25)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  marginTop: "1px",
                }}
              >
                Tax Resolution
              </span>
            </div>
          </Link>
          <div
            className="absolute bottom-0 left-6 right-6 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(42,143,168,0.18), transparent)" }}
          />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 relative z-10">
        {SECTION_ORDER.map((section) => {
          const items = sectionItems[section]
          if (items.length === 0) return null
          return (
            <div key={section} className={cn(section !== "MAIN" ? "mt-6" : "")}>
              {section !== "MAIN" && SECTION_LABELS[section] && (
                <p
                  className="mb-2 px-5 flex items-center gap-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.18)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {SECTION_LABELS[section]}
                  <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.name}
                    item={item}
                    pathname={pathname}
                    onLinkClick={onLinkClick}
                    badge={
                      item.name === "Review Queue" && (pendingReviewCount ?? 0) > 0 ? (
                        <span
                          className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] px-1.5 text-[10px] tabular-nums text-white"
                          style={{
                            backgroundColor: "rgba(217,48,37,0.9)",
                            fontWeight: 600,
                            boxShadow: "0 0 6px rgba(217,48,37,0.3)",
                          }}
                        >
                          {pendingReviewCount! > 99 ? "99+" : pendingReviewCount}
                        </span>
                      ) : item.name === "Calendar" && (overdueDeadlineCount ?? 0) > 0 ? (
                        <span
                          className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] px-1.5 text-[10px] tabular-nums text-white"
                          style={{
                            backgroundColor: "rgba(217,119,6,0.9)",
                            fontWeight: 600,
                            boxShadow: "0 0 6px rgba(217,119,6,0.25)",
                          }}
                        >
                          {overdueDeadlineCount! > 99 ? "99+" : overdueDeadlineCount}
                        </span>
                      ) : item.name === "Inbox" && (unreadMessageCount ?? 0) > 0 ? (
                        <span
                          className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] px-1.5 text-[10px] tabular-nums text-white"
                          style={{
                            backgroundColor: "rgba(42,143,168,0.9)",
                            fontWeight: 600,
                            boxShadow: "0 0 6px rgba(42,143,168,0.3)",
                          }}
                        >
                          {unreadMessageCount! > 99 ? "99+" : unreadMessageCount}
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
          className={cn(
            "group relative flex items-center gap-2.5 rounded-lg px-5 py-2 text-[13px] transition-all"
          )}
          style={{
            fontFamily: "var(--font-body)",
            fontWeight: pathname === "/settings" || pathname.startsWith("/settings/") ? 500 : 400,
            color: pathname === "/settings" || pathname.startsWith("/settings/")
              ? "#FFFFFF" : "rgba(255,255,255,0.45)",
            backgroundColor: pathname === "/settings" || pathname.startsWith("/settings/")
              ? "rgba(255,255,255,0.07)" : "transparent",
          }}
        >
          <Settings className="h-4 w-4 flex-shrink-0" style={{ opacity: 0.6 }} />
          <span>Settings</span>
        </Link>

        <div className="mt-2 flex items-center gap-2.5 px-5 py-2.5">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] text-[11px] text-white"
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
            <p
              className="truncate text-[13px] text-white leading-tight"
              style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}
            >
              {user.name || "User"}
            </p>
            <p
              className="truncate text-[10.5px] mt-0.5"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "0.04em",
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
        "group relative flex items-center gap-2.5 rounded-lg transition-all duration-150",
        isActive ? "text-white" : "hover:text-[rgba(255,255,255,0.85)]"
      )}
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "13px",
        fontWeight: isActive ? 500 : 400,
        color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.48)",
        padding: "8px 20px 8px 24px",
        backgroundColor: isActive ? "rgba(42,143,168,0.08)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent"
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-sm"
          style={{
            width: "3px",
            height: "20px",
            backgroundColor: "var(--c-teal)",
            boxShadow: "0 0 8px rgba(42,143,168,0.4), 0 0 20px rgba(42,143,168,0.15)",
          }}
        />
      )}

      <item.icon
        className="h-4 w-4 flex-shrink-0 transition-opacity duration-150"
        style={{ opacity: isActive ? 0.9 : 0.45 }}
      />
      <span className="flex-1 truncate">{item.name}</span>
      {badge}
    </Link>
  )
}

export function Sidebar({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
  junebugVisible,
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
        junebugVisible={junebugVisible}
        showWordmark
      />
    </aside>
  )
}
