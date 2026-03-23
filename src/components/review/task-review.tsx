"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/toast"
import { SpreadsheetEditor } from "@/components/editor/spreadsheet-editor"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import {
  CheckCircle,
  XCircle,
  Edit3,
  AlertTriangle,
  FileText,
  Download,
  BookPlus,
  Loader2,
} from "lucide-react"
import { DocumentViewerPanel } from "@/components/review/document-viewer-panel"
import { DeadlineSuggestions } from "@/components/calendar/deadline-suggestions"
import { ReviewJunebug } from "@/components/review/review-junebug"
import { formatDateTime } from "@/lib/date-utils"
import { marked } from "marked"

interface TaskReviewProps {
  task: any
  documents?: any[]
}

const SPREADSHEET_TASKS = ["WORKING_PAPERS"]
const MEMO_TASKS = [
  "CASE_MEMO", "PENALTY_LETTER", "GENERAL_ANALYSIS",
  "IA_ANALYSIS", "CNC_ANALYSIS", "TFRP_ANALYSIS", "INNOCENT_SPOUSE_ANALYSIS",
]

const COMPLEX_TASK_TYPES = ["WORKING_PAPERS", "GENERAL_ANALYSIS", "TFRP_ANALYSIS"]

function highlightFlags(text: string): string {
  return text
    .replace(
      /\[VERIFY[^\]]*\]/g,
      (match) => `<span class="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">${match}</span>`
    )
    .replace(
      /\[PRACTITIONER JUDGMENT\]/g,
      (match) => `<span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200">${match}</span>`
    )
}

function RenderedOutput({ content, taskType }: { content: string; taskType: string }) {
  // For spreadsheet tasks, the parent handles SpreadsheetEditor directly
  if (SPREADSHEET_TASKS.includes(taskType)) return null

  const html = highlightFlags(marked.parse(content, { breaks: true, gfm: true }) as string)

  return (
    <div
      className="prose prose-sm max-w-none
        prose-headings:font-heading prose-headings:font-semibold prose-headings:text-foreground
        prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:border-b prose-h2:pb-2 prose-h2:border-border
        prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
        prose-table:text-sm prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left
        prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border
        prose-strong:text-foreground
        prose-p:leading-relaxed prose-p:text-foreground/90
        prose-li:text-foreground/90"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function TaskReview({ task, documents = [] }: TaskReviewProps) {
  const [output, setOutput] = useState(task.detokenizedOutput || "")
  const [reviewNotes, setReviewNotes] = useState("")
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [flagsReviewed, setFlagsReviewed] = useState(false)
  const [outputConfirmed, setOutputConfirmed] = useState(false)
  const [reviewStartedAt] = useState(Date.now())
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [correctionNotes, setCorrectionNotes] = useState("")
  const [addingToKb, setAddingToKb] = useState(false)
  const [addedToKb, setAddedToKb] = useState(false)
  const [hasJunebugEdits, setHasJunebugEdits] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  const isSpreadsheet = SPREADSHEET_TASKS.includes(task.taskType)
  const isMemo = MEMO_TASKS.includes(task.taskType)
  const isReviewable = task.status === "READY_FOR_REVIEW"

  const verifyCount = task.verifyFlagCount || 0
  const judgmentCount = task.judgmentFlagCount || 0
  const totalFlags = verifyCount + judgmentCount
  const allFlagsAcknowledged = totalFlags === 0 || (flagsReviewed && outputConfirmed)

  async function handleReviewAction(action: string) {
    // Item 13: Review time warning for complex tasks
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
          editedOutput: (editing || hasJunebugEdits) ? output : undefined,
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
      // Brief delay so user sees the toast, then redirect to queue
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
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left panel: source documents */}
      <div className="w-full lg:w-2/5 lg:sticky lg:top-4 lg:self-start">
        <DocumentViewerPanel documents={documents} />
      </div>

      {/* Right panel: AI output and review actions */}
      <div className="w-full lg:w-3/5 space-y-4">

      {/* Flag attestation */}
      {totalFlags > 0 && isReviewable && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-sm">Review Flags</span>
            </div>
            <p className="text-sm text-muted-foreground">
              This analysis contains{" "}
              <strong>{verifyCount} verification item{verifyCount !== 1 ? "s" : ""}</strong>
              {judgmentCount > 0 && <> and <strong>{judgmentCount} professional judgment item{judgmentCount !== 1 ? "s" : ""}</strong></>}
              . These are highlighted in the document below.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={flagsReviewed}
                onChange={(e) => setFlagsReviewed(e.target.checked)}
                className="mt-0.5 h-4 w-4" />
              <span className="text-sm">
                I have reviewed all flagged items and exercised professional judgment.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={outputConfirmed}
                onChange={(e) => setOutputConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4" />
              <span className="text-sm">
                I confirm this output is suitable for use after my review.
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {/* AI-suggested deadlines */}
      {task.metadata?.suggestedDeadlines?.length > 0 && (
        <DeadlineSuggestions
          suggestions={task.metadata.suggestedDeadlines}
          caseId={task.caseId}
          taskId={task.id}
        />
      )}

      {/* Output display */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">AI Output</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">
                {task.modelUsed || "Unknown model"}
              </Badge>
              {task.verifyFlagCount > 0 && (
                <Badge variant="outline" className="gap-1 text-yellow-600">
                  <AlertTriangle className="h-3 w-3" />
                  {task.verifyFlagCount} [VERIFY]
                </Badge>
              )}
              {task.judgmentFlagCount > 0 && (
                <Badge variant="outline" className="gap-1 text-blue-600">
                  <FileText className="h-3 w-3" />
                  {task.judgmentFlagCount} [JUDGMENT]
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => handleExport()}>
                <Download className="mr-2 h-3 w-3" />
                Export {isSpreadsheet ? ".xlsx" : ".docx"}
              </Button>
              {isSpreadsheet && (
                <Button variant="outline" size="sm" onClick={() => handleExport("docx")}>
                  <Download className="mr-2 h-3 w-3" />
                  Export .docx
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isSpreadsheet ? (
            <SpreadsheetEditor
              taskId={task.id}
              editable={editing}
            />
          ) : editing ? (
            isMemo ? (
              <RichTextEditor
                content={output}
                editable={true}
                onChange={(html) => setOutput(html)}
              />
            ) : (
              <Textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
              />
            )
          ) : (
            <RenderedOutput content={output} taskType={task.taskType} />
          )}
        </CardContent>

        {/* Junebug-assisted editing — available when not in manual edit mode */}
        {isReviewable && !editing && !isSpreadsheet && (
          <ReviewJunebug
            currentOutput={output}
            taskType={task.taskType}
            onOutputUpdated={(newOutput) => {
              setOutput(newOutput)
              setHasJunebugEdits(true)
            }}
          />
        )}
      </Card>

      {/* Review actions */}
      {isReviewable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Review Notes (optional)</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add notes about your review..."
                rows={2}
              />
            </div>

            <Separator />

            {/* Flag acknowledgment notice */}
            {totalFlags > 0 && !allFlagsAcknowledged && (
              <p className="text-sm text-yellow-600 font-medium">
                Acknowledge all flags above before approving
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleReviewAction(hasJunebugEdits ? "EDIT_APPROVE" : "APPROVE")}
                disabled={submitting || editing || !allFlagsAcknowledged}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {hasJunebugEdits ? "Approve with Edits" : "Approve"}
              </Button>

              {!editing ? (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit & Approve
                </Button>
              ) : (
                <Button
                  onClick={() => handleReviewAction("EDIT_APPROVE")}
                  disabled={submitting || !allFlagsAcknowledged}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save & Approve
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(true)}
                disabled={submitting}
                className="text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject & Re-prompt
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  if (!window.confirm("Are you sure you want to reject this task? This cannot be undone.")) return
                  handleReviewAction("REJECT_MANUAL")
                }}
                disabled={submitting}
                className="text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject (Manual)
              </Button>
            </div>

            {/* Item 14: Reject & Re-prompt confirmation section */}
            {rejectDialogOpen && (
              <div className="rounded-lg border border-destructive/50 p-4 space-y-3">
                <Label className="font-medium">
                  Enter correction notes for the AI re-prompt:
                </Label>
                <Textarea
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  placeholder="Describe what needs to be corrected..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleReviewAction("REJECT_REPROMPT")}
                    disabled={submitting || correctionNotes.trim().length === 0}
                    variant="destructive"
                  >
                    Confirm & Re-prompt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejectDialogOpen(false)
                      setCorrectionNotes("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              All AI output must be reviewed by a licensed practitioner before use.
              No AI-generated content goes directly to clients or the IRS.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add to Knowledge Base — shows for approved tasks */}
      {task.status === "APPROVED" && !addedToKb && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Task approved</p>
                <p className="text-xs text-muted-foreground">
                  Was this output high quality? Adding it to the knowledge base helps improve future analyses.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddedToKb(true)}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  disabled={addingToKb}
                  onClick={async () => {
                    setAddingToKb(true)
                    try {
                      const res = await fetch("/api/knowledge/ingest-approved", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ taskId: task.id }),
                      })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error(err.error || "Failed")
                      }
                      const data = await res.json()
                      addToast({
                        title: "Added to Knowledge Base",
                        description: `${data.chunksCreated} chunks created`,
                      })
                      setAddedToKb(true)
                    } catch (error: any) {
                      addToast({ title: "Error", description: error.message, variant: "destructive" })
                    } finally {
                      setAddingToKb(false)
                    }
                  }}
                >
                  {addingToKb ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <BookPlus className="mr-1 h-3 w-3" />}
                  Add to Knowledge Base
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review history */}
      {task.reviewActions?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {task.reviewActions.map((ra: any) => (
                <div key={ra.id} className="flex items-start justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={ra.action.includes("APPROVE") ? "default" : "destructive"}
                      >
                        {ra.action.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        by {ra.practitioner?.name}
                      </span>
                    </div>
                    {ra.reviewNotes && (
                      <p className="mt-1 text-sm">{ra.reviewNotes}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(ra.reviewCompletedAt || ra.reviewStartedAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
