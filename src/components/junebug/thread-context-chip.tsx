"use client"

/**
 * ThreadContextChip (spec §7.6).
 *
 * Accountability surface — shows what Junebug had access to for the most
 * recent turn in this thread. Reads from the latest USER message's
 * `contextSnapshot` field.
 *
 * v1 shows case chip + doc count + KB hit count + route. PR 4 will
 * augment with live fetch (Title generation + polish layer), but the
 * fundamental "did the model see case data?" answer must ship in v1.
 */

import { useMemo, useState } from "react"
import { ChevronDown, ScanSearch } from "lucide-react"
import type { JunebugMessage, JunebugThreadDetail } from "./types"

export interface ThreadContextChipProps {
  thread: JunebugThreadDetail | null
  messages: JunebugMessage[]
}

interface ContextSnapshot {
  caseId?: string | null
  caseNumber?: string | null
  caseType?: string | null
  contextAvailable?: boolean
  contextFailureReason?: string | null
  kbHits?: number
  currentRoute?: string | null
  sentAt?: string
}

export function ThreadContextChip({ thread, messages }: ThreadContextChipProps) {
  const [expanded, setExpanded] = useState(false)

  const latest = useMemo<ContextSnapshot | null>(() => {
    // Find the most-recent USER message with a contextSnapshot
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === "USER" && m.contextSnapshot) return m.contextSnapshot as ContextSnapshot
    }
    return null
  }, [messages])

  if (!thread) return null

  const isCaseScoped = !!thread.caseId
  const hasLiveData = latest?.contextAvailable === true
  const label = isCaseScoped
    ? hasLiveData
      ? `${thread.caseNumber ?? "case scoped"}${latest?.caseType ? ` · ${latest.caseType}` : ""}${
          typeof latest?.kbHits === "number" ? ` · ${latest.kbHits} KB hits` : ""
        }`
      : `${thread.caseNumber ?? "case scoped"} — case data unavailable`
    : "General — no case context"

  const status: "ok" | "warn" | "info" = isCaseScoped
    ? hasLiveData
      ? "ok"
      : "warn"
    : "info"
  const color =
    status === "ok"
      ? "var(--c-teal)"
      : status === "warn"
      ? "var(--c-warning)"
      : "var(--c-gray-500)"

  return (
    <div className="border-b border-c-gray-100 bg-white">
      <div className="flex items-center gap-2 px-8 py-2.5 md:px-10">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-c-gray-100 bg-white px-3 py-1 text-[12px] text-c-gray-700 transition-colors hover:bg-c-gray-50"
          aria-expanded={expanded}
        >
          <ScanSearch className="h-3.5 w-3.5" style={{ color }} />
          <span className="truncate max-w-[420px]">{label}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-c-gray-300 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {thread.clientName && isCaseScoped && (
          <span
            className="hidden md:inline text-[11px] uppercase tracking-[0.04em] text-c-gray-500"
            style={{ fontFamily: "var(--font-mono, monospace)" }}
          >
            {thread.clientName}
          </span>
        )}
      </div>
      {expanded && (
        <div className="border-t border-c-gray-100 bg-c-gray-50/60 px-8 py-3 md:px-10">
          <dl className="grid grid-cols-1 gap-2 text-[12px] text-c-gray-700 md:grid-cols-2">
            <Row label="Scope">
              {isCaseScoped
                ? `Case ${thread.caseNumber ?? "(unknown)"}`
                : "General (no case)"}
            </Row>
            <Row label="Client">{thread.clientName || "—"}</Row>
            <Row label="Case type">{latest?.caseType ?? "—"}</Row>
            <Row label="Context available">
              {isCaseScoped
                ? hasLiveData
                  ? "Yes — live case data loaded"
                  : "No — guardrail active"
                : "Not applicable (general thread)"}
            </Row>
            <Row label="KB hits (last turn)">
              {typeof latest?.kbHits === "number" ? String(latest.kbHits) : "—"}
            </Row>
            <Row label="Current route">{latest?.currentRoute ?? "—"}</Row>
            {latest?.contextFailureReason && (
              <Row label="Reason">
                <span className="text-c-warning">{latest.contextFailureReason}</span>
              </Row>
            )}
          </dl>
          <p className="mt-3 text-[11px] text-c-gray-500">
            Junebug&apos;s answers are informational. Review all output before relying on it.
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt
        className="w-36 flex-shrink-0 text-[11px] uppercase tracking-[0.04em] text-c-gray-500"
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        {label}
      </dt>
      <dd className="flex-1 text-c-gray-700">{children}</dd>
    </div>
  )
}
