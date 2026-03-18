"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FolderOpen,
  ClipboardCheck,
  Settings,
  Shield,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Cases", href: "/cases", icon: FolderOpen },
  { name: "Review Queue", href: "/review", icon: ClipboardCheck },
  { name: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  user: { name?: string | null; role: string }
  pendingReviewCount?: number
}

export function SidebarContent({ user, pendingReviewCount, onLinkClick }: SidebarProps & { onLinkClick?: () => void }) {
  const pathname = usePathname()

  return (
    <>
      <div className="flex h-16 items-center gap-2 px-6" style={{ backgroundColor: "#1B2A4A" }}>
        <Shield className="h-6 w-6 text-white" />
        <span className="text-lg font-bold text-white">Cleared</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onLinkClick}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
              {item.name === "Review Queue" && pendingReviewCount != null && pendingReviewCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">
                  {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {user.name?.charAt(0) || "U"}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
          </div>
        </div>
      </div>
    </>
  )
}

export function Sidebar({ user, pendingReviewCount }: SidebarProps) {
  return (
    <div className="hidden w-64 flex-col border-r bg-card lg:flex">
      <SidebarContent user={user} pendingReviewCount={pendingReviewCount} />
    </div>
  )
}
