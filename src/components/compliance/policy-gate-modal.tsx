"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Shield, ChevronRight, CheckCircle2, FileText } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface UnacknowledgedPolicy {
  id: string
  slug: string
  title: string
  content: string
  version: number
  effectiveDate: string
}

interface PolicyGateModalProps {
  /** If provided, skip the fetch and use these policies directly */
  policies?: UnacknowledgedPolicy[]
  /** Called when all policies have been acknowledged */
  onAllAcknowledged?: () => void
}

// ── Component ──────────────────────────────────────────────────────

export function PolicyGateModal({
  policies: propPolicies,
  onAllAcknowledged,
}: PolicyGateModalProps) {
  const [policies, setPolicies] = useState<UnacknowledgedPolicy[]>(
    propPolicies ?? []
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(!propPolicies)
  const [isAcknowledging, setIsAcknowledging] = useState(false)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch unacknowledged policies on mount (if not provided via props)
  useEffect(() => {
    if (propPolicies) return

    async function fetchPolicies() {
      try {
        const res = await fetch("/api/policies/acknowledge")
        if (!res.ok) throw new Error("Failed to fetch policies")
        const data = await res.json()
        setPolicies(data.unacknowledgedPolicies ?? [])
      } catch (e: any) {
        console.error("[PolicyGateModal] fetch error:", e.message)
        setError("Failed to load compliance policies. Please refresh the page.")
      } finally {
        setIsLoading(false)
      }
    }

    fetchPolicies()
  }, [propPolicies])

  // Reset scroll tracking when policy changes
  useEffect(() => {
    setHasScrolledToBottom(false)
  }, [currentIndex])

  // Handle scroll to detect if user has read to the bottom
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (hasScrolledToBottom) return
      const el = e.currentTarget
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      if (atBottom) {
        setHasScrolledToBottom(true)
      }
    },
    [hasScrolledToBottom]
  )

  // Check if content is short enough that scrolling is not needed
  const handleContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      // If content fits without scrolling, mark as scrolled
      if (node.scrollHeight <= node.clientHeight + 40) {
        setHasScrolledToBottom(true)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentIndex]
  )

  // Acknowledge the current policy
  const handleAcknowledge = async () => {
    const policy = policies[currentIndex]
    if (!policy) return

    setIsAcknowledging(true)
    setError(null)

    try {
      const res = await fetch("/api/policies/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyId: policy.id,
          version: policy.version,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to acknowledge policy")
      }

      // Move to next policy or finish
      if (currentIndex < policies.length - 1) {
        setCurrentIndex(currentIndex + 1)
      } else {
        // All policies acknowledged
        setPolicies([])
        onAllAcknowledged?.()
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsAcknowledging(false)
    }
  }

  // Don't render if loading, errored on fetch, or no policies
  if (isLoading) return null
  if (policies.length === 0) return null

  const currentPolicy = policies[currentIndex]
  if (!currentPolicy) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-700 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">
              Policy Acknowledgment Required
            </h2>
            <p className="text-sm text-zinc-400">
              {currentIndex + 1} of {policies.length} policies &mdash; You must
              review and acknowledge all policies to continue.
            </p>
          </div>
        </div>

        {/* Policy Title */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-3">
          <FileText className="h-4 w-4 text-zinc-400" />
          <span className="font-medium text-white">{currentPolicy.title}</span>
          <span className="ml-auto text-xs text-zinc-500">
            v{currentPolicy.version}
          </span>
        </div>

        {/* Policy Content */}
        <div
          ref={handleContentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{ maxHeight: "60vh" }}
        >
          <div className="prose prose-invert prose-sm max-w-none">
            {/* Render markdown content as plain text with basic formatting */}
            {currentPolicy.content.split("\n").map((line, i) => {
              // Headings
              if (line.startsWith("### ")) {
                return (
                  <h3
                    key={i}
                    className="mb-2 mt-4 text-base font-semibold text-white"
                  >
                    {line.replace("### ", "")}
                  </h3>
                )
              }
              if (line.startsWith("## ")) {
                return (
                  <h2
                    key={i}
                    className="mb-2 mt-6 text-lg font-bold text-white"
                  >
                    {line.replace("## ", "")}
                  </h2>
                )
              }
              if (line.startsWith("# ")) {
                return (
                  <h1
                    key={i}
                    className="mb-3 mt-6 text-xl font-bold text-white"
                  >
                    {line.replace("# ", "")}
                  </h1>
                )
              }
              // Bullet points
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return (
                  <li key={i} className="ml-4 text-zinc-300">
                    {line.replace(/^[-*] /, "")}
                  </li>
                )
              }
              // Numbered list
              if (/^\d+\. /.test(line)) {
                return (
                  <li key={i} className="ml-4 list-decimal text-zinc-300">
                    {line.replace(/^\d+\. /, "")}
                  </li>
                )
              }
              // Empty lines
              if (line.trim() === "") {
                return <br key={i} />
              }
              // Regular paragraph
              return (
                <p key={i} className="mb-1 text-zinc-300">
                  {line}
                </p>
              )
            })}
          </div>
        </div>

        {/* Scroll indicator */}
        {!hasScrolledToBottom && (
          <div className="border-t border-zinc-800 px-6 py-2 text-center">
            <p className="text-xs text-amber-400">
              Please scroll to the bottom to read the full policy before
              acknowledging.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border-t border-red-900/30 bg-red-950/30 px-6 py-2">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-700 px-6 py-4">
          <div className="flex gap-1.5">
            {policies.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 w-2 rounded-full ${
                  idx < currentIndex
                    ? "bg-emerald-500"
                    : idx === currentIndex
                      ? "bg-amber-400"
                      : "bg-zinc-600"
                }`}
              />
            ))}
          </div>

          <Button
            onClick={handleAcknowledge}
            disabled={!hasScrolledToBottom || isAcknowledging}
            className="gap-2 bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {isAcknowledging ? (
              "Acknowledging..."
            ) : currentIndex < policies.length - 1 ? (
              <>
                I Acknowledge
                <ChevronRight className="h-4 w-4" />
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />I Acknowledge &amp;
                Continue
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
