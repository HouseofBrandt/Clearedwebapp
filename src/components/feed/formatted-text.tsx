"use client"

import React from "react"
import { redactLeakedPII } from "@/lib/feed/redact-leaked-pii"

/**
 * Lightweight formatted text renderer for Junebug replies.
 * Handles: **bold**, bullet lists (- ), and paragraph breaks.
 * No full markdown parser needed — keeps bundle small.
 *
 * Every rendered text segment is run through redactLeakedPII as a
 * defense-in-depth guard: if an upstream write path accidentally wrote
 * an encrypted envelope (v1:iv:tag:ciphertext) or a tokenizer output
 * ([NAME-A1B2C3]) into content, we mask it here instead of leaking it.
 */

function parseLine(rawText: string): React.ReactNode[] {
  const text = redactLeakedPII(rawText)
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

/** Detect if a line is a numbered list item (e.g. "1. ", "2) ") */
function isNumberedItem(line: string): boolean {
  return /^\d+[.)]\s/.test(line.trim())
}

/** Strip the number prefix from a numbered list item */
function stripNumberPrefix(line: string): string {
  return line.trim().replace(/^\d+[.)]\s*/, "")
}

export function FormattedText({ content, className = "" }: FormattedTextProps) {
  // Split into paragraphs by double newlines
  const blocks = content.split(/\n{2,}/)

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        const lines = trimmed.split("\n")

        // Check if this block is a numbered list
        const isNumberedList = lines.every(
          (l) => isNumberedItem(l) || l.trim() === ""
        )

        if (isNumberedList) {
          const items = lines
            .map((l) => l.trim())
            .filter((l) => isNumberedItem(l))
            .map((l) => stripNumberPrefix(l))

          return (
            <ol key={bi} className="space-y-0.5 ml-1 list-decimal pl-5">
              {items.map((item, ii) => (
                <li key={ii} className="text-sm leading-relaxed">
                  <span>{parseLine(item)}</span>
                </li>
              ))}
            </ol>
          )
        }

        // Check if this block is a bullet list
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

        // Check if block has mixed content (some bullets/numbers, some prose)
        const hasBullets = lines.some(
          (l) => l.trim().startsWith("- ") || l.trim().startsWith("• ")
        )
        const hasNumbers = lines.some((l) => isNumberedItem(l))

        if (hasBullets || hasNumbers) {
          // Render line by line, bullets/numbers as list items, prose as paragraphs
          let numberCounter = 0
          return (
            <div key={bi} className="space-y-1">
              {lines.map((line, li) => {
                const t = line.trim()
                if (!t) return null
                if (t.startsWith("- ") || t.startsWith("• ")) {
                  numberCounter = 0
                  const text = t.replace(/^[-•]\s*/, "")
                  return (
                    <div key={li} className="flex gap-2 text-sm leading-relaxed ml-1">
                      <span className="text-muted-foreground mt-1 shrink-0 text-[8px]">●</span>
                      <span>{parseLine(text)}</span>
                    </div>
                  )
                }
                if (isNumberedItem(t)) {
                  numberCounter++
                  const text = stripNumberPrefix(t)
                  return (
                    <div key={li} className="flex gap-2 text-sm leading-relaxed ml-1">
                      <span className="text-muted-foreground mt-0.5 shrink-0 text-xs font-medium min-w-[1.25em] text-right">{numberCounter}.</span>
                      <span>{parseLine(text)}</span>
                    </div>
                  )
                }
                numberCounter = 0
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
