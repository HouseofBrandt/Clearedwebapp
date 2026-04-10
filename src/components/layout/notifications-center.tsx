"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Bell,
  Clock,
  AtSign,
  FlaskConical,
  Sparkles,
  Newspaper,
  X,
} from "lucide-react"

/**
 * NotificationsCenter — dashboard redesign
 * ----------------------------------------
 * Triggered by the bell icon (rendered inline here). Opens a centered panel
 * (400px wide) over a dimmed, subtly blurred backdrop.
 *
 * Notifications are grouped Apple-style into five categories, each with its
 * own pastel icon tile and uppercase micro-label:
 *
 *   Deadlines  — red pastel    — due dates, overdue alerts
 *   Mentions   — blue pastel   — tagged in posts, inbox messages
 *   Research   — violet pastel — review queue, research ready for review
 *   Junebug    — green pastel  — answered questions, suggestions
 *   Pippen     — amber pastel  — daily takeaway ready, flagged articles
 *
 * Each item shows: a 5px Cleared-green unread dot, bold source + description,
 * subtitle, and relative timestamp. Groups are separated by 0.5px dividers.
 */

type Category = "deadlines" | "mentions" | "research" | "junebug" | "pippen"

interface Notification {
  id: string
  category: Category
  /** Bold title — the "source" line */
  title: string
  /** Plain subtitle (case ref or context) */
  body: string
  href?: string
  timestamp: string
  read: boolean
}

interface NotificationsCenterProps {
  initialUnreadCount?: number
}

const categoryConfig: Record<
  Category,
  {
    label: string
    icon: typeof Clock
    bg: string
    fg: string
  }
> = {
  deadlines: {
    label: "Deadlines",
    icon: Clock,
    bg: "var(--c-pastel-red-bg)",
    fg: "var(--c-pastel-red-fg)",
  },
  mentions: {
    label: "Mentions",
    icon: AtSign,
    bg: "var(--c-pastel-blue-bg)",
    fg: "var(--c-pastel-blue-fg)",
  },
  research: {
    label: "Research",
    icon: FlaskConical,
    bg: "var(--c-pastel-violet-bg)",
    fg: "var(--c-pastel-violet-fg)",
  },
  junebug: {
    label: "Junebug",
    icon: Sparkles,
    bg: "var(--c-pastel-green-bg)",
    fg: "var(--c-pastel-green-fg)",
  },
  pippen: {
    label: "Pippen",
    icon: Newspaper,
    bg: "var(--c-pastel-amber-bg)",
    fg: "var(--c-pastel-amber-fg)",
  },
}

const CATEGORY_ORDER: Category[] = ["deadlines", "mentions", "research", "junebug", "pippen"]

function timeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Map legacy notification types to new category system. */
function legacyTypeToCategory(type: string): Category {
  switch (type) {
    case "deadline":
      return "deadlines"
    case "review":
      return "research"
    case "message":
      return "mentions"
    case "approval":
      return "research"
    case "system":
      return "deadlines"
    default:
      return "mentions"
  }
}

export function NotificationsCenter({ initialUnreadCount = 0 }: NotificationsCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click (outside the panel body)
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

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Fallback loader — builds notifications from existing endpoints if
  // /api/notifications isn't available.
  const fetchFallbackNotifications = useCallback(async () => {
    const items: Notification[] = []
    const now = new Date().toISOString()

    try {
      const res = await fetch("/api/review/practitioners")
      if (res.ok) {
        const data = await res.json()
        if (data.pendingCount > 0) {
          items.push({
            id: "review-pending",
            category: "research",
            title: "Reviews awaiting you",
            body: `${data.pendingCount} research deliverable${data.pendingCount !== 1 ? "s" : ""} ready for your sign-off`,
            href: "/review",
            timestamp: now,
            read: false,
          })
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const res = await fetch("/api/deadlines?upcoming=true&limit=5")
      if (res.ok) {
        const data = await res.json()
        for (const d of (data.deadlines || []).slice(0, 5)) {
          const due = new Date(d.dueDate)
          const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86400000)
          if (daysLeft <= 7) {
            items.push({
              id: `deadline-${d.id}`,
              category: "deadlines",
              title: d.title || "Upcoming deadline",
              body:
                daysLeft <= 0
                  ? "Overdue"
                  : daysLeft === 1
                  ? "Due tomorrow"
                  : `Due in ${daysLeft} days`,
              href: d.caseId ? `/cases/${d.caseId}` : "/calendar",
              timestamp: d.updatedAt || now,
              read: false,
            })
          }
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const res = await fetch("/api/messages/unread-count")
      if (res.ok) {
        const data = await res.json()
        if (data.count > 0) {
          items.push({
            id: "messages-unread",
            category: "mentions",
            title: "Unread messages",
            body: `${data.count} unread message${data.count !== 1 ? "s" : ""} in your inbox`,
            href: "/inbox",
            timestamp: now,
            read: false,
          })
        }
      }
    } catch {
      /* ignore */
    }

    setNotifications(items)
    setUnreadCount(items.filter((n) => !n.read).length)
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) {
        const data = await res.json()
        // Map legacy shape if the endpoint still returns `type`
        const raw = data.notifications || []
        const mapped: Notification[] = raw.map((n: any) => ({
          id: n.id,
          category: n.category || legacyTypeToCategory(n.type || ""),
          title: n.title,
          body: n.body,
          href: n.href,
          timestamp: n.timestamp,
          read: !!n.read,
        }))
        setNotifications(mapped)
        setUnreadCount(data.unreadCount ?? mapped.filter((n) => !n.read).length)
      } else {
        await fetchFallbackNotifications()
      }
    } catch {
      await fetchFallbackNotifications()
    } finally {
      setLoading(false)
    }
  }, [fetchFallbackNotifications])

  const handleOpen = useCallback(() => {
    setOpen((prev) => {
      if (!prev) fetchNotifications()
      return !prev
    })
  }, [fetchNotifications])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id)
      setUnreadCount(updated.filter((n) => !n.read).length)
      return updated
    })
  }, [])

  // Group notifications by category, preserving the spec order
  const grouped: { category: Category; items: Notification[] }[] = CATEGORY_ORDER.map((c) => ({
    category: c,
    items: notifications.filter((n) => n.category === c),
  })).filter((g) => g.items.length > 0)

  return (
    <>
      {/* Bell trigger — styled for the light Header bar */}
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center transition-colors"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--c-gray-50)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell
          className="h-[18px] w-[18px]"
          strokeWidth={1.5}
          style={{ color: "var(--c-gray-400)" }}
        />
        {unreadCount > 0 && (
          <span
            className="absolute flex items-center justify-center"
            style={{
              top: 2,
              right: 2,
              height: 16,
              minWidth: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "#EF4444",
              color: "#FFFFFF",
              fontFamily: "var(--font-dm)",
              fontSize: 9,
              fontWeight: 500,
              boxShadow: "0 0 0 1.5px var(--c-snow)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Modal backdrop + centered panel */}
      {open && (
        <div
          className="fixed inset-0 flex items-start justify-center"
          style={{
            zIndex: 200,
            paddingTop: "10vh",
            background: "rgba(20, 24, 32, 0.32)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            animation: "fadeIn 180ms var(--ease-smooth) both",
          }}
        >
          <div
            ref={panelRef}
            className="flex flex-col overflow-hidden"
            style={{
              width: 400,
              maxHeight: "72vh",
              background: "var(--c-white)",
              border: "0.5px solid var(--border-tertiary)",
              borderRadius: 16,
              boxShadow: "0 24px 64px rgba(10,22,40,0.18), 0 4px 16px rgba(10,22,40,0.06)",
              animation: "cardIn 220ms var(--ease-out-expo) both",
            }}
          >
            {/* Sticky header */}
            <div
              className="flex items-center justify-between px-7 py-5 shrink-0"
              style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-editorial)",
                  fontWeight: 300,
                  fontSize: 24,
                  color: "var(--c-gray-800)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1,
                }}
              >
                Notifications
              </h2>
              {notifications.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="transition-opacity hover:opacity-70"
                  style={{
                    fontFamily: "var(--font-dm)",
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "var(--c-cleared-green)",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-20 text-center">
                  <div
                    className="inline-block h-5 w-5 rounded-full animate-spin"
                    style={{
                      border: "1.5px solid var(--c-gray-100)",
                      borderTopColor: "var(--c-cleared-green)",
                    }}
                  />
                </div>
              ) : grouped.length === 0 ? (
                <div className="py-20 text-center px-7">
                  <div
                    className="mx-auto mb-4 flex items-center justify-center"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: "var(--c-snow)",
                    }}
                  >
                    <Bell
                      className="h-5 w-5"
                      strokeWidth={1.5}
                      style={{ color: "var(--c-gray-300)" }}
                    />
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-editorial)",
                      fontSize: 18,
                      fontWeight: 300,
                      fontStyle: "italic",
                      color: "var(--c-gray-400)",
                      lineHeight: 1.5,
                    }}
                  >
                    You&rsquo;re all caught up.
                  </p>
                  <p
                    className="mt-1"
                    style={{
                      fontFamily: "var(--font-dm)",
                      fontSize: 12,
                      fontWeight: 300,
                      color: "var(--c-gray-300)",
                    }}
                  >
                    No new notifications right now.
                  </p>
                </div>
              ) : (
                grouped.map((group, gi) => {
                  const cfg = categoryConfig[group.category]
                  const Icon = cfg.icon
                  return (
                    <section
                      key={group.category}
                      style={{
                        borderBottom:
                          gi < grouped.length - 1
                            ? "0.5px solid var(--border-tertiary)"
                            : "none",
                      }}
                    >
                      {/* Group header */}
                      <div
                        className="flex items-center gap-2.5 px-7 pt-5 pb-3"
                      >
                        <div
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 6,
                            background: cfg.bg,
                          }}
                        >
                          <Icon className="h-[11px] w-[11px]" strokeWidth={2} style={{ color: cfg.fg }} />
                        </div>
                        <span
                          style={{
                            fontFamily: "var(--font-dm)",
                            fontSize: 10,
                            fontWeight: 500,
                            textTransform: "uppercase",
                            letterSpacing: "0.2em",
                            color: "var(--c-gray-500)",
                          }}
                        >
                          {cfg.label}
                        </span>
                      </div>

                      {/* Items */}
                      {group.items.map((n, ii) => {
                        const Wrapper: any = n.href ? Link : "div"
                        const wrapperProps: any = n.href
                          ? { href: n.href, onClick: () => setOpen(false) }
                          : {}
                        return (
                          <div key={n.id} className="group">
                            <Wrapper
                              {...wrapperProps}
                              className="flex items-start gap-3 px-7 py-3 transition-colors hover:bg-[var(--c-snow)] cursor-pointer"
                              style={{
                                borderTop: ii > 0 ? "0.5px solid var(--border-tertiary)" : "none",
                              }}
                            >
                              {/* Unread dot (5px Cleared green) */}
                              <div
                                className="shrink-0 mt-[9px]"
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: "50%",
                                  background: n.read ? "transparent" : "var(--c-cleared-green)",
                                }}
                              />

                              <div className="flex-1 min-w-0">
                                <div
                                  className="flex items-center justify-between gap-2"
                                >
                                  <p
                                    className="truncate"
                                    style={{
                                      fontFamily: "var(--font-dm)",
                                      fontSize: 13,
                                      fontWeight: 500,
                                      color: "var(--c-gray-800)",
                                    }}
                                  >
                                    {n.title}
                                  </p>
                                  <span
                                    className="shrink-0"
                                    style={{
                                      fontFamily: "var(--font-dm)",
                                      fontSize: 11,
                                      fontWeight: 300,
                                      color: "var(--c-gray-300)",
                                    }}
                                  >
                                    {timeAgo(n.timestamp)}
                                  </span>
                                </div>
                                <p
                                  className="mt-0.5 line-clamp-2"
                                  style={{
                                    fontFamily: "var(--font-dm)",
                                    fontSize: 13,
                                    fontWeight: 300,
                                    lineHeight: 1.6,
                                    color: "var(--c-gray-500)",
                                  }}
                                >
                                  {n.body}
                                </p>
                              </div>

                              {/* Dismiss */}
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  dismissNotification(n.id)
                                }}
                                className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                style={{
                                  width: 20,
                                  height: 20,
                                  marginTop: 2,
                                  borderRadius: 4,
                                  color: "var(--c-gray-300)",
                                }}
                                aria-label="Dismiss"
                              >
                                <X className="h-3 w-3" strokeWidth={1.75} />
                              </button>
                            </Wrapper>
                          </div>
                        )
                      })}
                    </section>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  )
}
