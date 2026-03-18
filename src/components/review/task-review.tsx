"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { DocumentViewerPanel } from "@/components/review/document-viewer-panel"

interface TaskReviewProps {
  task: any
  documents?: any[]
}

const SPREADSHEET_TASKS = ["WORKING_PAPERS", "OIC_NARRATIVE"]
const MEMO_TASKS = [
  "CASE_MEMO", "PENALTY_LETTER", "GENERAL_ANALYSIS",
  "IA_ANALYSIS", "CNC_ANALYSIS", "TFRP_ANALYSIS", "INNOCENT_SPOUSE_ANALYSIS",
]

const COMPLEX_TASK_TYPES = ["WORKING_PAPERS", "GENERAL_ANALYSIS", "TFRP_ANALYSIS"]

interface ParsedFlag {
  type: "VERIFY" | "JUDGMENT"
  context: string
}

function parseFlags(text: string): ParsedFlag[] {
  const flags: ParsedFlag[] = []
  const patterns = [
    { regex: /\[VERIFY\]/g, type: "VERIFY" as const },
    { regex: /\[PRACTITIONER JUDGMENT\]/g, type: "JUDGMENT" as const },
  ]

  for (const { regex, type } of patterns) {
    let match
    while ((match = regex.exec(text)) !== null) {
      const start = Math.max(0, match.index - 30)
      const end = Math.min(text.length, match.index + match[0].length + 30)
      let context = text.slice(start, end).replace(/\n/g, " ")
      if (start > 0) context = "..." + context
      if (end < text.length) context = context + "..."
      flags.push({ type, context })
    }
  }

  return flags
}

export function TaskReview({ task, documents = [] }: TaskReviewProps) {
  const [output, setOutput] = useState(task.detokenizedOutput || "")
  const [reviewNotes, setReviewNotes] = useState("")
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [acknowledgedFlags, setAcknowledgedFlags] = useState<Set<number>>(new Set())
  const [reviewStartedAt] = useState(Date.now())
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [correctionNotes, setCorrectionNotes] = useState("")
  const router = useRouter()
  const { addToast } = useToast()

  const isSpreadsheet = SPREADSHEET_TASKS.includes(task.taskType)
  const isMemo = MEMO_TASKS.includes(task.taskType)
  const isReviewable = task.status === "READY_FOR_REVIEW"

  const flags = useMemo(() => parseFlags(output), [output])
  const allFlagsAcknowledged = flags.length === 0 || acknowledgedFlags.size >= flags.length

  function toggleFlag(index: number) {
    setAcknowledgedFlags((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

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
          editedOutput: editing ? output : undefined,
          reviewNotes: action === "REJECT_REPROMPT" ? correctionNotes : reviewNotes,
        }),
      })

      if (!res.ok) throw new Error("Review action failed")

      addToast({
        title: `Task ${action === "APPROVE" || action === "EDIT_APPROVE" ? "approved" : "rejected"}`,
      })
      router.refresh()
    } catch {
      addToast({
        title: "Error",
        description: "Failed to submit review",
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

      {/* Item 12: Flag acknowledgment bar */}
      {flags.length > 0 && isReviewable && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              {flags.length} flag{flags.length === 1 ? "" : "s"} require{flags.length === 1 ? "s" : ""} acknowledgment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {flags.map((flag, i) => (
              <label
                key={i}
                className="flex items-start gap-3 rounded-md border bg-background p-2 cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={acknowledgedFlags.has(i)}
                  onChange={() => toggleFlag(i)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <Badge
                    variant="outline"
                    className={
                      flag.type === "VERIFY"
                        ? "text-yellow-600 mb-1"
                        : "text-blue-600 mb-1"
                    }
                  >
                    {flag.type === "VERIFY" ? "[VERIFY]" : "[JUDGMENT]"}
                  </Badge>
                  <p className="text-xs text-muted-foreground truncate">{flag.context}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
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
          ) : isMemo && editing ? (
            <RichTextEditor
              content={output}
              editable={true}
              onChange={(html) => setOutput(html)}
            />
          ) : editing ? (
            <Textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
          ) : isMemo ? (
            <RichTextEditor
              content={output}
              editable={false}
            />
          ) : (
            <div className="prose max-w-none rounded-lg bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-sm">{output}</pre>
            </div>
          )}
        </CardContent>
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
            {flags.length > 0 && !allFlagsAcknowledged && (
              <p className="text-sm text-yellow-600 font-medium">
                Acknowledge all flags before approving
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleReviewAction("APPROVE")}
                disabled={submitting || editing || !allFlagsAcknowledged}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
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
                    {new Date(ra.reviewCompletedAt || ra.reviewStartedAt).toLocaleString()}
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
