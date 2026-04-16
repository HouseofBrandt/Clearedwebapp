/**
 * Time-bucket grouping for the thread sidebar (spec §7.3).
 *
 * Groups: Pinned / Today / Yesterday / Previous 7 Days / Previous 30 Days / Older.
 * Uses the browser's local timezone — the practitioner's timezone setting
 * resolution (task A6.5) is handled upstream by the date formatter the
 * browser uses. Since we read `new Date()` here, this is local-tz by default.
 */

import type { JunebugThreadListItem } from "../types"

export type ThreadGroupKey =
  | "pinned"
  | "today"
  | "yesterday"
  | "prev7"
  | "prev30"
  | "older"

export interface ThreadGroup {
  key: ThreadGroupKey
  label: string
  threads: JunebugThreadListItem[]
}

const GROUP_LABELS: Record<ThreadGroupKey, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  prev7: "Previous 7 days",
  prev30: "Previous 30 days",
  older: "Older",
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function groupThreads(threads: JunebugThreadListItem[]): ThreadGroup[] {
  const now = new Date()
  const today = startOfLocalDay(now)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const prev7 = new Date(today); prev7.setDate(prev7.getDate() - 7)
  const prev30 = new Date(today); prev30.setDate(prev30.getDate() - 30)

  const buckets: Record<ThreadGroupKey, JunebugThreadListItem[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    prev7: [],
    prev30: [],
    older: [],
  }

  for (const t of threads) {
    if (t.pinned) {
      buckets.pinned.push(t)
      continue
    }
    const dt = new Date(t.lastMessageAt)
    if (dt >= today) buckets.today.push(t)
    else if (dt >= yesterday) buckets.yesterday.push(t)
    else if (dt >= prev7) buckets.prev7.push(t)
    else if (dt >= prev30) buckets.prev30.push(t)
    else buckets.older.push(t)
  }

  // Stable within a bucket: already sorted by lastMessageAt desc from the server.
  const order: ThreadGroupKey[] = ["pinned", "today", "yesterday", "prev7", "prev30", "older"]
  return order
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ key: k, label: GROUP_LABELS[k], threads: buckets[k] }))
}

/**
 * Short relative-time string for the sidebar row:
 *   "2m" / "3h" / "yesterday" / "Apr 12" / "Mar 2024"
 */
export function formatRelativeShort(iso: string): string {
  const now = new Date()
  const dt = new Date(iso)
  const diffMs = now.getTime() - dt.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const today = startOfLocalDay(now)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  if (dt >= yesterday) return "yesterday"
  if (dt.getFullYear() === now.getFullYear()) {
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}
