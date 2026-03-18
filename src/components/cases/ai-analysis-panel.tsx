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
  { value: "CASE_MEMO", label: "Case Memo" },
  { value: "WORKING_PAPERS", label: "OIC Working Papers", caseTypes: ["OIC"] },
  { value: "OIC_NARRATIVE", label: "OIC Narrative", caseTypes: ["OIC"] },
  { value: "PENALTY_LETTER", label: "Penalty Abatement Letter", caseTypes: ["PENALTY"] },
  { value: "IA_ANALYSIS", label: "Installment Agreement Analysis", caseTypes: ["IA"] },
  { value: "CNC_ANALYSIS", label: "Currently Not Collectible Analysis", caseTypes: ["CNC"] },
  { value: "TFRP_ANALYSIS", label: "Trust Fund Recovery Penalty Analysis", caseTypes: ["TFRP"] },
  { value: "INNOCENT_SPOUSE_ANALYSIS", label: "Innocent Spouse Relief Analysis", caseTypes: ["INNOCENT_SPOUSE"] },
] as const

interface AIAnalysisPanelProps {
  caseId: string
  caseType: string
  documentCount: number
  documentsWithTextCount?: number
}

export function AIAnalysisPanel({ caseId, caseType, documentCount, documentsWithTextCount }: AIAnalysisPanelProps) {
  const docsWithText = documentsWithTextCount ?? documentCount

  // Smart default: pick the most relevant task type for the case type
  const defaultTaskType = (() => {
    switch (caseType) {
      case "OIC": return "WORKING_PAPERS"
      case "PENALTY": return "PENALTY_LETTER"
      case "IA": return "IA_ANALYSIS"
      case "CNC": return "CNC_ANALYSIS"
      case "TFRP": return "TFRP_ANALYSIS"
      case "INNOCENT_SPOUSE": return "INNOCENT_SPOUSE_ANALYSIS"
      default: return "GENERAL_ANALYSIS"
    }
  })()

  const [taskType, setTaskType] = useState(defaultTaskType)
  const [model, setModel] = useState<string>("claude-sonnet-4-6")
  const [additionalContext, setAdditionalContext] = useState("")
  const [loading, setLoading] = useState(false)
  const [statusPhase, setStatusPhase] = useState("")
  const [result, setResult] = useState<{
    taskId: string
    verifyFlagCount: number
    judgmentFlagCount: number
    warning?: string
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
    setStatusPhase("Starting analysis...")

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, taskType, additionalContext, model }),
      })

      if (!res.ok) {
        // Non-streaming error (validation, auth, rate limit)
        const err = await res.json()
        throw new Error(err.error || "Analysis failed")
      }

      // Read the streaming response
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n").filter(Boolean)
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.status === "processing") {
              setStatusPhase(data.phase || "Processing...")
            } else if (data.status === "complete") {
              setResult(data)
              addToast({
                title: "Analysis complete",
                description: data.warning || "AI output is ready for review.",
              })
              router.refresh()
            } else if (data.status === "error") {
              throw new Error(data.error || "Analysis failed")
            }
          } catch (parseError: any) {
            // If it's a re-thrown error from inside, propagate it
            if (parseError.message && parseError.message !== "Unexpected end of JSON input") {
              throw parseError
            }
          }
        }
      }
    } catch (error: any) {
      addToast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setStatusPhase("")
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
              {/* Show relevant tasks first, then general, then others */}
              {[...TASK_TYPES]
                .sort((a, b) => {
                  const aRelevant = !("caseTypes" in a) || (a.caseTypes?.includes(caseType as never))
                  const bRelevant = !("caseTypes" in b) || (b.caseTypes?.includes(caseType as never))
                  if (aRelevant && !bRelevant) return -1
                  if (!aRelevant && bRelevant) return 1
                  return 0
                })
                .map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-sonnet-4-6">Sonnet 4.6 (fast, standard)</SelectItem>
              <SelectItem value="claude-opus-4-6">Opus 4.6 (complex analysis)</SelectItem>
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

        {documentCount > 0 && docsWithText < documentCount && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">
                {docsWithText === 0
                  ? `None of your ${documentCount} document(s) have extractable text.`
                  : `Only ${docsWithText} of ${documentCount} document(s) have extractable text.`}
              </p>
              <p className="text-yellow-700 mt-1">
                Scanned PDFs and images cannot be read yet (OCR not configured). Upload searchable PDFs or text files for best results.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleAnalyze} disabled={loading || docsWithText === 0}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {statusPhase || "Analyzing..."}
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
          {documentCount > 0 && docsWithText === 0 && (
            <p className="text-sm text-destructive">
              No documents with extractable text
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
