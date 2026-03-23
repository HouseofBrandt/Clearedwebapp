"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight } from "lucide-react"

interface CasePosture {
  collectionStage: string
  deadlinesApproaching: string[]
  reliefSought: string
  priorAttempts: string[]
  additionalContext?: string
}

interface SuggestionChip {
  label: string
  description: string
  text: string
}

interface AssignmentInputProps {
  caseType: string
  existingTaskTypes: string[]
  onSubmit: (assignmentText: string, casePosture?: CasePosture, model?: string, skipRevision?: boolean) => void
  disabled?: boolean
}

const COLLECTION_STAGES = [
  "Pre-assessment (audit/examination)",
  "Assessed \u2014 no collection action yet",
  "CP14/CP501/CP503 notice stage",
  "CP504 \u2014 intent to levy/file lien",
  "LT11/Letter 1058 \u2014 final notice",
  "Active levy/garnishment",
  "Tax Court petition filed",
  "CDP hearing requested",
  "OIC pending",
  "IA in place",
  "CNC status",
  "Appeals",
] as const

const DEADLINE_OPTIONS = [
  "CDP hearing deadline (30 days)",
  "Tax Court petition deadline (90 days)",
  "CSED expiring within 2 years",
  "OIC deemed acceptance (24 months)",
  "None known",
] as const

const RELIEF_OPTIONS = [
  "OIC \u2014 settle for less than owed",
  "Installment Agreement",
  "Currently Not Collectible",
  "Penalty Abatement",
  "Innocent Spouse Relief",
  "CDP hearing / Equivalent hearing",
  "TFRP defense",
  "Not yet determined (need analysis)",
] as const

const PRIOR_ATTEMPT_OPTIONS = [
  "Prior OIC submitted (rejected/returned)",
  "Prior IA (defaulted/rejected)",
  "Prior CDP hearing",
  "Prior penalty abatement request",
  "None",
] as const

function getSuggestions(caseType: string, existingTaskTypes: string[]): SuggestionChip[] {
  const suggestions: SuggestionChip[] = []

  switch (caseType) {
    case "OIC":
      if (!existingTaskTypes.includes("WORKING_PAPERS")) {
        suggestions.push({
          label: "Working Papers + Case Summary",
          description: "Full OIC workup with summary",
          text: "Generate OIC working papers for this client. Then generate a one-page case summary in Word format covering: the likely offer amount based on the working papers, our biggest risks, and what documents are still missing.",
        })
      }
      suggestions.push({
        label: "OIC Narrative Letter",
        description: "IRS submission narrative",
        text: "Generate the OIC narrative letter for IRS submission, referencing the client's financial situation and explaining why the offer should be accepted.",
      })
      break
    case "PENALTY":
      suggestions.push({
        label: "Penalty Abatement Letter",
        description: "First-time or reasonable cause",
        text: "Generate a penalty abatement letter analyzing whether first-time abatement or reasonable cause applies, based on the uploaded documents.",
      })
      break
    case "IA":
      suggestions.push({
        label: "IA Analysis + Case Summary",
        description: "Installment agreement workup",
        text: "Analyze the case for installment agreement options (streamlined, PPIA, or regular). Then generate a case summary with the recommended payment amount and term.",
      })
      break
    case "CNC":
      suggestions.push({
        label: "CNC Analysis",
        description: "Currently Not Collectible determination",
        text: "Analyze this case for Currently Not Collectible status eligibility based on the client's financial documents.",
      })
      break
    case "TFRP":
      suggestions.push({
        label: "TFRP Defense Analysis",
        description: "Responsible person analysis",
        text: "Analyze the Trust Fund Recovery Penalty case, identifying responsible persons and willfulness arguments.",
      })
      break
    default:
      break
  }

  // Always offer general analysis if nothing else fits
  if (suggestions.length === 0 || existingTaskTypes.length === 0) {
    suggestions.push({
      label: "Full Case Analysis",
      description: "Comprehensive review",
      text: "Perform a comprehensive case analysis: identify the case type, recommend the best resolution strategy, flag any risks, and list missing documents.",
    })
  }

  // Risk assessment is always relevant
  suggestions.push({
    label: "Risk Assessment",
    description: "Strengths, weaknesses, gaps",
    text: "Generate a risk assessment report identifying case strengths, weaknesses, missing documents, and procedural risks.",
  })

  return suggestions.slice(0, 4)
}

export function AssignmentInput({ caseType, existingTaskTypes, onSubmit, disabled }: AssignmentInputProps) {
  const [text, setText] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [model, setModel] = useState("claude-opus-4-6")
  const [skipRevision, setSkipRevision] = useState(false)
  const [casePosture, setCasePosture] = useState<CasePosture>({
    collectionStage: "",
    deadlinesApproaching: [],
    reliefSought: "",
    priorAttempts: [],
    additionalContext: "",
  })

  const suggestions = getSuggestions(caseType, existingTaskTypes)

  function handleSubmit() {
    if (!text.trim()) return
    const posture = casePosture.collectionStage || casePosture.reliefSought ? casePosture : undefined
    onSubmit(text.trim(), posture, model, skipRevision)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">What do you need?</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. "Generate OIC working papers and a one-page case summary showing the offer amount, our biggest risks, and what documents are still missing."`}
          rows={4}
          className="resize-none"
          disabled={disabled}
        />
      </div>

      {/* Suggestion Chips */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Suggested for this {caseType.replace(/_/g, " ")} case:
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setText(chip.text)}
              disabled={disabled}
              className="rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <p className="font-medium">{chip.label}</p>
              <p className="text-xs text-muted-foreground">{chip.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Options */}
      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Advanced Options
          {(casePosture.collectionStage || casePosture.reliefSought || model !== "claude-opus-4-6") && (
            <Badge variant="secondary" className="ml-auto text-xs">configured</Badge>
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-4 border-t px-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-opus-4-6">Opus 4.6</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Collection stage</Label>
              <Select value={casePosture.collectionStage} onValueChange={(v) => setCasePosture((p) => ({ ...p, collectionStage: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {COLLECTION_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Key deadlines approaching?</Label>
              <div className="space-y-1">
                {DEADLINE_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={casePosture.deadlinesApproaching.includes(opt)}
                      onChange={(e) => setCasePosture((p) => ({
                        ...p,
                        deadlinesApproaching: e.target.checked
                          ? [...p.deadlinesApproaching, opt]
                          : p.deadlinesApproaching.filter((d) => d !== opt),
                      }))}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Relief being sought</Label>
              <Select value={casePosture.reliefSought} onValueChange={(v) => setCasePosture((p) => ({ ...p, reliefSought: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {RELIEF_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Prior resolution attempts</Label>
              <div className="space-y-1">
                {PRIOR_ATTEMPT_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={casePosture.priorAttempts.includes(opt)}
                      onChange={(e) => setCasePosture((p) => ({
                        ...p,
                        priorAttempts: e.target.checked
                          ? [...p.priorAttempts, opt]
                          : p.priorAttempts.filter((a) => a !== opt),
                      }))}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Additional Context</Label>
              <Textarea
                value={casePosture.additionalContext || ""}
                onChange={(e) => setCasePosture((p) => ({ ...p, additionalContext: e.target.value }))}
                placeholder="E.g., Client received LT11 on Jan 6, 2026..."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipRevision}
                  onChange={(e) => setSkipRevision(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Skip quality review
                <span className="text-xs text-muted-foreground">(not recommended)</span>
              </label>
            </div>
          </div>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={disabled || !text.trim()} className="w-full">
        Start Assignment
      </Button>
    </div>
  )
}
