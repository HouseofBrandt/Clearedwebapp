"use client"

import { useState, useEffect } from "react"

interface UnreadBadgeProps {
  initialCount?: number
}

export function UnreadBadge({ initialCount = 0 }: UnreadBadgeProps) {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/messages/unread-count")
        if (res.ok) {
          const data = await res.json()
          setCount(data.count)
        }
      } catch {
        // Silently fail — badge will show stale count
      }
    }

    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  if (count === 0) return null

  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-600 px-1.5 text-[10px] font-medium tabular-nums text-white dark:bg-slate-500">
      {count > 99 ? "99+" : count}
    </span>
  )
}
