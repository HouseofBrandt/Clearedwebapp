"use client"

/**
 * ThreadContextChip (spec §7.6).
 *
 * Accountability + control surface — shows what Junebug had access to
 * for the most recent turn AND lets the practitioner attach, change, or
 * clear a case scope on this thread.
 *
 * Reads from the latest USER message's `contextSnapshot` field for the
 * "last turn" data (KB hits, caseType, contextAvailable, etc.).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ScanSearch, Search, X } from "lucide-react"
import type { JunebugMessage, JunebugThreadDetail } from "./types"

export interface ThreadContextChipProps {
  thread: JunebugThreadDetail | null
  messages: JunebugMessage[]
  /** Called when the user picks / clears a case. Parent persists via
   *  PATCH /api/junebug/threads/[id] and updates local state. Pass null
   *  to clear the current case scope. */
  onCaseChange?: (caseId: string | null) => Promise<void> | void
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

interface CaseResult {
  id: string
  tabsNumber: string
  clientName: string
}

export function ThreadContextChip({ thread, messages, onCaseChange }: ThreadContextChipProps) {
  const [expanded, setExpanded] = useState(false)

  const latest = useMemo<ContextSnapshot | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === "USER" && m.contextSnapshot) return m.contextSnapshot as ContextSnapshot
    }
    return null
  }, [messages])

  if (!thread) return null

  const isCaseScoped = !!thread.caseId
  const hasSentTurn = latest !== null
  const hasLiveData = latest?.contextAvailable === true

  const status: "ok" | "warn" | "info" = isCaseScoped
    ? hasSentTurn
      ? hasLiveData
        ? "ok"
        : "warn"
      : "info"
    : "info"

  let label: string
  if (!isCaseScoped) {
    label = "General — click to attach a case"
  } else if (!hasSentTurn) {
    label = `${thread.caseNumber ?? "Case loaded"} — ready to start`
  } else if (hasLiveData) {
    label = `${thread.caseNumber ?? "case scoped"}${latest?.caseType ? ` · ${latest.caseType}` : ""}${
      typeof latest?.kbHits === "number" ? ` · ${latest.kbHits} KB hits` : ""
    }`
  } else {
    label = `${thread.caseNumber ?? "case scoped"} — case data unavailable`
  }
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
                ? !hasSentTurn
                  ? "Will be loaded on first turn"
                  : hasLiveData
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

          {/* Case picker — attach / change / clear. Only shown when the
              parent supplied an onCaseChange handler (thread is mutable). */}
          {onCaseChange && (
            <CasePicker
              currentCaseId={thread.caseId ?? null}
              currentLabel={
                isCaseScoped
                  ? `${thread.caseNumber ?? ""}${thread.clientName ? ` · ${thread.clientName}` : ""}`
                  : null
              }
              onChange={onCaseChange}
            />
          )}

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

// ── Case picker ─────────────────────────────────────────────────────

function CasePicker({
  currentCaseId,
  currentLabel,
  onChange,
}: {
  currentCaseId: string | null
  currentLabel: string | null
  onChange: (caseId: string | null) => Promise<void> | void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CaseResult[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Debounced search — fires on query change after 150ms of idle.
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    if (query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/cases?search=${encodeURIComponent(query.trim())}&limit=8`,
          { credentials: "same-origin", signal: ctrl.signal }
        )
        if (!res.ok) throw new Error(`Search failed: ${res.status}`)
        const data = await res.json()
        // /api/cases returns { cases: [...] } (decrypted via case-access filter)
        const rows: CaseResult[] = (data.cases || []).map((c: any) => ({
          id: c.id,
          tabsNumber: c.tabsNumber ?? "",
          clientName: c.clientName ?? "",
        }))
        setResults(rows)
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Search failed")
          setResults([])
        }
      } finally {
        setLoading(false)
      }
    }, 150)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  const pick = useCallback(
    async (caseId: string | null) => {
      setSubmitting(true)
      setError(null)
      try {
        await onChange(caseId)
        setQuery("")
        setResults([])
      } catch (err: any) {
        setError(err?.message || "Failed to update case")
      } finally {
        setSubmitting(false)
      }
    },
    [onChange]
  )

  return (
    <div className="mt-4 border-t border-c-gray-100 pt-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          {currentCaseId ? "Change case" : "Attach a case"}
        </span>
        {currentCaseId && (
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={submitting}
            className="inline-flex items-center gap-1 text-[11px] text-c-gray-500 hover:text-c-danger disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Clear ({currentLabel || "current"})
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-c-gray-300" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by client name or TABS number…"
          className="w-full rounded-md border border-c-gray-200 bg-white py-1.5 pl-8 pr-3 text-[12px] text-c-gray-900 placeholder:text-c-gray-300 focus:border-c-teal focus:outline-none focus:ring-2 focus:ring-c-teal/15"
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="mt-1.5 text-[11px] text-c-danger">{error}</p>
      )}

      {loading && (
        <p className="mt-1.5 text-[11px] text-c-gray-500">Searching…</p>
      )}

      {results.length > 0 && (
        <ul className="mt-1.5 divide-y divide-c-gray-100 rounded-md border border-c-gray-100 bg-white shadow-sm">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pick(r.id)}
                disabled={submitting || r.id === currentCaseId}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-c-gray-50 disabled:opacity-50"
              >
                <span className="truncate text-c-gray-900">
                  {r.clientName || "(unnamed)"}
                </span>
                <span
                  className="shrink-0 text-[11px] text-c-gray-500"
                  style={{ fontFamily: "var(--font-mono, monospace)" }}
                >
                  {r.tabsNumber}
                  {r.id === currentCaseId ? " · current" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !loading && results.length === 0 && !error && (
        <p className="mt-1.5 text-[11px] text-c-gray-500">
          No matches. Type at least 2 characters.
        </p>
      )}
    </div>
  )
}
