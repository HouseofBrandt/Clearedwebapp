"use client"

import React from "react"

/**
 * Lightweight formatted text renderer for Junebug replies.
 * Handles: **bold**, bullet lists (- ), and paragraph breaks.
 * No full markdown parser needed — keeps bundle small.
 */

function parseLine(text: string): React.ReactNode[] {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2)
      return (
        <strong key={i} className="font-medium text-foreground">
          {inner}
        </strong>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

interface FormattedTextProps {
  content: string
  className?: string
}

export function FormattedText({ content, className = "" }: FormattedTextProps) {
  // Split into paragraphs by double newlines
  const blocks = content.split(/\n{2,}/)

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // Check if this block is a bullet list
        const lines = trimmed.split("\n")
        const isBulletList = lines.every(
          (l) => l.trim().startsWith("- ") || l.trim().startsWith("• ") || l.trim() === ""
        )

        if (isBulletList) {
          const items = lines
            .map((l) => l.trim())
            .filter((l) => l.startsWith("- ") || l.startsWith("• "))
            .map((l) => l.replace(/^[-•]\s*/, ""))

          return (
            <ul key={bi} className="space-y-0.5 ml-1">
              {items.map((item, ii) => (
                <li key={ii} className="flex gap-2 text-sm leading-relaxed">
                  <span className="text-muted-foreground mt-1 shrink-0 text-[8px]">●</span>
                  <span>{parseLine(item)}</span>
                </li>
              ))}
            </ul>
          )
        }

        // Check if block has mixed content (some bullets, some prose)
        const hasBullets = lines.some(
          (l) => l.trim().startsWith("- ") || l.trim().startsWith("• ")
        )

        if (hasBullets) {
          // Render line by line, bullets as list items, prose as paragraphs
          return (
            <div key={bi} className="space-y-1">
              {lines.map((line, li) => {
                const t = line.trim()
                if (!t) return null
                if (t.startsWith("- ") || t.startsWith("• ")) {
                  const text = t.replace(/^[-•]\s*/, "")
                  return (
                    <div key={li} className="flex gap-2 text-sm leading-relaxed ml-1">
                      <span className="text-muted-foreground mt-1 shrink-0 text-[8px]">●</span>
                      <span>{parseLine(text)}</span>
                    </div>
                  )
                }
                return (
                  <p key={li} className="text-sm leading-relaxed">
                    {parseLine(t)}
                  </p>
                )
              })}
            </div>
          )
        }

        // Plain prose paragraph
        return (
          <p key={bi} className="text-sm leading-relaxed">
            {parseLine(trimmed.replace(/\n/g, " "))}
          </p>
        )
      })}
    </div>
  )
}
