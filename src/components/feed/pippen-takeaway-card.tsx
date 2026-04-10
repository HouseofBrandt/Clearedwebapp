"use client"

import React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

/**
 * PippenTakeawayCard
 * -------------------
 * Compact, polished feed card for Pippen's daily learnings digest.
 *
 * Pippen is the firm's automated tax-authority watcher — each morning it
 * fetches the Federal Register, IRS news, and other regulatory sources, and
 * drops a one-sentence takeaway onto the firm newsfeed so practitioners can
 * scan what's new in under 5 seconds.
 *
 * The takeaway was previously rendered as a regular FeedPost, which meant:
 *   - Markdown wasn't parsed (bold/links/headers showed as literal `**`, `[`, `#`)
 *   - It had the full heavyweight post chrome (avatar, reply, like, bookmark, edit)
 *   - The `#` in "# Daily Digest" got parsed as a case tag because the generic
 *     content renderer treats any token starting with `#` as a hashtag
 *
 * This card solves all three: it's a dedicated, quiet, chrome-free surface
 * with a proper mini-markdown renderer scoped to exactly the primitives the
 * pipeline emits (bold, inline links, headings, and bullet lists).
 */

interface PippenTakeawayCardProps {
  post: {
    id: string
    content?: string | null
    createdAt: string | Date
  }
}

// ── Content parsing ─────────────────────────────────────────────

/** Strip the Pippen header and footer lines and return only the body. */
function parseBody(content: string): { body: string; date?: string } {
  const lines = content.split("\n")
  const kept: string[] = []
  let date: string | undefined

  for (const raw of lines) {
    const line = raw.trim()

    // Header line: "🐕 **Pippen's Daily Takeaway** — 2026-04-10"
    if (line.includes("Pippen's Daily Takeaway")) {
      const m = line.match(/—\s*(\d{4}-\d{2}-\d{2})/)
      if (m) date = m[1]
      continue
    }

    // Footer line: "📋 [Full daily learnings report →](/pippen)"
    if (line.includes("Full daily learnings report")) continue

    kept.push(raw)
  }

  // Collapse leading/trailing blank lines but preserve internal spacing.
  return { body: kept.join("\n").replace(/^\s+|\s+$/g, ""), date }
}

/** Human-readable relative date for the header chip. */
function formatDate(iso?: string): string {
  if (!iso) return ""
  // Parse as local date to avoid timezone shifting the displayed day.
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ── Minimal markdown renderer ───────────────────────────────────

/**
 * Parse a single line of inline markdown into React nodes.
 *
 * Handles:
 *   **bold**
 *   *italic*
 *   [text](url)
 *
 * Case names like `*Smith v. Commissioner*` get italicized. Links are rendered
 * as Next.js `<Link>` for internal routes (starting with `/`) and `<a>` for
 * external URLs.
 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Order matters: match bold before italic (both use `*`) and links first
  // so we don't partially consume them with the bold/italic patterns.
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<React.Fragment key={key++}>{text.slice(last, m.index)}</React.Fragment>)
    }
    const [, linkText, linkHref, bold, italic, code] = m
    if (linkText !== undefined && linkHref !== undefined) {
      const isInternal = linkHref.startsWith("/")
      if (isInternal) {
        nodes.push(
          <Link
            key={key++}
            href={linkHref}
            className="font-medium hover:underline"
            style={{ color: "var(--c-teal)" }}
          >
            {linkText}
          </Link>
        )
      } else {
        nodes.push(
          <a
            key={key++}
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
            style={{ color: "var(--c-teal)" }}
          >
            {linkText}
          </a>
        )
      }
    } else if (bold !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold" style={{ color: "var(--c-gray-800)" }}>
          {bold}
        </strong>
      )
    } else if (italic !== undefined) {
      nodes.push(
        <em key={key++} className="italic">
          {italic}
        </em>
      )
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="font-mono text-[12px] px-1 py-0.5 rounded"
          style={{ background: "var(--c-gray-50)", color: "var(--c-gray-700)" }}
        >
          {code}
        </code>
      )
    }
    last = m.index + m[0].length
  }

  if (last < text.length) {
    nodes.push(<React.Fragment key={key++}>{text.slice(last)}</React.Fragment>)
  }

  return nodes.length > 0 ? nodes : [text]
}

/**
 * Render the takeaway body into blocks: headings, bullet lists, and prose.
 *
 * Not a full markdown parser — just the subset the pipeline emits:
 *   `# H1`, `## H2`, `### H3`
 *   `- item`
 *   blank line → paragraph break
 */
function PippenMarkdown({ content }: { content: string }) {
  if (!content) return null

  // Split into paragraph blocks on blank lines.
  const blocks = content.split(/\n{2,}/)
  const nodes: React.ReactNode[] = []

  blocks.forEach((raw, bi) => {
    const block = raw.trim()
    if (!block) return

    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean)

    // Bullet list
    const isBullets = lines.every((l) => /^[-•*]\s+/.test(l))
    if (isBullets && lines.length > 0) {
      nodes.push(
        <ul key={`b${bi}`} className="space-y-1 ml-0.5">
          {lines.map((l, li) => {
            const text = l.replace(/^[-•*]\s+/, "")
            return (
              <li key={li} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: "var(--c-gray-700)" }}>
                <span className="text-[8px] mt-[7px] shrink-0" style={{ color: "var(--c-teal)" }}>
                  ●
                </span>
                <span className="min-w-0">{parseInline(text)}</span>
              </li>
            )
          })}
        </ul>
      )
      return
    }

    // Single-line headings
    if (lines.length === 1) {
      const line = lines[0]
      const h1 = line.match(/^#\s+(.+)$/)
      const h2 = line.match(/^##\s+(.+)$/)
      const h3 = line.match(/^###\s+(.+)$/)
      if (h1) {
        nodes.push(
          <h3
            key={`h${bi}`}
            className="text-[14px] font-semibold leading-snug"
            style={{ color: "var(--c-gray-800)" }}
          >
            {parseInline(h1[1])}
          </h3>
        )
        return
      }
      if (h2) {
        nodes.push(
          <h4
            key={`h${bi}`}
            className="text-[13px] font-semibold uppercase tracking-wider leading-snug mt-1"
            style={{ color: "var(--c-gray-500)", letterSpacing: "0.04em" }}
          >
            {parseInline(h2[1])}
          </h4>
        )
        return
      }
      if (h3) {
        nodes.push(
          <h5
            key={`h${bi}`}
            className="text-[12px] font-semibold leading-snug"
            style={{ color: "var(--c-gray-500)" }}
          >
            {parseInline(h3[1])}
          </h5>
        )
        return
      }
    }

    // Mixed content: render line by line as a paragraph cluster.
    nodes.push(
      <div key={`p${bi}`} className="space-y-1">
        {lines.map((line, li) => {
          // Inline heading within a block (rare but harmless)
          const h1 = line.match(/^#\s+(.+)$/)
          if (h1) {
            return (
              <div key={li} className="text-[14px] font-semibold" style={{ color: "var(--c-gray-800)" }}>
                {parseInline(h1[1])}
              </div>
            )
          }
          const h2 = line.match(/^##\s+(.+)$/)
          if (h2) {
            return (
              <div
                key={li}
                className="text-[12px] font-semibold uppercase tracking-wider mt-1"
                style={{ color: "var(--c-gray-500)", letterSpacing: "0.04em" }}
              >
                {parseInline(h2[1])}
              </div>
            )
          }
          // Bullet inside a mixed block
          if (/^[-•*]\s+/.test(line)) {
            const text = line.replace(/^[-•*]\s+/, "")
            return (
              <div
                key={li}
                className="flex gap-2 text-[13px] leading-relaxed"
                style={{ color: "var(--c-gray-700)" }}
              >
                <span className="text-[8px] mt-[7px] shrink-0" style={{ color: "var(--c-teal)" }}>
                  ●
                </span>
                <span className="min-w-0">{parseInline(text)}</span>
              </div>
            )
          }
          // Plain prose line
          return (
            <p
              key={li}
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--c-gray-700)" }}
            >
              {parseInline(line)}
            </p>
          )
        })}
      </div>
    )
  })

  return <div className="space-y-2.5">{nodes}</div>
}

// ── Time helper ────────────────────────────────────────────────

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Component ──────────────────────────────────────────────────

export function PippenTakeawayCard({ post }: PippenTakeawayCardProps) {
  const content = post.content || ""
  const { body, date } = parseBody(content)
  const formattedDate = formatDate(date)

  return (
    <div
      className="rounded-xl overflow-hidden mb-3 pippen-card"
      style={{
        background: "var(--c-white)",
        border: "1px solid var(--c-gray-100)",
        boxShadow: "var(--shadow-xs)",
        borderLeft: "3px solid var(--c-teal)",
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "rgba(46, 134, 171, 0.04)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[15px] leading-none shrink-0" aria-hidden="true">
            {"\uD83D\uDC3E"}
          </span>
          <span
            className="text-[12px] font-semibold uppercase tracking-wider shrink-0"
            style={{ color: "var(--c-teal)", letterSpacing: "0.06em" }}
          >
            Pippen&rsquo;s daily brief
          </span>
          {formattedDate && (
            <>
              <span className="text-[11px] shrink-0" style={{ color: "var(--c-gray-200)" }}>
                &middot;
              </span>
              <span className="text-[11px] shrink-0" style={{ color: "var(--c-gray-400)" }}>
                {formattedDate}
              </span>
            </>
          )}
          <span className="text-[11px] shrink-0" style={{ color: "var(--c-gray-200)" }}>
            &middot;
          </span>
          <span className="text-[11px] shrink-0" style={{ color: "var(--c-gray-300)" }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>
        <Link
          href="/pippen"
          className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-80 shrink-0"
          style={{ color: "var(--c-teal)" }}
          aria-label="Open full Pippen daily learnings report"
        >
          Open full report
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Body */}
      {body && (
        <div className="px-4 py-3.5">
          <PippenMarkdown content={body} />
        </div>
      )}
    </div>
  )
}
