export const DEFAULT_TIMEZONE = "America/Chicago"

const TIMEZONE_STORAGE_KEY = "cleared-user-timezone"

export function getUserTimezone(userPreference?: string | null): string {
  if (userPreference) return userPreference
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(TIMEZONE_STORAGE_KEY)
    if (stored) return stored
  }
  return DEFAULT_TIMEZONE
}

export function setUserTimezone(timezone: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone)
  }
}

export function formatInTimezone(
  date: Date | string,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const tz = timezone || DEFAULT_TIMEZONE
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("en-US", { timeZone: tz, ...options })
}

export function formatDateInTimezone(
  date: Date | string,
  timezone?: string
): string {
  return formatInTimezone(date, timezone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatTimeInTimezone(
  date: Date | string,
  timezone?: string
): string {
  return formatInTimezone(date, timezone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function formatDateTimeInTimezone(
  date: Date | string,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return formatInTimezone(date, timezone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  })
}

export function formatRelativeInTimezone(
  date: Date | string,
  timezone?: string
): string {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDateInTimezone(d, timezone)
}

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
] as const
