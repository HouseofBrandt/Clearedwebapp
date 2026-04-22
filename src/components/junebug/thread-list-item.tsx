"use client"

/**
 * ThreadListItem (spec §7.4).
 *
 * Layout:
 *   📌 <title>                       ← truncate 1 line, Instrument Serif-ish
 *      CLR-2026-04-0123 · 2h ago     ← case chip + relative time, mono
 *      <preview>                     ← last-message preview, 1 line
 *
 * Hover reveals `...` menu: Pin/Unpin, Rename, Archive, Delete.
 * Active row: left accent in --c-gold, background --c-gray-50.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Archive, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react"
import type { JunebugThreadListItem as ThreadItem } from "./types"
import { formatRelativeShort } from "./lib/group-threads"
import { redactLeakedPII } from "@/lib/feed/redact-leaked-pii"

export interface ThreadListItemProps {
  thread: ThreadItem
  isActive: boolean
  searchHighlight?: string
  onSelect: (threadId: string) => void
  onRename: (threadId: string, newTitle: string) => void
  onPin: (threadId: string, next: boolean) => void
  onArchive: (threadId: string, next: boolean) => void
  onDelete: (threadId: string) => void
}

export function ThreadListItem({
  thread,
  isActive,
  searchHighlight,
  onSelect,
  onRename,
  onPin,
  onArchive,
  onDelete,
}: ThreadListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(thread.title)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [menuOpen])

  const handleRenameCommit = () => {
    const v = renameValue.trim()
    if (v && v !== thread.title) onRename(thread.id, v)
    setRenaming(false)
  }

  return (
    <div
      className={`group relative rounded-md transition-colors ${
        isActive ? "bg-c-gray-50" : "hover:bg-c-gray-50/60"
      }`}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r"
          style={{ background: "var(--c-gold)" }}
        />
      )}
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        className="block w-full px-3 py-2.5 pr-8 text-left"
      >
        {/* Title row */}
        <div className="flex items-center gap-1.5">
          {thread.pinned && (
            <Pin
              className="h-3 w-3 flex-shrink-0"
              style={{ color: "var(--c-gold)" }}
              aria-label="Pinned"
            />
          )}
          {renaming ? (
            <input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleRenameCommit()
                } else if (e.key === "Escape") {
                  setRenameValue(thread.title)
                  setRenaming(false)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-[14px] leading-snug text-c-gray-900 outline-none"
              style={{ fontFamily: "var(--font-display, Georgia), serif" }}
              maxLength={200}
            />
          ) : (
            <span
              className="flex-1 truncate text-[14px] leading-snug text-c-gray-900"
              style={{ fontFamily: "var(--font-display, Georgia), serif" }}
            >
              {highlight(thread.title, searchHighlight)}
            </span>
          )}
        </div>
        {/* Metadata row */}
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.04em] text-c-gray-500"
          style={{ fontFamily: "var(--font-mono, monospace)" }}
        >
          {thread.caseNumber && (
            <>
              <Link
                href={`/cases/${thread.caseId}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-c-gray-700"
              >
                {thread.caseNumber}
              </Link>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{formatRelativeShort(thread.lastMessageAt)}</span>
          {thread.archived && (
            <>
              <span aria-hidden>·</span>
              <span>Archived</span>
            </>
          )}
        </div>
        {/* Preview row — redacted as a defense-in-depth against upstream leaks */}
        {thread.lastMessagePreview && (
          <p className="mt-1 truncate text-[12px] text-c-gray-500">
            {thread.lastMessageRole === "USER" ? "You: " : ""}
            {highlight(redactLeakedPII(thread.lastMessagePreview), searchHighlight)}
          </p>
        )}
      </button>

      {/* Hover menu */}
      <div className="absolute right-1.5 top-1.5" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className={`rounded p-1 text-c-gray-300 hover:bg-c-gray-100 hover:text-c-gray-700 ${
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } focus:opacity-100`}
          aria-label="Thread actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-7 z-10 w-44 overflow-hidden rounded-md border border-c-gray-100 bg-white shadow-lg"
          >
            <MenuAction
              icon={thread.pinned ? PinOff : Pin}
              label={thread.pinned ? "Unpin" : "Pin"}
              onClick={() => {
                setMenuOpen(false)
                onPin(thread.id, !thread.pinned)
              }}
            />
            <MenuAction
              icon={Pencil}
              label="Rename"
              onClick={() => {
                setMenuOpen(false)
                setRenaming(true)
              }}
            />
            <MenuAction
              icon={Archive}
              label={thread.archived ? "Unarchive" : "Archive"}
              onClick={() => {
                setMenuOpen(false)
                onArchive(thread.id, !thread.archived)
              }}
            />
            <div className="border-t border-c-gray-100" />
            <MenuAction
              icon={Trash2}
              label="Delete"
              destructive
              onClick={() => {
                setMenuOpen(false)
                onDelete(thread.id)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
        destructive ? "text-c-danger hover:bg-c-danger/5" : "text-c-gray-700 hover:bg-c-gray-50"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function highlight(text: string, term?: string): React.ReactNode {
  if (!term || !text) return text
  const q = term.trim()
  if (!q) return text
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig")
    const parts = text.split(re)
    return parts.map((p, i) =>
      re.test(p) ? (
        <mark key={i} className="bg-c-gold-soft px-0.5 text-c-gray-900">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      )
    )
  } catch {
    return text
  }
}
