"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Menu, X, LogOut } from "lucide-react"
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

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl dark:bg-c-gray-900/80" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
          {/* Mobile menu trigger */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>

          {/* Page title */}
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-c-gray-900 dark:text-c-gray-100">
            {page.name}
          </h1>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-c-snow dark:hover:bg-c-gray-900/50">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-c-gray-100 text-[11px] font-medium text-c-gray-500 dark:bg-c-gray-900 dark:text-c-gray-300">
                  {getInitials(user.name)}
                </div>
                <span className="hidden text-[13px] font-medium text-c-gray-700 sm:inline dark:text-c-gray-300">
                  {user.name}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
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
        </div>
      </header>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-[min(85vw,18rem)] flex-col border-r border-c-gray-100 bg-white shadow-xl dark:border-c-gray-900 dark:bg-c-gray-900">
            <div className="flex items-center justify-between border-b border-c-gray-100 px-4 py-3 dark:border-c-gray-900">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-c-gray-900 text-white">
                  <span className="text-xs font-medium">C</span>
                </div>
                <span className="text-sm font-medium">Cleared</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="h-8 w-8"
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
