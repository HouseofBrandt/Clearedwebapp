"use client"

import { useState, useRef, useEffect } from "react"

interface TruncatedTextProps {
  children: React.ReactNode
  lines?: number
  className?: string
}

export function TruncatedText({ children, lines = 3, className = "" }: TruncatedTextProps) {
  const [expanded, setExpanded] = useState(false)
  const [needsTruncation, setNeedsTruncation] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const lineHeight = 1.65 // em

  useEffect(() => {
    if (contentRef.current) {
      const el = contentRef.current
      const maxHeight = parseFloat(getComputedStyle(el).fontSize) * lineHeight * lines
      setNeedsTruncation(el.scrollHeight > maxHeight + 2)
    }
  }, [children, lines])

  const maxHeight = expanded ? "none" : `${lineHeight * lines}em`

  return (
    <div className={className}>
      <div
        ref={contentRef}
        style={{
          maxHeight,
          overflow: expanded ? "visible" : "hidden",
          transition: "max-height 350ms cubic-bezier(0.4, 0, 0.2, 1)",
          position: "relative",
          lineHeight: lineHeight,
        }}
      >
        {children}
        {!expanded && needsTruncation && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "20px",
              background: "linear-gradient(transparent, var(--background, white))",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium hover:underline cursor-pointer mt-1"
          style={{ color: "var(--c-teal)" }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
