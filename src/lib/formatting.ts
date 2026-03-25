/**
 * Shared formatting utilities for the Cleared platform.
 * Use these everywhere instead of inline formatting.
 */

/** Format a number as USD currency (no cents) */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0"
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** Format a number as USD currency (with cents) */
export function formatCurrencyPrecise(amount: number | null | undefined): string {
  if (amount == null) return "$0.00"
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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
  if (n == null) return "0"
  return n.toLocaleString("en-US")
}
