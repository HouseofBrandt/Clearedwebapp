"use client"

/**
 * SmartProgress — a Claude-style "thinking" display for long-running
 * async operations. Combines three pieces:
 *
 *   1. A PROGRESS BAR — either real (driven by events) or pseudo
 *      (logarithmic creep toward 90% while waiting, so the user sees
 *      motion without the bar claiming completion prematurely).
 *
 *   2. A HEADLINE — the current phase ("Verifying citations",
 *      "Composing memo"). Changes when the phase advances.
 *
 *   3. A DETAIL LINE — the specific action in flight ("Checking
 *      Renkemeyer, 136 T.C. 137", "Searching IRS.gov for § 1402(a)(13)").
 *      Shown in a fainter style below the headline.
 *
 * Use this anywhere a request may take more than ~2 seconds. It's the
 * difference between "is this stuck?" and "oh, it's thinking."
 *
 * Headlines and details ALWAYS come from the server when we have a
 * stream of events. When we don't, the caller provides a rotating
 * sequence of fallback messages that cycle so the user sees motion.
 */

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Progress } from "./progress"

export interface SmartProgressProps {
  /** Phase headline — the verb of what's happening right now. */
  headline: string
  /** Optional detail line under the headline — the noun being worked on. */
  detail?: string
  /**
   * Percentage (0–100). If undefined, the bar creeps logarithmically
   * toward ~90% over time so the user sees motion without lying about
   * completion.
   */
  percent?: number
  /** Seconds elapsed, if the caller is tracking. Otherwise computed locally. */
  elapsedSeconds?: number
  /**
   * Fallback rotating details. When `detail` is missing the component
   * cycles through these every ~3.5s so the bar never looks frozen.
   * Example: ["Parsing the question", "Searching IRS.gov",
   * "Checking CourtListener", "Drafting the memo"].
   */
  fallbackDetails?: string[]
  /** Whether the operation is still running. Setting false freezes animations. */
  active?: boolean
  /** Visual size. */
  size?: "sm" | "md" | "lg"
  /** Bar color. */
  variant?: "default" | "success" | "warning" | "destructive"
  /** Optional extra className on the outer wrapper. */
  className?: string
}

export function SmartProgress({
  headline,
  detail,
  percent,
  elapsedSeconds,
  fallbackDetails,
  active = true,
  size = "md",
  variant = "default",
  className = "",
}: SmartProgressProps) {
  // Local elapsed-time tracker if the caller didn't provide one.
  const [localElapsed, setLocalElapsed] = useState(0)
  const startedAtRef = useRef<number>(Date.now())

  useEffect(() => {
    if (elapsedSeconds !== undefined) return
    startedAtRef.current = Date.now()
    const id = setInterval(() => {
      if (!active) return
      setLocalElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 500)
    return () => clearInterval(id)
  }, [active, elapsedSeconds])

  const secs = elapsedSeconds ?? localElapsed

  // Logarithmic creep when the caller didn't give us a percent. Starts
  // at 8%, approaches 90% asymptotically. Rationale: users want to see
  // motion but the bar should never pretend it's almost done.
  const [pseudo, setPseudo] = useState(8)
  useEffect(() => {
    if (percent !== undefined || !active) return
    const id = setInterval(() => {
      setPseudo((p) => {
        if (p >= 90) return p
        // Move toward 90 but slow down as we approach.
        const remaining = 90 - p
        return p + Math.max(0.3, remaining * 0.04)
      })
    }, 900)
    return () => clearInterval(id)
  }, [percent, active])

  // When the caller starts providing percent, jump to it and let it drive.
  useEffect(() => {
    if (percent !== undefined) setPseudo(percent)
  }, [percent])

  const displayPercent = percent ?? pseudo

  // Rotate fallback details if the caller didn't give us one.
  const [fallbackIdx, setFallbackIdx] = useState(0)
  useEffect(() => {
    if (detail || !fallbackDetails || fallbackDetails.length <= 1 || !active) return
    const id = setInterval(() => {
      setFallbackIdx((i) => (i + 1) % fallbackDetails.length)
    }, 3500)
    return () => clearInterval(id)
  }, [detail, fallbackDetails, active])

  const shownDetail =
    detail || (fallbackDetails && fallbackDetails[fallbackIdx]) || undefined

  return (
    <div className={`smart-progress ${className}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {active && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin"
            aria-hidden="true"
            style={{ color: "var(--c-gray-400, #9ca3af)" }}
          />
        )}
        <span className="text-sm font-medium">{headline}</span>
        <span
          className="ml-auto text-[11px] tabular-nums"
          style={{ color: "var(--c-gray-400, #9ca3af)" }}
          aria-label="elapsed time"
        >
          {formatElapsed(secs)}
        </span>
      </div>
      <Progress
        value={displayPercent}
        size={size}
        variant={variant}
        showPercent={false}
      />
      {shownDetail && (
        <p
          className="mt-1.5 text-[12px] leading-snug truncate"
          style={{ color: "var(--c-gray-400, #9ca3af)" }}
          aria-live="polite"
          aria-atomic="true"
        >
          {shownDetail}
        </p>
      )}
    </div>
  )
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, "0")}s`
}
