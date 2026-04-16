/**
 * Shared formatting utilities for the Cleared platform.
 * Use these everywhere instead of inline formatting.
 */

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n)

/** Format a number as USD currency (no cents) */
export function formatCurrency(amount: number | null | undefined): string {
  if (!isFiniteNumber(amount)) return "$0"
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** Format a number as USD currency (with cents) */
export function formatCurrencyPrecise(amount: number | null | undefined): string {
  if (!isFiniteNumber(amount)) return "$0.00"
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Compact currency for stat cards: $1.2M, $345K, $7,890 */
export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (!isFiniteNumber(amount)) return "$0"
  const abs = Math.abs(amount)
  const sign = amount < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return formatCurrency(amount)
}

/** Format an integer percentage (e.g. 0.4321 -> "43%") */
export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (!isFiniteNumber(value)) return "—"
  return `${(value * 100).toFixed(fractionDigits)}%`
}

/** Format a date as relative time (e.g., "2 hours ago", "3 days ago") */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Format a number with commas */
export function formatNumber(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return "0"
  return n.toLocaleString("en-US")
}

/** Format a date as the firm-standard absolute style: "Apr 16, 2026" */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** Format a date+time as "Apr 16, 2026 · 2:30 PM" */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (isNaN(date.getTime())) return "—"
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${day} · ${time}`
}

/**
 * Format a duration in seconds as a compact human string (e.g. "2m 14s").
 * Useful for showing review timing and Banjo elapsed time consistently.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!isFiniteNumber(seconds) || seconds < 0) return "0s"
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM === 0 ? `${h}h` : `${h}h ${remM}m`
}

/** Initials from a name — for avatars (handles middle names, accents) */
export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
