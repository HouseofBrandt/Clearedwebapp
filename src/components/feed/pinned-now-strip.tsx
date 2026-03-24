"use client"

import Link from "next/link"
import { Pin } from "lucide-react"

interface PinnedNowStripProps {
  posts: any[]
}

export function PinnedNowStrip({ posts }: PinnedNowStripProps) {
  if (!posts || posts.length === 0) return null

  return (
    <div className="mx-4 mt-2 mb-2 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Pin className="h-3 w-3" />
        <span className="font-medium">Pinned</span>
      </div>
      {posts.slice(0, 5).map((post) => (
        <div
          key={post.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors text-sm"
        >
          <span className="text-base shrink-0">
            {post.eventType === "deadline_warning"
              ? "\uD83D\uDD34"
              : post.eventType === "banjo_complete"
                ? "\uD83E\uDE95"
                : post.postType === "task" || post.postType === "task_created"
                  ? "\u2610"
                  : "\uD83D\uDCCC"}
          </span>
          <span className="flex-1 text-foreground/80 text-[13px] truncate">
            {post.content || post.taskTitle || "Pinned post"}
          </span>
          {post.case && (
            <Link
              href={`/cases/${post.case.id}`}
              className="text-xs text-primary hover:underline shrink-0"
            >
              #{post.case.clientName || post.case.tabsNumber}
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
