"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, X, FileText, FolderOpen, Users, Calendar } from "lucide-react"

interface DashboardHeaderProps {
  userName: string
  actionItemCount: number
}

interface SearchResult {
  id: string
  type: "case" | "document" | "deadline" | "user"
  title: string
  subtitle: string
  href: string
}

const typeIcons = {
  case: FolderOpen,
  document: FileText,
  deadline: Calendar,
  user: Users,
}

export function DashboardHeader({ userName, actionItemCount }: DashboardHeaderProps) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = userName.split(" ")[0]

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const subtitle = actionItemCount > 0
    ? `${dateStr} \u2014 ${actionItemCount} item${actionItemCount !== 1 ? "s" : ""} need attention`
    : `${dateStr} \u2014 you're all caught up`

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Keyboard shortcut: "/" to open search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !searchOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false)
        setQuery("")
        setResults([])
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [searchOpen])

  // Focus input when opened
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [searchOpen])

  // Close on outside click
  useEffect(() => {
    if (!searchOpen) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
        setQuery("")
        setResults([])
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [searchOpen])

  // Search API call with debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        // Search cases
        const res = await fetch(`/api/cases?search=${encodeURIComponent(query)}&limit=5`)
        if (res.ok) {
          const data = await res.json()
          const caseResults: SearchResult[] = (data.cases || []).map((c: any) => ({
            id: c.id,
            type: "case" as const,
            title: c.clientName || c.tabsNumber || "Unknown",
            subtitle: `${c.tabsNumber || ""} · ${c.caseType} · ${c.status}`,
            href: `/cases/${c.id}`,
          }))
          setResults(caseResults)
          setSelectedIndex(0)
        }
      } catch {}
      setSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Keyboard navigation
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault()
      router.push(results[selectedIndex].href)
      setSearchOpen(false)
      setQuery("")
      setResults([])
    }
  }, [results, selectedIndex, router])

  return (
    <div className="flex items-start justify-between gap-6 mb-8 header-enter">
      {/* Greeting */}
      <div className="min-w-0">
        <h1
          className="text-display-md leading-snug"
          style={{ color: "var(--c-gray-900)" }}
        >
          {greeting}, {firstName}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--c-gray-400)" }}>
          {subtitle}
        </p>
      </div>

      {/* Search */}
      <div className="shrink-0 hidden md:block relative" ref={panelRef}>
        {!searchOpen ? (
          /* Collapsed search trigger */
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 cursor-pointer transition-all duration-150 hover:border-[var(--c-gray-200)]"
            style={{
              background: "var(--c-white)",
              border: "1px solid var(--c-gray-100)",
              boxShadow: "var(--shadow-xs)",
              minWidth: 220,
            }}
          >
            <Search className="h-3.5 w-3.5" style={{ color: "var(--c-gray-300)" }} />
            <span className="text-[13px]" style={{ color: "var(--c-gray-300)" }}>
              Search cases, docs...
            </span>
            <kbd
              className="ml-auto text-[10px] font-medium rounded px-1.5 py-0.5"
              style={{
                color: "var(--c-gray-300)",
                background: "var(--c-gray-50)",
                border: "1px solid var(--c-gray-100)",
              }}
            >
              /
            </kbd>
          </button>
        ) : (
          /* Expanded search input + results */
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--c-white)",
              border: "1px solid var(--c-gray-200)",
              boxShadow: "var(--shadow-panel)",
              minWidth: 360,
              animation: "cardIn 200ms var(--ease-out-expo) both",
            }}
          >
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              <Search className="h-4 w-4 shrink-0" style={{ color: "var(--c-gray-300)" }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search cases, documents..."
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--c-gray-300)]"
                style={{ color: "var(--c-gray-800)" }}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setResults([]) }}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--c-gray-50)]"
                >
                  <X className="h-3 w-3" style={{ color: "var(--c-gray-300)" }} />
                </button>
              )}
              <kbd
                className="text-[10px] font-medium rounded px-1.5 py-0.5"
                style={{
                  color: "var(--c-gray-300)",
                  background: "var(--c-gray-50)",
                  border: "1px solid var(--c-gray-100)",
                }}
              >
                esc
              </kbd>
            </div>

            {/* Results */}
            {(results.length > 0 || searching) && (
              <div style={{ borderTop: "1px solid var(--c-gray-50)" }}>
                {searching && results.length === 0 ? (
                  <div className="py-6 text-center">
                    <div className="inline-block h-4 w-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--c-gray-200)", borderTopColor: "transparent" }} />
                  </div>
                ) : (
                  results.map((r, i) => {
                    const Icon = typeIcons[r.type]
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          router.push(r.href)
                          setSearchOpen(false)
                          setQuery("")
                          setResults([])
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors"
                        style={{
                          background: i === selectedIndex ? "var(--c-gray-50)" : "transparent",
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--c-gray-300)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--c-gray-800)" }}>{r.title}</p>
                          <p className="text-[11px] truncate" style={{ color: "var(--c-gray-400)" }}>{r.subtitle}</p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}

            {query.length > 0 && !searching && results.length === 0 && query.length >= 2 && (
              <div className="py-6 text-center" style={{ borderTop: "1px solid var(--c-gray-50)" }}>
                <p className="text-[12px]" style={{ color: "var(--c-gray-300)" }}>No results found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
