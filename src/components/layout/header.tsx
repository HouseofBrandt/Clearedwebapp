"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Menu, X, LogOut, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getPageContext } from "@/components/layout/navigation"
import { SidebarContent } from "@/components/layout/sidebar"

interface HeaderProps {
  user: { name?: string | null; email?: string | null; role: string }
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
        className="app-header sticky top-0 z-30"
        style={{
          height: "56px",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          background: "rgba(250,251,252,0.78)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: "1px solid var(--c-gray-100)",
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
                className="text-[13px] hidden sm:inline"
                style={{ color: "var(--c-gray-300)", fontWeight: 400 }}
              >
                {segments[0].charAt(0).toUpperCase() + segments[0].slice(1)}
              </span>
              <ChevronRight
                className="h-3 w-3 hidden sm:inline"
                style={{ color: "var(--c-gray-300)" }}
              />
            </>
          )}
          <h1
            className="truncate"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--c-gray-900)",
              letterSpacing: "-0.01em",
            }}
          >
            {page.name}
          </h1>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm transition-all duration-150"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-gray-50)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[11px]"
                style={{
                  background: "linear-gradient(135deg, var(--c-gray-100), var(--c-gray-50))",
                  border: "1px solid var(--c-gray-200)",
                  fontWeight: 600,
                  color: "var(--c-gray-500)",
                }}
              >
                {getInitials(user.name)}
              </div>
              <span
                className="hidden text-[13px] sm:inline"
                style={{ fontWeight: 500, color: "var(--c-gray-700)" }}
              >
                {user.name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" style={{ borderRadius: "12px" }}>
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {user.role}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
                background: "var(--c-navy-950)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                  style={{
                    background: "linear-gradient(135deg, #2A8FA8, #1E6E82)",
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
