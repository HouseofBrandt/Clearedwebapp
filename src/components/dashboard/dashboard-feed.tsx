"use client"

import React, { useState, useCallback } from "react"
import Link from "next/link"
import { MessageCircle, Eye, MoreHorizontal } from "lucide-react"
import { PippenTakeawayCard } from "@/components/feed/pippen-takeaway-card"

/**
 * DashboardFeed
 * -------------
 * Editorial feed renderer for the redesigned dashboard.
 *
 * Unlike the full FeedCard (which lives on /feed and has task cards, file
 * shares, reply threading, edit-in-place, acknowledge counts, copy buttons,
 * etc.), this renderer is deliberately minimal:
 *
 *   - Posts have NO card wrapper. They float on the canvas with 48px of
 *     whitespace between them.
 *   - Header row: pastel avatar + name + timestamp + optional category tag
 *   - Body: DM Sans 15px weight 300, line-height 1.8
 *   - Actions row: Reply / Noted / More (11px uppercase, thin-stroke icons)
 *   - Older posts fade to 50% opacity (natural hierarchy, no pagination)
 *
 * Pippen's daily brief still routes to the dedicated PippenTakeawayCard
 * (gradient accent, italic pull-quote).
 *
 * System events, tasks, and file shares are intentionally filtered out —
 * they belong in the Notification Center or the /feed page. The dashboard
 * home is for communication and insight, not task management.
 */

interface DashboardFeedProps {
  posts: any[]
  currentUser: { id: string; name: string }
  onRefresh?: () => void
}

// ── Helpers ─────────────────────────────────────────────────────

function getInitials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

/** Deterministically choose a pastel palette from the spec's five colors. */
function paletteForName(name: string): { bg: string; fg: string } {
  const palettes: { bg: string; fg: string }[] = [
    { bg: "var(--c-pastel-blue-bg)", fg: "var(--c-pastel-blue-fg)" },
    { bg: "var(--c-pastel-violet-bg)", fg: "var(--c-pastel-violet-fg)" },
    { bg: "var(--c-pastel-pink-bg)", fg: "var(--c-pastel-pink-fg)" },
    { bg: "var(--c-pastel-amber-bg)", fg: "var(--c-pastel-amber-fg)" },
    { bg: "var(--c-pastel-green-bg)", fg: "var(--c-pastel-green-fg)" },
  ]
  let hash = 0
  for (let i = 0; i < (name || "").length; i++) {
    hash = (hash * 31 + (name || "").charCodeAt(i)) >>> 0
  }
  return palettes[hash % palettes.length]
}

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

/**
 * Parse a line of inline markup. Scoped to the primitives the feed actually
 * uses: **bold**, @mentions, #case-tags, $amounts. No full markdown here.
 */
function parseInline(text: string, caseData?: any): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /\*\*([^*]+)\*\*|(@\w+(?:\s\w+)?)|(#[\w-]+)|(\$[\d,]+(?:\.\d{2})?)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<React.Fragment key={key++}>{text.slice(last, m.index)}</React.Fragment>)
    }
    const [, bold, mention, tag, amount] = m
    if (bold !== undefined) {
      nodes.push(
        <strong key={key++} style={{ fontWeight: 500, color: "var(--c-gray-900)" }}>
          {bold}
        </strong>
      )
    } else if (mention !== undefined) {
      nodes.push(
        <span key={key++} style={{ color: "var(--c-cleared-green)", fontWeight: 500 }}>
          {mention}
        </span>
      )
    } else if (tag !== undefined) {
      if (caseData) {
        nodes.push(
          <Link
            key={key++}
            href={`/cases/${caseData.id}`}
            className="font-mono hover:underline"
            style={{ color: "var(--c-cleared-green)", fontWeight: 500, fontSize: "0.92em" }}
          >
            {tag}
          </Link>
        )
      } else {
        nodes.push(
          <span
            key={key++}
            className="font-mono"
            style={{ color: "var(--c-cleared-green)", fontWeight: 500, fontSize: "0.92em" }}
          >
            {tag}
          </span>
        )
      }
    } else if (amount !== undefined) {
      nodes.push(
        <span key={key++} className="font-mono tabular-nums" style={{ color: "var(--c-gray-800)" }}>
          {amount}
        </span>
      )
    }
    last = m.index + m[0].length
  }

  if (last < text.length) {
    nodes.push(<React.Fragment key={key++}>{text.slice(last)}</React.Fragment>)
  }

  return nodes.length > 0 ? nodes : [text]
}

/** Derive a category tag from the post's source/metadata. */
function deriveTag(post: any): { label: string; cls: string } | null {
  if (post.authorType === "junebug") return { label: "Junebug", cls: "dash-tag-junebug" }
  if (post.postType === "pippen_digest" || post.sourceType === "pippen") {
    return { label: "Pippen", cls: "dash-tag-pippen" }
  }
  if (post.sourceType === "research") return { label: "Research", cls: "dash-tag-research" }
  if (post.case?.id) return { label: "Team", cls: "dash-tag-team" }
  return null
}

// ── Post row (no card wrapper) ──────────────────────────────────

interface PostRowProps {
  post: any
  faded: boolean
}

function PostRow({ post, faded }: PostRowProps) {
  const [acknowledged, setAcknowledged] = useState(!!post.liked)
  const [ackCount, setAckCount] = useState<number>(post.likeCount || 0)

  const author = post.author || { name: "Unknown" }
  const palette = paletteForName(author.name)
  const tag = deriveTag(post)
  const content = (post.content as string | null) || ""

  const handleAck = useCallback(async () => {
    const next = !acknowledged
    setAcknowledged(next)
    setAckCount((c: number) => c + (next ? 1 : -1))
    try {
      await fetch(`/api/feed/${post.id}/like`, { method: "POST" })
    } catch {
      setAcknowledged(!next)
      setAckCount((c: number) => c + (next ? -1 : 1))
    }
  }, [acknowledged, post.id])

  return (
    <article className={faded ? "dash-post-fade" : ""} style={{ marginBottom: 48 }}>
      <div className="flex items-start gap-3.5">
        {/* Avatar */}
        <div
          className="flex items-center justify-center shrink-0 mt-0.5"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: palette.bg,
            color: palette.fg,
            fontFamily: "var(--font-dm)",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.03em",
          }}
          aria-hidden="true"
        >
          {getInitials(author.name)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="dash-name">{author.name || "Unknown"}</span>
            <span
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 300,
                color: "var(--c-gray-300)",
              }}
            >
              {timeAgo(post.createdAt)}
            </span>
            {tag && <span className={`dash-tag ${tag.cls}`}>{tag.label}</span>}
            {post.case && (
              <Link
                href={`/cases/${post.case.id}`}
                className="font-mono hover:underline"
                style={{
                  fontSize: 11,
                  color: "var(--c-gray-400)",
                  fontWeight: 500,
                }}
              >
                {post.case.tabsNumber}
              </Link>
            )}
          </div>

          {/* Body */}
          {content && (
            <div className="dash-body mt-2 whitespace-pre-wrap">
              {parseInline(content, post.case)}
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-5 mt-5">
            <button
              type="button"
              className="flex items-center gap-1.5 transition-colors"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--c-gray-400)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-gray-700)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-gray-400)")}
            >
              <MessageCircle className="h-[13px] w-[13px]" strokeWidth={1.5} />
              Reply
              {post.replyCount > 0 && (
                <span style={{ color: "var(--c-gray-300)" }}>· {post.replyCount}</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleAck}
              className="flex items-center gap-1.5 transition-colors"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: acknowledged ? "var(--c-cleared-green)" : "var(--c-gray-400)",
              }}
              onMouseEnter={(e) => {
                if (!acknowledged) e.currentTarget.style.color = "var(--c-gray-700)"
              }}
              onMouseLeave={(e) => {
                if (!acknowledged) e.currentTarget.style.color = "var(--c-gray-400)"
              }}
            >
              <Eye className="h-[13px] w-[13px]" strokeWidth={1.5} />
              Noted
              {ackCount > 0 && (
                <span style={{ color: "var(--c-gray-300)" }}>· {ackCount}</span>
              )}
            </button>

            <button
              type="button"
              className="flex items-center gap-1.5 transition-colors"
              style={{
                fontFamily: "var(--font-dm)",
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--c-gray-400)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-gray-700)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-gray-400)")}
              aria-label="More actions"
            >
              <MoreHorizontal className="h-[13px] w-[13px]" strokeWidth={1.5} />
              More
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

// ── Main component ─────────────────────────────────────────────

export function DashboardFeed({ posts, currentUser: _currentUser, onRefresh: _onRefresh }: DashboardFeedProps) {
  // Filter out system events, tasks, and file shares — they don't belong
  // on the editorial home. Tasks live in the task pages; system events
  // live in the notification center.
  const filtered = posts.filter((p: any) => {
    if (!p) return false
    if (p.postType === "system_event") return false
    if (p.postType === "task" || p.postType === "task_created" || p.postType === "task_completed") return false
    if (p.archived) return false
    return true
  })

  // Separate Pippen's most recent digest so it sits in the featured zone above
  const pippenIndex = filtered.findIndex((p: any) => {
    return p.postType === "pippen_digest" ||
      (typeof p.content === "string" && p.content.includes("Pippen's Daily Takeaway"))
  })
  const pippenPost = pippenIndex >= 0 ? filtered[pippenIndex] : null
  const teamPosts = pippenIndex >= 0
    ? [...filtered.slice(0, pippenIndex), ...filtered.slice(pippenIndex + 1)]
    : filtered

  return (
    <div>
      {/* Featured zone: Pippen's daily brief */}
      {pippenPost && <PippenTakeawayCard post={pippenPost} />}

      {/* Divider between featured zone and team feed — only if both exist */}
      {pippenPost && teamPosts.length > 0 && <hr className="dash-divider" />}

      {/* Team feed */}
      {teamPosts.length > 0 ? (
        <div>
          {teamPosts.map((post, i) => (
            <PostRow key={post.id} post={post} faded={i >= 3} />
          ))}
        </div>
      ) : !pippenPost ? (
        <div className="text-center py-16">
          <p
            style={{
              fontFamily: "var(--font-editorial)",
              fontSize: 20,
              fontWeight: 300,
              fontStyle: "italic",
              color: "var(--c-gray-300)",
              lineHeight: 1.5,
            }}
          >
            Nothing to see yet.
          </p>
          <p
            className="mt-2"
            style={{
              fontFamily: "var(--font-dm)",
              fontSize: 13,
              fontWeight: 300,
              color: "var(--c-gray-400)",
            }}
          >
            Share the first update.
          </p>
        </div>
      ) : null}
    </div>
  )
}
