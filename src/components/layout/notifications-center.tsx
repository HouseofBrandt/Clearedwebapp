"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Bell,
  Clock,
  FileCheck2,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react"

interface Notification {
  id: string
  type: "deadline" | "review" | "message" | "system" | "approval"
  title: string
  body: string
  href?: string
  timestamp: string
  read: boolean
}

interface NotificationsCenterProps {
  /** Initial unread count from server */
  initialUnreadCount?: number
}

const typeConfig = {
  deadline: { icon: Clock, color: "#D97706", bg: "rgba(217,119,6,0.08)" },
  review: { icon: FileCheck2, color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
  message: { icon: MessageSquare, color: "#2A8FA8", bg: "rgba(42,143,168,0.08)" },
  system: { icon: AlertTriangle, color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
  approval: { icon: CheckCircle2, color: "#10B981", bg: "rgba(16,185,129,0.08)" },
}

function timeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function NotificationsCenter({ initialUnreadCount = 0 }: NotificationsCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open])

  // Fetch notifications when panel opens
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount ?? 0)
      }
    } catch {
      // Use fallback notifications built from existing data
      await fetchFallbackNotifications()
    } finally {
      setLoading(false)
    }
  }, [])

  // Fallback: build notifications from existing API endpoints
  const fetchFallbackNotifications = useCallback(async () => {
    const items: Notification[] = []
    const now = new Date().toISOString()

    // Fetch pending reviews
    try {
      const res = await fetch("/api/review/practitioners")
      if (res.ok) {
        const data = await res.json()
        if (data.pendingCount > 0) {
          items.push({
            id: "review-pending",
            type: "review",
            title: "Pending reviews",
            body: `${data.pendingCount} item${data.pendingCount !== 1 ? "s" : ""} awaiting your review`,
            href: "/review",
            timestamp: now,
            read: false,
          })
        }
      }
    } catch {}

    // Fetch upcoming deadlines
    try {
      const res = await fetch("/api/deadlines?upcoming=true&limit=3")
      if (res.ok) {
        const data = await res.json()
        for (const d of (data.deadlines || []).slice(0, 3)) {
          const due = new Date(d.dueDate)
          const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86400000)
          if (daysLeft <= 3) {
            items.push({
              id: `deadline-${d.id}`,
              type: "deadline",
              title: d.title,
              body: daysLeft <= 0 ? "Overdue" : daysLeft === 1 ? "Due tomorrow" : `Due in ${daysLeft} days`,
              href: d.caseId ? `/cases/${d.caseId}` : "/calendar",
              timestamp: d.updatedAt || now,
              read: false,
            })
          }
        }
      }
    } catch {}

    // Fetch unread messages
    try {
      const res = await fetch("/api/messages/unread-count")
      if (res.ok) {
        const data = await res.json()
        if (data.count > 0) {
          items.push({
            id: "messages-unread",
            type: "message",
            title: "Unread messages",
            body: `${data.count} unread message${data.count !== 1 ? "s" : ""}`,
            href: "/inbox",
            timestamp: now,
            read: false,
          })
        }
      }
    } catch {}

    setNotifications(items)
    setUnreadCount(items.filter(n => !n.read).length)
  }, [])

  const handleOpen = useCallback(() => {
    setOpen((prev) => {
      if (!prev) fetchNotifications()
      return !prev
    })
  }, [fetchNotifications])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter(n => n.id !== id)
      setUnreadCount(updated.filter(n => !n.read).length)
      return updated
    })
  }, [])

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-[var(--c-gray-50)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-[18px] w-[18px]" style={{ color: "var(--c-gray-400)" }} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "#EF4444", boxShadow: "0 0 0 2px var(--c-snow)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[360px] rounded-2xl overflow-hidden"
          style={{
            background: "var(--c-white)",
            border: "1px solid var(--c-gray-100)",
            boxShadow: "var(--shadow-panel)",
            zIndex: 100,
            animation: "cardIn 200ms var(--ease-out-expo) both",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--c-gray-50)" }}
          >
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--c-gray-900)" }}>
              Notifications
            </h3>
            {notifications.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium transition-colors hover:text-[var(--c-teal)]"
                style={{ color: "var(--c-gray-300)" }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center">
                <div
                  className="inline-block h-5 w-5 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "var(--c-gray-200)", borderTopColor: "transparent" }}
                />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--c-gray-200)" }} />
                <p className="text-[13px]" style={{ color: "var(--c-gray-300)" }}>
                  No notifications
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = typeConfig[n.type]
                const Icon = config.icon
                const Wrapper = n.href ? Link : "div"
                const wrapperProps = n.href ? { href: n.href, onClick: () => setOpen(false) } : {}

                return (
                  <Wrapper
                    key={n.id}
                    {...(wrapperProps as any)}
                    className="group flex items-start gap-3 px-4 py-3 transition-colors duration-100 hover:bg-[var(--c-gray-50)] cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--c-gray-50)",
                      background: n.read ? "transparent" : "rgba(42,143,168,0.02)",
                    }}
                  >
                    {/* Icon */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                      style={{ background: config.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: config.color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--c-gray-800)" }}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <div
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: "#3B82F6" }}
                          />
                        )}
                      </div>
                      <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: "var(--c-gray-400)" }}>
                        {n.body}
                      </p>
                      <p className="text-[10px] mt-1" style={{ color: "var(--c-gray-300)" }}>
                        {timeAgo(n.timestamp)}
                      </p>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        dismissNotification(n.id)
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--c-gray-100)]"
                      aria-label="Dismiss notification"
                    >
                      <X className="h-3 w-3" style={{ color: "var(--c-gray-300)" }} />
                    </button>
                  </Wrapper>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              className="px-4 py-2.5 text-center"
              style={{ borderTop: "1px solid var(--c-gray-50)" }}
            >
              <Link
                href="/inbox"
                onClick={() => setOpen(false)}
                className="text-[12px] font-medium transition-colors hover:text-[var(--c-teal)]"
                style={{ color: "var(--c-gray-400)" }}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
