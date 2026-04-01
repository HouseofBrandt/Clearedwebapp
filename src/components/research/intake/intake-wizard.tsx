"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Zap,
  ClipboardList,
  ScrollText,
  BarChart3,
  Swords,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Check,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LucideIcon } from "lucide-react"

/* ── Types ────────────────────────────────────────────────────────── */

type ResearchMode =
  | "QUICK_ANSWER"
  | "ISSUE_BRIEF"
  | "RESEARCH_MEMORANDUM"
  | "AUTHORITY_SURVEY"
  | "COUNTERARGUMENT_PREP"

type WizardStep = 1 | 2 | 3 | 4 | 5

interface ModeConfig {
  key: ResearchMode
  label: string
  description: string
  estimatedTime: string
  icon: LucideIcon
  accentBorder: string
  accentBg: string
  accentText: string
}

interface CaseOption {
  id: string
  caseNumber: string
  clientName: string
}

interface QuestionData {
  question: string
  jurisdiction?: string
  taxpayerType?: string
  irsPosition?: string
  targetAuthority?: string
  adversePosition?: string
  clientPosition?: string
}

interface SourcePriorities {
  irc: boolean
  treasuryRegs: boolean
  revRulings: boolean
  revProcs: boolean
  caselaw: boolean
  irsGuidance: boolean
  stateTax: boolean
}

interface WizardState {
  mode: ResearchMode | null
  questionData: QuestionData
  bindToCase: boolean
  selectedCaseId: string | null
  sourcePriorities: SourcePriorities
  recencyBias: number
}

/* ── Mode configs ─────────────────────────────────────────────────── */

const MODES: ModeConfig[] = [
  {
    key: "QUICK_ANSWER",
    label: "Quick Answer",
    description:
      "Fast, concise answer with key authority citations. Best for straightforward questions with settled law.",
    estimatedTime: "~2 min",
    icon: Zap,
    accentBorder: "border-teal-400",
    accentBg: "bg-teal-50",
    accentText: "text-teal-700",
  },
  {
    key: "ISSUE_BRIEF",
    label: "Issue Brief",
    description:
      "Structured analysis of a single issue with authority discussion. Good for client-facing summaries.",
    estimatedTime: "~5 min",
    icon: ClipboardList,
    accentBorder: "border-amber-400",
    accentBg: "bg-amber-50",
    accentText: "text-amber-700",
  },
  {
    key: "RESEARCH_MEMORANDUM",
    label: "Research Memorandum",
    description:
      "Comprehensive legal memo with full authority analysis, counterarguments, and conclusions. Firm-grade work product.",
    estimatedTime: "~10 min",
    icon: ScrollText,
    accentBorder: "border-[#1e3a5f]",
    accentBg: "bg-[#eef2f7]",
    accentText: "text-[#1e3a5f]",
  },
  {
    key: "AUTHORITY_SURVEY",
    label: "Authority Survey",
    description:
      "Tabular survey of all relevant authorities on a topic. Useful for building a position or preparing for audit.",
    estimatedTime: "~8 min",
    icon: BarChart3,
    accentBorder: "border-slate-400",
    accentBg: "bg-slate-50",
    accentText: "text-slate-700",
  },
  {
    key: "COUNTERARGUMENT_PREP",
    label: "Counterargument Prep",
    description:
      "Anticipates IRS positions and prepares rebuttals. Essential for Appeals, CDP hearings, and Tax Court.",
    estimatedTime: "~8 min",
    icon: Swords,
    accentBorder: "border-red-400",
    accentBg: "bg-red-50",
    accentText: "text-red-700",
  },
]

/* ── Step labels ──────────────────────────────────────────────────── */

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Mode",
  2: "Question",
  3: "Case",
  4: "Options",
  5: "Launch",
}

/* ── Default source priorities ────────────────────────────────────── */

const DEFAULT_SOURCES: SourcePriorities = {
  irc: true,
  treasuryRegs: true,
  revRulings: true,
  revProcs: true,
  caselaw: true,
  irsGuidance: true,
  stateTax: false,
}

/* ── Component ────────────────────────────────────────────────────── */

export function IntakeWizard() {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>(1)
  const [launching, setLaunching] = useState(false)
  const [cases, setCases] = useState<CaseOption[]>([])
  const [casesLoading, setCasesLoading] = useState(false)

  const [state, setState] = useState<WizardState>({
    mode: null,
    questionData: {
      question: "",
      jurisdiction: "",
      taxpayerType: "",
      irsPosition: "",
      targetAuthority: "",
      adversePosition: "",
      clientPosition: "",
    },
    bindToCase: false,
    selectedCaseId: null,
    sourcePriorities: { ...DEFAULT_SOURCES },
    recencyBias: 50,
  })

  /* ── Fetch cases when step 3 is reached ─────────────────────────── */

  useEffect(() => {
    if (step === 3 && cases.length === 0 && !casesLoading) {
      setCasesLoading(true)
      fetch("/api/cases?limit=50")
        .then((res) => (res.ok ? res.json() : { cases: [] }))
        .then((data) => {
          const list = data.cases ?? data ?? []
          setCases(
            list.map((c: any) => ({
              id: c.id,
              caseNumber: c.caseNumber,
              clientName: c.clientName ?? "Unknown",
            }))
          )
        })
        .catch(() => setCases([]))
        .finally(() => setCasesLoading(false))
    }
  }, [step, cases.length, casesLoading])

  /* ── Navigation helpers ─────────────────────────────────────────── */

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 1:
        return state.mode !== null
      case 2:
        return state.questionData.question.trim().length > 0
      case 3:
        return !state.bindToCase || state.selectedCaseId !== null
      case 4:
        return true
      case 5:
        return true
      default:
        return false
    }
  }, [step, state])

  const goNext = () => {
    if (step < 5 && canAdvance()) setStep((s) => (s + 1) as WizardStep)
  }

  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep)
  }

  /* ── Launch research ────────────────────────────────────────────── */

  const handleLaunch = async () => {
    if (launching) return
    setLaunching(true)

    try {
      // Step 1: Create session
      const createRes = await fetch("/api/research/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: state.mode,
          questionText: state.questionData.question,
          factsText: state.questionData.jurisdiction || undefined,
          proceduralPosture: state.questionData.taxpayerType || undefined,
          knownAuthorities: state.questionData.targetAuthority || undefined,
          specificQuestions: state.questionData.adversePosition || undefined,
          intendedAudience: state.questionData.clientPosition || undefined,
          caseId: state.bindToCase ? state.selectedCaseId : undefined,
          sourcePriorities: Object.entries(state.sourcePriorities)
            .filter(([, enabled]) => enabled)
            .map(([key]) => key),
          recencyBias: state.recencyBias,
        }),
      })

      if (!createRes.ok) throw new Error("Failed to create session")
      const session = await createRes.json()
      const sessionId = session.id

      // Step 2: Launch analysis
      await fetch(`/api/research/sessions/${sessionId}/launch`, {
        method: "POST",
      })

      // Step 3: Redirect
      router.push(`/research/${sessionId}`)
    } catch (err) {
      console.error("Launch failed:", err)
      setLaunching(false)
    }
  }

  /* ── Update helpers ─────────────────────────────────────────────── */

  const updateQuestion = (field: keyof QuestionData, value: string) => {
    setState((prev) => ({
      ...prev,
      questionData: { ...prev.questionData, [field]: value },
    }))
  }

  const toggleSource = (key: keyof SourcePriorities) => {
    setState((prev) => ({
      ...prev,
      sourcePriorities: {
        ...prev.sourcePriorities,
        [key]: !prev.sourcePriorities[key],
      },
    }))
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Research</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and launch a new research session with Banjo.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator currentStep={step} />

      {/* Step content */}
      <div className="min-h-[360px]">
        {step === 1 && (
          <ModeSelector
            selected={state.mode}
            onSelect={(mode) => setState((prev) => ({ ...prev, mode }))}
          />
        )}
        {step === 2 && (
          <QuestionInput
            mode={state.mode!}
            data={state.questionData}
            onChange={updateQuestion}
          />
        )}
        {step === 3 && (
          <CaseBinding
            bindToCase={state.bindToCase}
            selectedCaseId={state.selectedCaseId}
            cases={cases}
            loading={casesLoading}
            onToggleBind={(v) =>
              setState((prev) => ({
                ...prev,
                bindToCase: v,
                selectedCaseId: v ? prev.selectedCaseId : null,
              }))
            }
            onSelectCase={(id) =>
              setState((prev) => ({ ...prev, selectedCaseId: id }))
            }
          />
        )}
        {step === 4 && (
          <SourcePrioritiesStep
            priorities={state.sourcePriorities}
            recencyBias={state.recencyBias}
            onToggle={toggleSource}
            onRecencyChange={(v) =>
              setState((prev) => ({ ...prev, recencyBias: v }))
            }
          />
        )}
        {step === 5 && <LaunchConfirmation state={state} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-6">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={step === 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        {step < 5 ? (
          <Button onClick={goNext} disabled={!canAdvance()}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleLaunch} disabled={launching || !canAdvance()}>
            {launching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Rocket className="mr-2 h-4 w-4" />
                Launch Research
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── Step Indicator ───────────────────────────────────────────────── */

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4, 5] as WizardStep[]).map((s) => {
        const isActive = s === currentStep
        const isComplete = s < currentStep
        return (
          <div key={s} className="flex items-center gap-2">
            {s > 1 && (
              <div
                className={`h-px w-8 ${
                  isComplete ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              <span
                className={`hidden text-xs sm:inline ${
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Step 1: Mode Selector ────────────────────────────────────────── */

function ModeSelector({
  selected,
  onSelect,
}: {
  selected: ResearchMode | null
  onSelect: (mode: ResearchMode) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-overline mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Select Research Mode
        </p>
        <p className="text-sm text-muted-foreground">
          Choose the type of research output you need.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const isSelected = selected === mode.key
          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => onSelect(mode.key)}
              className={`group relative rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? `${mode.accentBorder} ${mode.accentBg} ring-2 ring-offset-1`
                  : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
              }`}
              style={isSelected ? { boxShadow: "var(--shadow-1)" } : undefined}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? mode.accentBg : "bg-muted"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      isSelected ? mode.accentText : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        isSelected ? mode.accentText : "text-foreground"
                      }`}
                    >
                      {mode.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {mode.estimatedTime}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {mode.description}
                  </p>
                </div>
              </div>

              {isSelected && (
                <div className="absolute right-3 top-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${mode.accentText}`}
                    style={{ backgroundColor: "currentColor", opacity: 0.15 }}
                  >
                    <Check
                      className={`h-3 w-3 ${mode.accentText}`}
                      strokeWidth={3}
                    />
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Step 2: Question Input ───────────────────────────────────────── */

function QuestionInput({
  mode,
  data,
  onChange,
}: {
  mode: ResearchMode
  data: QuestionData
  onChange: (field: keyof QuestionData, value: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-overline mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Define Your Question
        </p>
        <p className="text-sm text-muted-foreground">
          {mode === "QUICK_ANSWER" &&
            "State your question clearly for a concise, citable answer."}
          {mode === "ISSUE_BRIEF" &&
            "Describe the issue for a structured brief with authority discussion."}
          {mode === "RESEARCH_MEMORANDUM" &&
            "Frame the legal question for a comprehensive research memorandum."}
          {mode === "AUTHORITY_SURVEY" &&
            "Identify the topic or code section for a tabular authority survey."}
          {mode === "COUNTERARGUMENT_PREP" &&
            "Describe the IRS position you need to counter."}
        </p>
      </div>

      {/* Primary question field - always shown */}
      <div className="space-y-2">
        <Label htmlFor="question">
          {mode === "COUNTERARGUMENT_PREP"
            ? "IRS Position or Issue to Counter"
            : mode === "AUTHORITY_SURVEY"
            ? "Topic or Code Section"
            : "Research Question"}
        </Label>
        <Textarea
          id="question"
          placeholder={
            mode === "QUICK_ANSWER"
              ? "e.g., Can a taxpayer claim the home office deduction if they rent rather than own?"
              : mode === "ISSUE_BRIEF"
              ? "e.g., Whether taxpayer qualifies for innocent spouse relief under IRC 6015(b) given..."
              : mode === "RESEARCH_MEMORANDUM"
              ? "e.g., Whether the taxpayer's cryptocurrency staking rewards constitute ordinary income under IRC 61..."
              : mode === "AUTHORITY_SURVEY"
              ? "e.g., IRC 6672 - Trust Fund Recovery Penalty responsible person analysis"
              : "e.g., IRS asserts taxpayer is a responsible person under IRC 6672 based on check-signing authority alone..."
          }
          value={data.question}
          onChange={(e) => onChange("question", e.target.value)}
          className="min-h-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          Be as specific as possible. Include relevant facts, tax years, and code sections.
        </p>
      </div>

      {/* Mode-specific additional fields */}
      {(mode === "RESEARCH_MEMORANDUM" || mode === "ISSUE_BRIEF") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="jurisdiction">Jurisdiction</Label>
            <Input
              id="jurisdiction"
              placeholder="e.g., Federal, California, New York"
              value={data.jurisdiction ?? ""}
              onChange={(e) => onChange("jurisdiction", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxpayerType">Taxpayer Type</Label>
            <Input
              id="taxpayerType"
              placeholder="e.g., Individual, Corporation, Partnership"
              value={data.taxpayerType ?? ""}
              onChange={(e) => onChange("taxpayerType", e.target.value)}
            />
          </div>
        </div>
      )}

      {mode === "COUNTERARGUMENT_PREP" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="adversePosition">Adverse Position Details</Label>
            <Textarea
              id="adversePosition"
              placeholder="Describe the IRS position, notice language, or examiner argument in detail..."
              value={data.adversePosition ?? ""}
              onChange={(e) => onChange("adversePosition", e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientPosition">Client&apos;s Position</Label>
            <Textarea
              id="clientPosition"
              placeholder="Describe the taxpayer's factual basis and legal position..."
              value={data.clientPosition ?? ""}
              onChange={(e) => onChange("clientPosition", e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </>
      )}

      {mode === "AUTHORITY_SURVEY" && (
        <div className="space-y-2">
          <Label htmlFor="targetAuthority">
            Target Authority Types (optional)
          </Label>
          <Input
            id="targetAuthority"
            placeholder="e.g., IRC, Treas. Reg., case law, Rev. Rul."
            value={data.targetAuthority ?? ""}
            onChange={(e) => onChange("targetAuthority", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to survey all authority types.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Step 3: Case Binding ─────────────────────────────────────────── */

function CaseBinding({
  bindToCase,
  selectedCaseId,
  cases,
  loading,
  onToggleBind,
  onSelectCase,
}: {
  bindToCase: boolean
  selectedCaseId: string | null
  cases: CaseOption[]
  loading: boolean
  onToggleBind: (v: boolean) => void
  onSelectCase: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-overline mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Case Binding
        </p>
        <p className="text-sm text-muted-foreground">
          Optionally bind this research to an existing case for context and
          organization.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium">Bind to a case</p>
            <p className="text-xs text-muted-foreground">
              Link this research session to a client case
            </p>
          </div>
          <Switch checked={bindToCase} onCheckedChange={onToggleBind} />
        </CardContent>
      </Card>

      {bindToCase && (
        <div className="space-y-2">
          <Label>Select Case</Label>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading cases...
            </div>
          ) : cases.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No cases found. Create a case first, or proceed without binding.
            </p>
          ) : (
            <Select
              value={selectedCaseId ?? ""}
              onValueChange={onSelectCase}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a case..." />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.caseNumber} &mdash; {c.clientName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Step 4: Source Priorities ─────────────────────────────────────── */

const SOURCE_LABELS: Record<keyof SourcePriorities, string> = {
  irc: "Internal Revenue Code (IRC)",
  treasuryRegs: "Treasury Regulations",
  revRulings: "Revenue Rulings",
  revProcs: "Revenue Procedures",
  caselaw: "Case Law (Tax Court, Circuit Courts)",
  irsGuidance: "IRS Guidance (Notices, PLRs, FSAs)",
  stateTax: "State Tax Authority",
}

function SourcePrioritiesStep({
  priorities,
  recencyBias,
  onToggle,
  onRecencyChange,
}: {
  priorities: SourcePriorities
  recencyBias: number
  onToggle: (key: keyof SourcePriorities) => void
  onRecencyChange: (v: number) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-overline mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Advanced Options
        </p>
        <p className="text-sm text-muted-foreground">
          Fine-tune which authorities Banjo prioritizes and how it weights
          recency.
        </p>
      </div>

      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between p-5 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="text-sm font-medium">Source Priorities</span>
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </button>

        {expanded && (
          <CardContent className="space-y-3 border-t px-5 pb-5 pt-4">
            {(Object.keys(SOURCE_LABELS) as (keyof SourcePriorities)[]).map(
              (key) => (
                <div key={key} className="flex items-center gap-3">
                  <Checkbox
                    id={`src-${key}`}
                    checked={priorities[key]}
                    onCheckedChange={() => onToggle(key)}
                  />
                  <Label
                    htmlFor={`src-${key}`}
                    className="cursor-pointer font-normal"
                  >
                    {SOURCE_LABELS[key]}
                  </Label>
                </div>
              )
            )}

            <div className="mt-4 space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="font-normal">Recency Bias</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {recencyBias}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={recencyBias}
                onChange={(e) => onRecencyChange(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Older authority OK</span>
                <span>Prefer recent</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

/* ── Step 5: Launch Confirmation ──────────────────────────────────── */

function LaunchConfirmation({ state }: { state: WizardState }) {
  const modeConfig = MODES.find((m) => m.key === state.mode)
  if (!modeConfig) return null

  const Icon = modeConfig.icon

  const enabledSources = (
    Object.keys(state.sourcePriorities) as (keyof SourcePriorities)[]
  )
    .filter((k) => state.sourcePriorities[k])
    .map((k) => SOURCE_LABELS[k])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-overline mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Confirm & Launch
        </p>
        <p className="text-sm text-muted-foreground">
          Review your research configuration before launching.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          {/* Mode */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${modeConfig.accentBg}`}
            >
              <Icon className={`h-5 w-5 ${modeConfig.accentText}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{modeConfig.label}</p>
              <p className="text-xs text-muted-foreground">
                Estimated: {modeConfig.estimatedTime}
              </p>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Question
            </p>
            <p className="mt-1 text-sm">{state.questionData.question}</p>
          </div>

          {state.questionData.jurisdiction && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Jurisdiction
              </p>
              <p className="mt-1 text-sm">{state.questionData.jurisdiction}</p>
            </div>
          )}

          {state.questionData.taxpayerType && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Taxpayer Type
              </p>
              <p className="mt-1 text-sm">{state.questionData.taxpayerType}</p>
            </div>
          )}

          {state.questionData.adversePosition && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Adverse Position
              </p>
              <p className="mt-1 text-sm">
                {state.questionData.adversePosition}
              </p>
            </div>
          )}

          {state.questionData.clientPosition && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Client Position
              </p>
              <p className="mt-1 text-sm">
                {state.questionData.clientPosition}
              </p>
            </div>
          )}

          {state.questionData.targetAuthority && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Target Authority
              </p>
              <p className="mt-1 text-sm">
                {state.questionData.targetAuthority}
              </p>
            </div>
          )}

          {state.bindToCase && state.selectedCaseId && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Bound to Case
              </p>
              <p className="mt-1 text-sm">{state.selectedCaseId}</p>
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Source Priorities
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {enabledSources.map((src) => (
                <span
                  key={src}
                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {src}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recency Bias
            </p>
            <p className="mt-1 text-sm">{state.recencyBias}%</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
