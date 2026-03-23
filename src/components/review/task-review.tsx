"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { SpreadsheetEditor } from "@/components/editor/spreadsheet-editor"
import { DocumentViewerPanel } from "@/components/review/document-viewer-panel"
import { DeadlineSuggestions } from "@/components/calendar/deadline-suggestions"
import { ReviewJunebug } from "@/components/review/review-junebug"
import { formatDateTime } from "@/lib/date-utils"
import { marked } from "marked"
import {
  Download,
  FileText,
  X,
  ArrowLeft,
} from "lucide-react"
import { TASK_TYPE_LABELS } from "@/types"
import Link from "next/link"

interface TaskReviewProps {
  task: any
  documents?: any[]
}

const SPREADSHEET_TASKS = ["WORKING_PAPERS"]
const COMPLEX_TASK_TYPES = ["WORKING_PAPERS", "GENERAL_ANALYSIS", "TFRP_ANALYSIS"]

// ── Flag Highlighting ──────────────────────────────────────────────────
function highlightFlags(text: string): string {
  return text
    .replace(
      /\[VERIFY[^\]]*\]/g,
      (match) => `<span class="verify-flag">${match}</span>`
    )
    .replace(
      /\[PRACTITIONER JUDGMENT\]/g,
      (match) => `<span class="judgment-flag">${match}</span>`
    )
}

// ── Rendered Output ────────────────────────────────────────────────────
function RenderedOutput({ content, taskType }: { content: string; taskType: string }) {
  if (SPREADSHEET_TASKS.includes(taskType)) return null

  const html = highlightFlags(marked.parse(content, { breaks: true, gfm: true }) as string)

  return (
    <div
      className="review-document"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ── Source Documents Drawer ────────────────────────────────────────────
function SourceDrawer({ documents, onClose }: { documents: any[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[420px] bg-background border-l shadow-lg overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-background z-10">
          <h3 className="font-medium text-sm">Source Documents ({documents.length})</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <DocumentViewerPanel documents={documents} />
      </aside>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────
export function TaskReview({ task, documents = [] }: TaskReviewProps) {
  const [output, setOutput] = useState(task.detokenizedOutput || "")
  const [reviewNotes, setReviewNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [flagsReviewed, setFlagsReviewed] = useState(false)
  const [outputConfirmed, setOutputConfirmed] = useState(false)
  const [reviewStartedAt] = useState(Date.now())
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [correctionNotes, setCorrectionNotes] = useState("")
  const [hasJunebugEdits, setHasJunebugEdits] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [showReviewNotes, setShowReviewNotes] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  const isSpreadsheet = SPREADSHEET_TASKS.includes(task.taskType)
  const isReviewable = task.status === "READY_FOR_REVIEW"

  const verifyCount = task.verifyFlagCount || 0
  const judgmentCount = task.judgmentFlagCount || 0
  const totalFlags = verifyCount + judgmentCount
  const allFlagsAcknowledged = totalFlags === 0 || (flagsReviewed && outputConfirmed)

  const taskLabel = (TASK_TYPE_LABELS as any)[task.taskType]
    || task.banjoStepLabel
    || task.taskType.replace(/_/g, " ")

  async function handleReviewAction(action: string) {
    if (action === "APPROVE" || action === "EDIT_APPROVE") {
      const elapsedSeconds = Math.floor((Date.now() - reviewStartedAt) / 1000)
      if (COMPLEX_TASK_TYPES.includes(task.taskType) && elapsedSeconds < 60) {
        const confirmed = window.confirm(
          `This review was completed in ${elapsedSeconds} seconds. Complex analyses typically require thorough review. Are you sure you want to approve?`
        )
        if (!confirmed) return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/review/${task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          editedOutput: hasJunebugEdits ? output : undefined,
          reviewNotes: action === "REJECT_REPROMPT" ? correctionNotes : reviewNotes,
          reviewStartedAt: new Date(reviewStartedAt).toISOString(),
          flagsAcknowledged: allFlagsAcknowledged,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || err.error || "Review action failed")
      }

      addToast({
        title: `Task ${action === "APPROVE" || action === "EDIT_APPROVE" ? "approved" : "rejected"}`,
      })
      setTimeout(() => router.push("/review"), 1200)
    } catch (err: any) {
      addToast({
        title: "Review failed",
        description: err.message || "Failed to submit review",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
      setRejectDialogOpen(false)
      setCorrectionNotes("")
    }
  }

  function handleExport(format?: string) {
    const fmt = format || (isSpreadsheet ? "xlsx" : "docx")
    window.open(`/api/ai/tasks/${task.id}/export?format=${fmt}`, "_blank")
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ── Sticky Header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background border-b px-6 py-3 shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button
                onClick={() => router.push("/review")}
                className="hover:text-foreground flex items-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Review Queue
              </button>
            </div>
            <h1 className="text-lg font-semibold mt-1">{taskLabel}</h1>
            <Link
              href={`/cases/${task.case?.id || task.caseId}`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {task.case?.tabsNumber} &middot; {task.case?.clientName}
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground text-xs">{task.modelUsed}</span>
            {verifyCount > 0 && (
              <span className="text-amber-600 font-medium text-xs">{verifyCount} VERIFY</span>
            )}
            {judgmentCount > 0 && (
              <span className="text-blue-600 font-medium text-xs">{judgmentCount} JUDGMENT</span>
            )}
            <button
              onClick={() => handleExport()}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted"
              title={`Export ${isSpreadsheet ? ".xlsx" : ".docx"}`}
            >
              <Download className="h-4 w-4" />
            </button>
            {isSpreadsheet && (
              <button
                onClick={() => handleExport("docx")}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted"
                title="Export .docx"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
            {documents.length > 0 && (
              <button
                onClick={() => setShowSources(true)}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted"
                title="View source documents"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Scrollable Document Body ────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* AI-suggested deadlines */}
          {task.metadata?.suggestedDeadlines?.length > 0 && (
            <div className="mb-6">
              <DeadlineSuggestions
                suggestions={task.metadata.suggestedDeadlines}
                caseId={task.caseId}
                taskId={task.id}
              />
            </div>
          )}

          {/* The document */}
          {isSpreadsheet ? (
            <SpreadsheetEditor taskId={task.id} editable={false} />
          ) : (
            <RenderedOutput content={output} taskType={task.taskType} />
          )}

          {/* Review history (below the document) */}
          {task.reviewActions?.length > 0 && (
            <div className="mt-12 border-t pt-6">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Review History
              </h3>
              <div className="space-y-2">
                {task.reviewActions.map((ra: any) => (
                  <div key={ra.id} className="flex items-center justify-between text-sm py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        ra.action.includes("APPROVE")
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}>
                        {ra.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted-foreground">
                        {ra.practitioner?.name}
                      </span>
                      {ra.reviewNotes && (
                        <span className="text-muted-foreground italic">
                          &mdash; {ra.reviewNotes}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(ra.reviewCompletedAt || ra.reviewStartedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Junebug Edit Bar ────────────────────────────────────── */}
      {isReviewable && !isSpreadsheet && (
        <div className="shrink-0">
          <ReviewJunebug
            currentOutput={output}
            taskType={task.taskType}
            onOutputUpdated={(newOutput) => {
              setOutput(newOutput)
              setHasJunebugEdits(true)
            }}
          />
        </div>
      )}

      {/* ── Approval Footer ─────────────────────────────────────── */}
      {isReviewable && (
        <footer className="border-t bg-background px-6 py-3 shrink-0">
          <div className="max-w-4xl mx-auto">
            {/* Reject dialog (inline, above buttons) */}
            {rejectDialogOpen && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-3 space-y-3">
                <label className="text-sm font-medium">Correction notes for re-prompt:</label>
                <textarea
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  placeholder="Describe what needs to be corrected..."
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReviewAction("REJECT_REPROMPT")}
                    disabled={submitting || correctionNotes.trim().length === 0}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-40"
                  >
                    Confirm & Re-prompt
                  </button>
                  <button
                    onClick={() => {
                      setRejectDialogOpen(false)
                      setCorrectionNotes("")
                    }}
                    className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Review notes (toggle) */}
            {showReviewNotes && (
              <div className="mb-3">
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Review notes (optional)..."
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            {/* Footer bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {totalFlags > 0 && (
                  <>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={flagsReviewed}
                        onChange={(e) => setFlagsReviewed(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span>Flags reviewed</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={outputConfirmed}
                        onChange={(e) => setOutputConfirmed(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      <span>Output confirmed</span>
                    </label>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowReviewNotes(!showReviewNotes)}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                  title="Add review notes"
                >
                  Notes
                </button>
                <button
                  onClick={() => setRejectDialogOpen(true)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleReviewAction(hasJunebugEdits ? "EDIT_APPROVE" : "APPROVE")}
                  disabled={submitting || (totalFlags > 0 && !allFlagsAcknowledged)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40"
                >
                  {submitting ? "Submitting..." : hasJunebugEdits ? "Approve with Edits" : "Approve"}
                </button>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* ── Source Documents Drawer ──────────────────────────────── */}
      {showSources && (
        <SourceDrawer documents={documents} onClose={() => setShowSources(false)} />
      )}
    </div>
  )
}
