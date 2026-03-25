"use client"

import Link from "next/link"
import { Pin } from "lucide-react"

interface PinnedNowStripProps {
  posts: any[]
}

export function PinnedNowStrip({ posts }: PinnedNowStripProps) {
  if (!posts || posts.length === 0) return null

  return (
    <div className="mb-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--c-gray-300)' }}>
        <Pin className="h-3 w-3" />
        <span className="font-medium">Pinned</span>
      </div>
      {posts.slice(0, 5).map((post) => (
        <div
          key={post.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ background: 'var(--c-snow)', border: '1px solid var(--c-gray-100)' }}
        >
          <span className="text-sm shrink-0">
            {post.eventType === "deadline_warning"
              ? "\uD83D\uDD34"
              : post.eventType === "banjo_complete"
                ? "\uD83E\uDE95"
                : post.postType === "task" || post.postType === "task_created"
                  ? "\u2610"
                  : "\uD83D\uDCCC"}
          </span>
          <span className="flex-1 text-[13px] truncate" style={{ color: 'var(--c-gray-500)' }}>
            {post.content || post.taskTitle || "Pinned post"}
          </span>
          {post.case && (
            <Link
              href={`/cases/${post.case.id}`}
              className="font-mono text-xs font-medium hover:underline shrink-0"
              style={{ color: 'var(--c-teal)' }}
            >
              #{post.case.clientName || post.case.tabsNumber}
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
