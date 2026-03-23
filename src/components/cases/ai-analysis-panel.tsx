"use client"

import { useState, useRef } from "react"
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
import { Progress } from "@/components/ui/progress"
import { Brain, Loader2, AlertTriangle, CheckCircle, ChevronDown, ChevronRight } from "lucide-react"

interface CasePosture {
  collectionStage: string
  deadlinesApproaching: string[]
  reliefSought: string
  priorAttempts: string[]
  additionalContext?: string
}

const COLLECTION_STAGES = [
  "Pre-assessment (audit/examination)",
  "Assessed — no collection action yet",
  "CP14/CP501/CP503 notice stage",
  "CP504 — intent to levy/file lien",
  "LT11/Letter 1058 — final notice",
  "Active levy/garnishment",
  "Tax Court petition filed",
  "CDP hearing requested",
  "Equivalent hearing requested",
  "OIC pending",
  "IA in place",
  "CNC status",
  "Appeals",
  "Unknown / not sure",
] as const

const DEADLINE_OPTIONS = [
  "CDP hearing deadline (30 days)",
  "Tax Court petition deadline (90 days)",
  "CSED expiring within 2 years",
  "OIC deemed acceptance (24 months)",
  "Statute of limitations on refund",
  "None known",
] as const

const RELIEF_OPTIONS = [
  "OIC — settle for less than owed",
  "Installment Agreement",
  "Currently Not Collectible",
  "Penalty Abatement",
  "Innocent Spouse Relief",
  "CDP hearing / Equivalent hearing",
  "Audit reconsideration",
  "Tax Court litigation",
  "TFRP defense",
  "Lien/Levy release",
  "Not yet determined (need analysis)",
] as const

const PRIOR_ATTEMPT_OPTIONS = [
  "Prior OIC submitted (rejected/returned)",
  "Prior IA (defaulted/rejected)",
  "Prior CDP hearing",
  "Prior penalty abatement request",
  "Changed representatives",
  "None",
] as const

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
  { value: "APPEALS_REBUTTAL", label: "Appeals Rebuttal Packet", caseTypes: ["OIC", "IA", "PENALTY", "CDP", "CNC", "TFRP", "INNOCENT_SPOUSE"] },
] as const

interface CaseDocument {
  id: string
  fileName: string
  documentCategory: string
}

interface AIAnalysisPanelProps {
  caseId: string
  caseType: string
  documentCount: number
  documentsWithTextCount?: number
  documents?: CaseDocument[]
}

export function AIAnalysisPanel({ caseId, caseType, documentCount, documentsWithTextCount, documents = [] }: AIAnalysisPanelProps) {
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
  const [model, setModel] = useState<string>("claude-opus-4-6")
  const [additionalContext, setAdditionalContext] = useState("")
  const [showPosture, setShowPosture] = useState(false)
  const [casePosture, setCasePosture] = useState<CasePosture>({
    collectionStage: "",
    deadlinesApproaching: [],
    reliefSought: "",
    priorAttempts: [],
    additionalContext: "",
  })
  const [rejectionDocId, setRejectionDocId] = useState("")
  const [strategyNotes, setStrategyNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [statusPhase, setStatusPhase] = useState("")
  const [analysisPercent, setAnalysisPercent] = useState(0)
  const [result, setResult] = useState<{
    taskId: string
    verifyFlagCount: number
    judgmentFlagCount: number
    warning?: string
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
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
    setErrorMessage(null)
    setStatusPhase("Starting analysis...")
    setAnalysisPercent(0)
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1)
    }, 1000)

    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          taskType,
          additionalContext,
          model,
          casePosture: casePosture.collectionStage || casePosture.reliefSought
            ? casePosture
            : undefined,
          ...(taskType === "APPEALS_REBUTTAL" && {
            rejectionDocumentId: rejectionDocId || undefined,
            strategyNotes: strategyNotes || undefined,
          }),
        }),
      })

      if (!res.ok) {
        // Non-streaming error (validation, auth, rate limit)
        const err = await res.json()
        throw new Error(err.error || "Analysis failed")
      }

      // Read the streaming response, buffering partial lines across chunks
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ""
      let gotResult = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split("\n")
        // Keep the last element — it may be an incomplete line
        lineBuffer = lines.pop() || ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.status === "processing") {
              setStatusPhase(data.phase || "Processing...")
              // Map phases to progress percentages
              const phase = data.phase || ""
              if (phase.includes("Preparing")) setAnalysisPercent(10)
              else if (phase.includes("generating")) {
                // During generation, estimate progress from content length
                const chars = data.progress || 0
                // Typical output is 4000-12000 chars; estimate progress in the 15-85% range
                setAnalysisPercent(Math.min(85, 15 + Math.round((chars / 8000) * 70)))
              }
              else if (phase.includes("Processing results")) setAnalysisPercent(90)
            } else if (data.status === "complete") {
              gotResult = true
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
            // Re-throw application errors (from the "error" status handler above)
            // but silently ignore JSON parse errors from malformed lines
            if (parseError instanceof SyntaxError) continue
            throw parseError
          }
        }
      }
      // Process any remaining buffered data
      if (lineBuffer.trim()) {
        try {
          const data = JSON.parse(lineBuffer)
          if (data.status === "complete") {
            gotResult = true
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
          if (!(parseError instanceof SyntaxError)) throw parseError
        }
      }
      // Stream closed without a clear completion signal
      if (!gotResult && !result) {
        addToast({
          title: "Analysis may have completed",
          description: "Check the AI Tasks tab — the analysis may have saved successfully.",
        })
        router.refresh()
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Analysis failed")
      addToast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
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
              <SelectItem value="claude-opus-4-6">Opus 4.6</SelectItem>
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

        {taskType === "APPEALS_REBUTTAL" && (
          <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <div className="space-y-2">
              <Label className="font-medium">IRS Rejection Letter</Label>
              <p className="text-xs text-muted-foreground">
                Select the uploaded document that is the IRS rejection letter you are responding to.
                The AI will focus its rebuttal on the specific reasons stated in this document.
              </p>
              <Select value={rejectionDocId} onValueChange={setRejectionDocId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rejection letter document..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.fileName} [{doc.documentCategory.replace(/_/g, " ")}]
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Practitioner Strategy Notes (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Guide the AI on your rebuttal strategy: which arguments to emphasize, specific evidence to highlight,
                or any points the examiner got wrong that you want the rebuttal to focus on.
              </p>
              <Textarea
                value={strategyNotes}
                onChange={(e) => setStrategyNotes(e.target.value)}
                placeholder="E.g., Examiner used wrong asset valuation — home equity should be based on QSV not FMV. Focus on IRM 5.8.5 standards for expense allowances. Client has medical condition supporting ETA argument..."
                rows={4}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Tip: expand &ldquo;Case Posture&rdquo; below to help the AI target the correct procedural track
        </p>

        {/* Case Posture — collapsible */}
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowPosture(!showPosture)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            {showPosture ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Case Posture (recommended)
            {(casePosture.collectionStage || casePosture.reliefSought) && (
              <Badge variant="secondary" className="ml-auto text-xs">configured</Badge>
            )}
          </button>

          {showPosture && (
            <div className="space-y-4 border-t px-3 py-3">
              {/* Collection Stage */}
              <div className="space-y-1.5">
                <Label className="text-sm">Collection stage</Label>
                <Select
                  value={casePosture.collectionStage}
                  onValueChange={(v) => setCasePosture((p) => ({ ...p, collectionStage: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select collection stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COLLECTION_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Key Deadlines */}
              <div className="space-y-1.5">
                <Label className="text-sm">Key deadlines approaching?</Label>
                <div className="space-y-1">
                  {DEADLINE_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={casePosture.deadlinesApproaching.includes(opt)}
                        onChange={(e) => {
                          setCasePosture((p) => ({
                            ...p,
                            deadlinesApproaching: e.target.checked
                              ? [...p.deadlinesApproaching, opt]
                              : p.deadlinesApproaching.filter((d) => d !== opt),
                          }))
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* Relief Sought */}
              <div className="space-y-1.5">
                <Label className="text-sm">Relief being sought</Label>
                <Select
                  value={casePosture.reliefSought}
                  onValueChange={(v) => setCasePosture((p) => ({ ...p, reliefSought: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select primary relief..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RELIEF_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prior Attempts */}
              <div className="space-y-1.5">
                <Label className="text-sm">Prior resolution attempts</Label>
                <div className="space-y-1">
                  {PRIOR_ATTEMPT_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={casePosture.priorAttempts.includes(opt)}
                        onChange={(e) => {
                          setCasePosture((p) => ({
                            ...p,
                            priorAttempts: e.target.checked
                              ? [...p.priorAttempts, opt]
                              : p.priorAttempts.filter((a) => a !== opt),
                          }))
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              {/* Additional Posture Context */}
              <div className="space-y-1.5">
                <Label className="text-sm">Additional Context (optional)</Label>
                <Textarea
                  value={casePosture.additionalContext || ""}
                  onChange={(e) => setCasePosture((p) => ({ ...p, additionalContext: e.target.value }))}
                  placeholder="E.g., Client received LT11 on Jan 6, 2026. Prior rep failed to file TY2022..."
                  rows={2}
                />
              </div>
            </div>
          )}
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
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Run Analysis
              </>
            )}
          </Button>
          {loading && (
            <div className="flex-1 min-w-0">
              <Progress
                value={analysisPercent}
                size="md"
                showPercent
                label={statusPhase}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {elapsedSeconds}s elapsed
                {elapsedSeconds > 30 && " — complex analyses can take 2-4 minutes"}
              </p>
            </div>
          )}
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

        {errorMessage && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="font-medium text-sm text-red-800">Analysis Failed</span>
            </div>
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

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
