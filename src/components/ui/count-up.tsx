"use client"

import { useEffect, useRef, useState } from "react"

interface CountUpProps {
  value: number
  duration?: number
  delay?: number
  className?: string
  style?: React.CSSProperties
  /** Flash color when value > 0 (e.g. "var(--c-danger)") */
  flashColor?: string
}

// easeOutExpo curve
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function CountUp({
  value,
  duration = 800,
  delay = 0,
  className,
  style,
  flashColor,
}: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const [flashing, setFlashing] = useState(false)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    // Respect reduced motion preference
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) {
      setDisplay(value)
      return
    }

    const timeout = setTimeout(() => {
      startTimeRef.current = null

      function animate(timestamp: number) {
        if (startTimeRef.current === null) startTimeRef.current = timestamp
        const elapsed = timestamp - startTimeRef.current
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easeOutExpo(progress)

        setDisplay(Math.round(easedProgress * value))

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        } else {
          // Trigger flash at end if value > 0 and flashColor provided
          if (value > 0 && flashColor) {
            setFlashing(true)
            setTimeout(() => setFlashing(false), 400)
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeout)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration, delay, flashColor])

  return (
    <span
      className={className}
      style={{
        ...style,
        ...(flashing && flashColor
          ? {
              color: flashColor,
              transform: "scale(1.08)",
              transition: "color 400ms ease-out, transform 200ms ease-out",
            }
          : {
              transition: "color 400ms ease-out, transform 200ms ease-out",
            }),
      }}
    >
      {display}
    </span>
  )
}
