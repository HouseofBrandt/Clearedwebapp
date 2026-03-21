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
        const data = await res.json()
        setCount(data.count)
      } catch {}
    }

    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  if (count === 0) return null

  return (
    <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  )
}
