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
} from "lucide-react"

interface TaskReviewProps {
  task: any
}

const SPREADSHEET_TASKS = ["WORKING_PAPERS", "OIC_NARRATIVE"]
const MEMO_TASKS = ["CASE_MEMO", "PENALTY_LETTER", "GENERAL_ANALYSIS"]

export function TaskReview({ task }: TaskReviewProps) {
  const [output, setOutput] = useState(task.detokenizedOutput || "")
  const [reviewNotes, setReviewNotes] = useState("")
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const { addToast } = useToast()

  const isSpreadsheet = SPREADSHEET_TASKS.includes(task.taskType)
  const isMemo = MEMO_TASKS.includes(task.taskType)
  const isReviewable = task.status === "READY_FOR_REVIEW"

  async function handleReviewAction(action: string) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/review/${task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          editedOutput: editing ? output : undefined,
          reviewNotes,
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
    }
  }

  function handleExport() {
    const format = isSpreadsheet ? "xlsx" : "txt"
    window.open(`/api/ai/tasks/${task.id}/export?format=${format}`, "_blank")
  }

  return (
    <div className="space-y-4">
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
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-3 w-3" />
                Export {isSpreadsheet ? ".xlsx" : ".txt"}
              </Button>
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

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleReviewAction("APPROVE")}
                disabled={submitting || editing}
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
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save & Approve
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => handleReviewAction("REJECT_REPROMPT")}
                disabled={submitting}
                className="text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject & Re-prompt
              </Button>

              <Button
                variant="outline"
                onClick={() => handleReviewAction("REJECT_MANUAL")}
                disabled={submitting}
                className="text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject (Manual)
              </Button>
            </div>

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
  )
}
