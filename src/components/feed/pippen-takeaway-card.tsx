"use client"

import React from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

/**
 * PippenTakeawayCard — editorial pull-quote edition
 * ---------------------------------------------------
 * This is Pippen's morning briefing to the practice. It is deliberately NOT
 * a regular feed post:
 *   - 0.5px green border with a 3px gradient accent bar across the top (the
 *     only gradient surface anywhere in the dashboard — it signals that this
 *     card is special).
 *   - Body is set in Cormorant Garamond 19px italic — styled like a magazine
 *     pull-quote. Bold key phrases come out of italics and become roman 500.
 *   - One action: "Open full report →". No reply / like / bookmark chrome.
 *
 * Input: a FeedPost with a small markdown blob in `content`:
 *
 *   🐕 **Pippen's Daily Takeaway** — 2026-04-10
 *
 *   Today's Federal Register batch contains no Tier 1 or Tier 2 tax
 *   resolution material — all six items are general regulatory matters.
 *
 *   📋 [Full daily learnings report →](/pippen)
 *
 * We strip the header / footer lines, parse the interior for bold and
 * italic markers, and render it as an editorial quote. Structured content
 * (# headings, - bullets) is rare for a one-sentence takeaway, but if it
 * shows up we still render it cleanly below the quote.
 */

interface PippenTakeawayCardProps {
  post: {
    id: string
    content?: string | null
    createdAt: string | Date
  }
}

// ── Content parsing ─────────────────────────────────────────────

/** Strip the Pippen header and footer lines and return the quote body. */
function parseBody(content: string): { body: string; date?: string } {
  const lines = content.split("\n")
  const kept: string[] = []
  let date: string | undefined

  for (const raw of lines) {
    const line = raw.trim()

    // Header line
    if (line.includes("Pippen's Daily Takeaway")) {
      const m = line.match(/—\s*(\d{4}-\d{2}-\d{2})/)
      if (m) date = m[1]
      continue
    }

    // Footer "Full daily learnings report →" link
    if (line.includes("Full daily learnings report")) continue

    kept.push(raw)
  }

  return { body: kept.join("\n").replace(/^\s+|\s+$/g, ""), date }
}

/** Format "2026-04-10" → "April 10, 2026" in DM Sans uppercase. */
function formatDate(iso?: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

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

// ── Editorial inline parser ────────────────────────────────────

/**
 * Parse **bold** / *italic* / [text](url) into React nodes.
 * Bold segments come out of italics and become roman weight 500 — that's the
 * editorial pull-quote convention: italic body, roman key phrases.
 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <React.Fragment key={key++}>{text.slice(last, m.index)}</React.Fragment>
      )
    }
    const [, linkText, linkHref, bold, italic, code] = m
    if (linkText !== undefined && linkHref !== undefined) {
      const isInternal = linkHref.startsWith("/")
      const linkClass = "hover:underline"
      const linkStyle: React.CSSProperties = {
        color: "var(--c-cleared-green)",
        fontStyle: "normal",
        fontWeight: 500,
      }
      nodes.push(
        isInternal ? (
          <Link key={key++} href={linkHref} className={linkClass} style={linkStyle}>
            {linkText}
          </Link>
        ) : (
          <a
            key={key++}
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
            style={linkStyle}
          >
            {linkText}
          </a>
        )
      )
    } else if (bold !== undefined) {
      // Bold key phrases come OUT of italics and become roman 500 — editorial convention
      nodes.push(
        <strong
          key={key++}
          style={{ fontStyle: "normal", fontWeight: 500, color: "var(--c-gray-900)" }}
        >
          {bold}
        </strong>
      )
    } else if (italic !== undefined) {
      // Already italic in the card — render as emphasis without extra style
      nodes.push(
        <em key={key++} style={{ fontStyle: "italic" }}>
          {italic}
        </em>
      )
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="font-mono text-[13px] px-1.5 py-0.5 rounded"
          style={{
            background: "var(--c-cleared-green-tint)",
            color: "var(--c-gray-800)",
            fontStyle: "normal",
          }}
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
 * Render the quote body. For a one-sentence takeaway (the normal case) this
 * is a single italic paragraph. For structured content (# headings, - bullets)
 * we gracefully render each block, still within the Cormorant italic voice.
 */
function EditorialBody({ content }: { content: string }) {
  if (!content) return null

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
        <ul key={`b${bi}`} className="space-y-2 mt-3">
          {lines.map((l, li) => {
            const text = l.replace(/^[-•*]\s+/, "")
            return (
              <li
                key={li}
                className="flex gap-3 dash-pippen-body"
                style={{ fontSize: "17px" }}
              >
                <span
                  className="mt-[12px] shrink-0"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--c-cleared-green)",
                  }}
                />
                <span className="min-w-0">{parseInline(text)}</span>
              </li>
            )
          })}
        </ul>
      )
      return
    }

    // Top-level heading inside the body (rare)
    if (lines.length === 1) {
      const h1 = lines[0].match(/^#{1,3}\s+(.+)$/)
      if (h1) {
        nodes.push(
          <h4
            key={`h${bi}`}
            className="dash-label mt-4 mb-2"
            style={{ color: "var(--c-cleared-green)" }}
          >
            {parseInline(h1[1])}
          </h4>
        )
        return
      }
    }

    // Default: paragraph rendered in the italic editorial voice.
    // Join internal line breaks into a single paragraph so the quote flows.
    const joined = lines.join(" ")
    nodes.push(
      <p key={`p${bi}`} className="dash-pippen-body">
        {parseInline(joined)}
      </p>
    )
  })

  return <div className="space-y-3">{nodes}</div>
}

// ── Component ──────────────────────────────────────────────────

export function PippenTakeawayCard({ post }: PippenTakeawayCardProps) {
  const content = post.content || ""
  const { body, date } = parseBody(content)
  const formattedDate = formatDate(date)

  return (
    <div className="dash-pippen-card mb-[48px]">
      {/* Label row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="dash-label">Pippen&rsquo;s daily brief</span>
          {formattedDate && (
            <>
              <span style={{ color: "var(--c-gray-200)", fontSize: 10 }}>·</span>
              <span
                style={{
                  fontFamily: "var(--font-dm)",
                  fontSize: 10,
                  fontWeight: 400,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "var(--c-gray-400)",
                }}
              >
                {formattedDate}
              </span>
            </>
          )}
        </div>
        <Link
          href="/pippen"
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          style={{
            fontFamily: "var(--font-dm)",
            fontSize: 10,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "var(--c-cleared-green)",
          }}
          aria-label="Open Pippen's full daily learnings report"
        >
          Open full report
          <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
        </Link>
      </div>

      {/* Editorial pull-quote body */}
      {body ? (
        <EditorialBody content={body} />
      ) : (
        <p className="dash-pippen-body" style={{ color: "var(--c-gray-400)" }}>
          No new material today.
        </p>
      )}

      {/* Footer — Pippen avatar + timestamp */}
      <div
        className="flex items-center gap-2.5 mt-6 pt-5"
        style={{ borderTop: "0.5px solid var(--border-tertiary)" }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--c-pastel-amber-bg)",
            color: "var(--c-pastel-amber-fg)",
            fontFamily: "var(--font-dm)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
          aria-hidden="true"
        >
          P
        </div>
        <span className="dash-name">Pippen</span>
        <span style={{ color: "var(--c-gray-200)", fontSize: 10 }}>·</span>
        <span className="dash-meta">{timeAgo(post.createdAt)}</span>
      </div>
    </div>
  )
}
