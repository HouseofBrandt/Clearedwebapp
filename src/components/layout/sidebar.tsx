"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ROLE_LABELS } from "@/types"
import { UnreadBadge } from "@/components/layout/unread-badge"
import { getVisibleNavItems } from "@/components/layout/navigation"

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

export function SidebarContent({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
  showWordmark = true,
  onLinkClick,
}: SidebarProps & { showWordmark?: boolean; onLinkClick?: () => void }) {
  const pathname = usePathname()
  const navItems = getVisibleNavItems(user.role)
  const workspaceItems = navItems.filter((item) => !item.adminOnly)
  const adminItems = navItems.filter((item) => item.adminOnly)

  return (
    <div className="flex h-full flex-col">
      {/* Wordmark */}
      {showWordmark && (
        <div className="px-5 py-5">
          <Link href="/dashboard" className="group flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors group-hover:bg-slate-800">
              <span className="text-sm font-bold leading-none">C</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              Cleared
            </span>
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {workspaceItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.name}
                href={item.href}
                title={item.description}
                onClick={onLinkClick}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-300"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 flex-shrink-0",
                    isActive
                      ? "text-slate-700 dark:text-slate-300"
                      : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500"
                  )}
                />
                <span className="flex-1 truncate">{item.name}</span>

                {/* Badges — only show when count > 0 */}
                {item.name === "Review Queue" && (pendingReviewCount ?? 0) > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold tabular-nums text-white">
                    {pendingReviewCount! > 99 ? "99+" : pendingReviewCount}
                  </span>
                )}
                {item.name === "Calendar" && (overdueDeadlineCount ?? 0) > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold tabular-nums text-white">
                    {overdueDeadlineCount! > 99 ? "99+" : overdueDeadlineCount}
                  </span>
                )}
                {item.name === "Inbox" && <UnreadBadge initialCount={unreadMessageCount || 0} />}
              </Link>
            )
          })}
        </div>

        {/* Admin section */}
        {adminItems.length > 0 && (
          <div className="mt-6">
            <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Admin
            </p>
            <div className="space-y-0.5">
              {adminItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={item.description}
                    onClick={onLinkClick}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-300"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        isActive
                          ? "text-slate-700 dark:text-slate-300"
                          : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500"
                      )}
                    />
                    <span className="flex-1 truncate">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* User card — bottom */}
      <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
              {user.name || "User"}
            </p>
            <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
              {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role || "Member"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({
  user,
  pendingReviewCount,
  overdueDeadlineCount,
  unreadMessageCount,
}: SidebarProps) {
  return (
    <aside className="hidden w-56 flex-shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col dark:border-slate-800 dark:bg-slate-950">
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
