import {
  LayoutDashboard,
  FolderOpen,
  ClipboardCheck,
  Calendar,
  BookOpen,
  Inbox,
  Settings,
  ScrollText,
  BarChart3,
  Calculator,
  FileSearch,
  Scale,
  ShieldAlert,
  TrendingUp,
  Shield,
  Network,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  description: string
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Daily brief and action queue" },
  { name: "Cases", href: "/cases", icon: FolderOpen, description: "Active matters" },
  { name: "Review Queue", href: "/review", icon: ClipboardCheck, description: "Approve AI work product" },
  { name: "Calendar", href: "/calendar", icon: Calendar, description: "Deadlines and hearings" },
  { name: "Portfolio", href: "/portfolio", icon: BarChart3, description: "Firm-wide case health" },
  { name: "Knowledge Base", href: "/knowledge", icon: BookOpen, description: "Firm institutional memory" },
  { name: "Return Compliance", href: "/rcc", icon: Calculator, description: "IRS transcript analysis & return estimator" },
  { name: "Compliance", href: "/compliance-gap", icon: FileSearch, description: "Unfiled year analysis & gap closing" },
  { name: "OIC Modeler", href: "/oic-modeler", icon: Scale, description: "Offer in Compromise RCP modeling" },
  { name: "Penalty Abatement", href: "/penalty-abatement", icon: ShieldAlert, description: "FTA & reasonable cause letters" },
  { name: "Inbox", href: "/inbox", icon: Inbox, description: "Messages and alerts" },
  { name: "Settings", href: "/settings", icon: Settings, description: "Workspace preferences" },
  { name: "AI Analytics", href: "/settings/analytics", icon: TrendingUp, description: "AI quality & learning metrics", adminOnly: true },
  { name: "SOC 2 Compliance", href: "/admin/compliance", icon: Shield, description: "SOC 2 Type II compliance tracker", adminOnly: true },
  { name: "Switchboard", href: "/admin/switchboard", icon: Network, description: "AI pipeline visibility", adminOnly: true },
  { name: "Audit Log", href: "/settings/audit-log", icon: ScrollText, description: "System activity log", adminOnly: true },
]

export function getVisibleNavItems(role?: string) {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN")
}

export function getActiveNavItem(pathname: string, role?: string) {
  return getVisibleNavItems(role).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
}

export function getPageContext(pathname: string, role?: string) {
  const active = getActiveNavItem(pathname, role)
  if (active) return active
  return {
    name: "Cleared",
    href: pathname,
    icon: Shield,
    description: "Tax resolution workspace",
  }
}
