"use client"

/**
 * DashboardGreeting — polish pass (spec §6).
 *
 * Left-aligned editorial greeting. Time-aware copy. Live clock (minute-
 * precision). Optional at-a-glance row above with figures that link to
 * the relevant surface. Each figure is omitted when its count is zero —
 * no empty-state noise.
 *
 * Typography hierarchy:
 *   - At-a-glance row: JetBrains Mono 11px uppercase, gray-500
 *   - Greeting: Instrument Serif 56px (display-xl), weight 400
 *   - Date + clock: JetBrains Mono 13.5px, gray-400
 *
 * Entry animation: fade + rise 12px, greeting first, date 100ms later,
 * at-a-glance 200ms later. Handled via CSS animation-delay.
 */

import { useEffect, useState } from "react"
import Link from "next/link"

interface DashboardGreetingProps {
  userName: string
  /** Optional glance figures. Zero-count items are omitted entirely. */
  glance?: {
    deadlinesThisWeek?: number
    itemsInReview?: number
    newCases?: number
  }
  /** Whether to treat this login as an early-start occurrence (for the
   *  once-a-week "Early start" variant). Decided server-side. */
  isEarlyStart?: boolean
}

export function DashboardGreeting({
  userName,
  glance,
  isEarlyStart = false,
}: DashboardGreetingProps) {
  const firstName = (userName || "").trim().split(/\s+/)[0] || "there"

  // Live clock — re-render each minute on the minute.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    // Set initial value client-side to avoid hydration mismatch.
    setNow(new Date())
    const compute = () => {
      const d = new Date()
      setNow(d)
      return d
    }
    // Align first tick to the next minute boundary, then set a 60s interval.
    const current = compute()
    const msToNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds())
    const timeoutId = window.setTimeout(() => {
      compute()
      const intervalId = window.setInterval(compute, 60_000)
      // Clear interval when the component unmounts
      ;(timeoutId as unknown as { intervalId?: number }).intervalId = intervalId
    }, msToNextMinute)
    return () => {
      window.clearTimeout(timeoutId)
      const intervalId = (timeoutId as unknown as { intervalId?: number }).intervalId
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [])

  // Time-of-day greeting. isEarlyStart overrides morning slot.
  const hour = now?.getHours() ?? 12
  let greeting: string
  if (isEarlyStart) {
    greeting = `Early start, ${firstName}`
  } else if (hour < 11) {
    greeting = `Good morning, ${firstName}`
  } else if (hour < 17) {
    greeting = `Good afternoon, ${firstName}`
  } else if (hour < 22) {
    greeting = `Good evening, ${firstName}`
  } else {
    greeting = `Working late, ${firstName}`
  }

  // Formatted date + clock. During SSR / first paint before `now` is set,
  // render the greeting without the time — it fills in client-side.
  let dateLine = ""
  if (now) {
    const datePart = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    const timePart = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase()
    // Best-effort timezone abbreviation (e.g., "CT"). Not all runtimes
    // expose it; fall back silently.
    let tz = ""
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(now)
      const tzPart = parts.find((p) => p.type === "timeZoneName")
      if (tzPart) tz = " " + tzPart.value
    } catch {
      tz = ""
    }
    dateLine = `${datePart} · ${timePart}${tz}`
  }

  // Build at-a-glance entries, omitting zeros.
  const entries: Array<{ href: string; label: string }> = []
  const d = glance?.deadlinesThisWeek ?? 0
  const r = glance?.itemsInReview ?? 0
  const c = glance?.newCases ?? 0
  if (d > 0) entries.push({ href: "/calendar", label: `${d} DEADLINE${d === 1 ? "" : "S"} THIS WEEK` })
  if (r > 0) entries.push({ href: "/review", label: `${r} ITEM${r === 1 ? "" : "S"} IN REVIEW` })
  if (c > 0) entries.push({ href: "/cases", label: `${c} NEW CASE${c === 1 ? "" : "S"}` })

  return (
    <div className="mb-12">
      {entries.length > 0 && (
        <div className="polish-greeting-glance" aria-label="At a glance">
          {entries.map((e, i) => (
            <span key={e.href} className="flex items-center gap-3">
              <Link href={e.href} className="hover:text-c-teal transition-colors">
                {e.label}
              </Link>
              {i < entries.length - 1 && <span className="sep" aria-hidden>·</span>}
            </span>
          ))}
        </div>
      )}
      <div className="polish-greeting-wrap">
        <h1 className="polish-greeting-name">{greeting}</h1>
        <p className="polish-greeting-date" suppressHydrationWarning>
          {dateLine || "\u00A0"}
        </p>
      </div>
    </div>
  )
}
