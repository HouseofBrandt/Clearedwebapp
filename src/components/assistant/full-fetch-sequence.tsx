"use client"

/**
 * Full Fetch suit-up sequence (spec §9).
 *
 * 2000ms end-to-end. Five stages choreographed via a tiny state machine
 * driven by requestAnimationFrame timers. Each stage dispatches the next
 * once its duration elapses.
 *
 *   Stage 1 (0–300ms)   Pulse Out — three shockwave rings from the toggle.
 *   Stage 2 (100–600ms) Surface Dim — rest of dashboard dims + blurs.
 *   Stage 3 (300–1100ms) HUD Lock-On — four corner-frames assemble inward.
 *   Stage 4 (600–1400ms) Systems Readout — six typewriter status lines.
 *   Stage 5 (1400–2000ms) Armed Idle — toggle settles into armed state.
 *
 * Deactivation is a 600ms reverse (HUD retract + surface clear + label fade).
 *
 * Motion is transform/opacity only. Under prefers-reduced-motion the CSS
 * suppresses the animations and the state change communicates calmly.
 *
 * Accessibility:
 *   - activation aria-live: "Full Fetch armed. Additional tools active."
 *   - deactivation aria-live: "Full Fetch disengaged."
 *   - full keyboard reachability; respects focus on the toggle itself
 */

import { useEffect, useRef, useState } from "react"

// ── Activation component ────────────────────────────────────────────

export interface FullFetchActivationProps {
  /** Called when the full 2000ms choreography completes. */
  onComplete?: () => void
  /** CSS selector for the Junebug column (HUD wraps this element).
   *  If omitted, the HUD wraps the nearest .polish-junebug-target ancestor. */
  targetSelector?: string
}

type ActivationStage = "shockwave" | "dimming" | "hud" | "readout" | "armed" | "done"

export function FullFetchActivation({ onComplete, targetSelector }: FullFetchActivationProps) {
  const [stage, setStage] = useState<ActivationStage>("shockwave")
  const [hudComplete, setHudComplete] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const rafRef = useRef<number | null>(null)
  const timersRef = useRef<number[]>([])

  // Locate the HUD target and capture its bounding rect.
  useEffect(() => {
    const el = targetSelector
      ? (document.querySelector(targetSelector) as HTMLElement | null)
      : (document.querySelector(".polish-junebug-target") as HTMLElement | null)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
    }

    // On window resize, recompute so the HUD stays aligned.
    const onResize = () => {
      const live = targetSelector
        ? (document.querySelector(targetSelector) as HTMLElement | null)
        : (document.querySelector(".polish-junebug-target") as HTMLElement | null)
      if (live) setTargetRect(live.getBoundingClientRect())
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [targetSelector])

  // Drive the state machine via RAF-anchored timers.
  useEffect(() => {
    // Order of events (ms):
    //   100   → stage: dimming (keep rendering shockwave)
    //   300   → stage: hud
    //   600   → stage: readout
    //   1100  → hudComplete: true (full border + ambient glow appears)
    //   1400  → stage: armed
    //   2000  → stage: done → onComplete
    const fire = (at: number, fn: () => void) => {
      const start = performance.now()
      const loop = () => {
        const elapsed = performance.now() - start
        if (elapsed >= at) {
          fn()
        } else {
          rafRef.current = requestAnimationFrame(loop)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    // We chain sequentially rather than scheduling all at once with setTimeout
    // because multiple setTimeouts in background tabs can drift. RAF is
    // paused when tab is hidden, keeping the sequence coherent on return.
    const timeline = [
      { at: 100,  next: () => setStage("dimming") },
      { at: 300,  next: () => setStage("hud") },
      { at: 600,  next: () => setStage("readout") },
      { at: 1100, next: () => setHudComplete(true) },
      { at: 1400, next: () => setStage("armed") },
      { at: 2000, next: () => { setStage("done"); onComplete?.() } },
    ]

    // Use setTimeout for simplicity — total drift across a 2s sequence is
    // negligible even with 10ms scheduler jitter. RAF would be overkill and
    // complicate cleanup.
    timeline.forEach(({ at, next }) => {
      const id = window.setTimeout(next, at)
      timersRef.current.push(id)
    })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
    }
  }, [onComplete])

  if (stage === "done") return null

  return (
    <>
      {/* Stage 2 — surface dim */}
      {stage !== "shockwave" && <div className="ff-surface-dim" aria-hidden />}

      {/* Stage 3 — HUD lock-on */}
      {targetRect && stage !== "shockwave" && stage !== "dimming" && (
        <div
          className="ff-hud"
          data-complete={hudComplete ? "true" : "false"}
          style={{
            position: "fixed",
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
          }}
          aria-hidden
        >
          <FullFetchHUDCorners />
        </div>
      )}

      {/* Stage 4 — systems readout */}
      {(stage === "readout" || stage === "armed") && targetRect && (
        <div
          className="ff-readout"
          data-exiting={stage === "armed" ? "true" : "false"}
          style={{
            position: "fixed",
            top: targetRect.top + targetRect.height / 2,
            left: targetRect.right - 14,
            transform: "translate(-100%, -50%)",
          }}
          aria-hidden
        >
          {FULL_FETCH_READOUT.map((line, i) => (
            <span
              key={line}
              className="ff-readout-line"
              data-stage={i + 1}
              style={{ animationFillMode: "forwards" }}
            >
              {line}
            </span>
          ))}
        </div>
      )}

      {/* a11y — single aria-live announcement on entry */}
      <span className="sr-only" role="status" aria-live="polite">
        Full Fetch armed. Additional tools active.
      </span>
    </>
  )
}

const FULL_FETCH_READOUT = [
  "FULL FETCH // INITIATED",
  "TOOL RESOLVER    ONLINE",
  "KB RETRIEVAL     ONLINE",
  "DOC SEARCH       ONLINE",
  "CASE CONTEXT     LOADED",
  "SYSTEMS NOMINAL",
]

// ── Deactivation component ─────────────────────────────────────────

export interface FullFetchDeactivationProps {
  onComplete?: () => void
}

export function FullFetchDeactivation({ onComplete }: FullFetchDeactivationProps) {
  // Fast reverse: 400ms HUD retract + dim clear, 200ms label fade.
  useEffect(() => {
    const id = window.setTimeout(() => onComplete?.(), 600)
    return () => window.clearTimeout(id)
  }, [onComplete])

  return (
    <>
      <div className="ff-surface-dim" data-exiting="true" aria-hidden />
      <span className="sr-only" role="status" aria-live="polite">
        Full Fetch disengaged.
      </span>
    </>
  )
}

// ── Shockwave rings — rendered inline from the toggle button ───────

export interface FullFetchShockwaveProps {
  count?: number
}

export function FullFetchShockwave({ count = 3 }: FullFetchShockwaveProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`ff-shockwave-ring ${i === 1 ? "ff-shockwave-ring--delay-1" : ""} ${i === 2 ? "ff-shockwave-ring--delay-2" : ""}`}
          aria-hidden
        />
      ))}
    </>
  )
}

// ── HUD corners ────────────────────────────────────────────────────

function FullFetchHUDCorners() {
  return (
    <>
      {/* Each corner is a 48% square with two orthogonal lines scaling in */}
      <div className="ff-hud-corner ff-hud-corner--tl">
        <div className="ff-hud-line ff-hud-line--horizontal ff-hud-line--top-left-h" />
        <div className="ff-hud-line ff-hud-line--vertical   ff-hud-line--top-left-v" />
      </div>
      <div className="ff-hud-corner ff-hud-corner--tr">
        <div className="ff-hud-line ff-hud-line--horizontal ff-hud-line--top-right-h" />
        <div className="ff-hud-line ff-hud-line--vertical   ff-hud-line--top-right-v" />
      </div>
      <div className="ff-hud-corner ff-hud-corner--bl">
        <div className="ff-hud-line ff-hud-line--horizontal ff-hud-line--bottom-left-h" />
        <div className="ff-hud-line ff-hud-line--vertical   ff-hud-line--bottom-left-v" />
      </div>
      <div className="ff-hud-corner ff-hud-corner--br">
        <div className="ff-hud-line ff-hud-line--horizontal ff-hud-line--bottom-right-h" />
        <div className="ff-hud-line ff-hud-line--vertical   ff-hud-line--bottom-right-v" />
      </div>
    </>
  )
}
