"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { Brain, Loader2, AlertTriangle, CheckCircle } from "lucide-react"

const TASK_TYPES = [
  { value: "GENERAL_ANALYSIS", label: "General Case Analysis" },
  { value: "WORKING_PAPERS", label: "OIC Working Papers" },
  { value: "CASE_MEMO", label: "Case Memo" },
  { value: "PENALTY_LETTER", label: "Penalty Abatement Letter" },
  { value: "OIC_NARRATIVE", label: "OIC Narrative" },
]

interface AIAnalysisPanelProps {
  caseId: string
  caseType: string
  documentCount: number
}

export function AIAnalysisPanel({ caseId, caseType, documentCount }: AIAnalysisPanelProps) {
  const [taskType, setTaskType] = useState(
    caseType === "OIC" ? "WORKING_PAPERS" :
    caseType === "PENALTY" ? "PENALTY_LETTER" :
    "GENERAL_ANALYSIS"
  )
  const [additionalContext, setAdditionalContext] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    taskId: string
    verifyFlagCount: number
    judgmentFlagCount: number
  } | null>(null)
  const router = useRouter()
  const { addToast } = useToast()

  async function handleAnalyze() {
    if (documentCount === 0) {
      addToast({
        title: "No documents",
        description: "Upload and process documents before running analysis.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, taskType, additionalContext }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Analysis failed")
      }

      const data = await res.json()
      setResult(data)
      addToast({
        title: "Analysis complete",
        description: "AI output is ready for review.",
      })
      router.refresh()
    } catch (error: any) {
      addToast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5" />
          AI Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Analysis Type</Label>
          <Select value={taskType} onValueChange={setTaskType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Additional Context (optional)</Label>
          <Textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Add any specific instructions or context for the analysis..."
            rows={3}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleAnalyze} disabled={loading || documentCount === 0}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Run Analysis
              </>
            )}
          </Button>
          {documentCount === 0 && (
            <p className="text-sm text-muted-foreground">
              Upload documents first
            </p>
          )}
        </div>

        {result && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-sm">Analysis Complete</span>
            </div>
            <div className="flex gap-3">
              {result.verifyFlagCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {result.verifyFlagCount} items to verify
                </Badge>
              )}
              {result.judgmentFlagCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  {result.judgmentFlagCount} judgment calls
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Output is in the Review Queue. Review and approve before use.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
