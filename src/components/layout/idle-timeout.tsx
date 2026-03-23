"use client"

import { useEffect, useRef } from "react"
import { signOut } from "next-auth/react"

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export function IdleTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    function resetTimer() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        signOut({ callbackUrl: "/login?reason=idle" })
      }, IDLE_TIMEOUT_MS)
    }

    const events = ["mousedown", "keydown", "scroll", "touchstart"]
    events.forEach((e) => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return null
}
