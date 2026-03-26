"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Circle,
  AlertCircle,
  Save,
  Download,
  CheckCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  FileSearch,
  X,
} from "lucide-react"
import type {
  FormSchema,
  FormInstance,
  SectionDef,
  FieldDef,
  ValidationRule,
} from "@/lib/forms/types"
import type { SectionCompletionState } from "@/types/forms"
import {
  FieldRenderer,
  evaluateConditions,
  evaluateFormula,
} from "@/components/forms/field-renderer"
import { JunebugFormAssistant } from "@/components/forms/junebug-form-assistant"
import { JunebugIcon } from "@/components/assistant/junebug-icon"
import { PDFFormPreview } from "@/components/forms/pdf-preview"
import type { AutoPopulationResult, AutoPopulatedField } from "@/lib/forms/auto-populate"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrencyDisplay(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function timeAgo(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/** Validate a single field */
function validateField(field: FieldDef, value: any, allValues: Record<string, any>): string[] {
  if (!evaluateConditions(field.conditionals, allValues)) return []
  if (field.type === "computed") return []

  const errors: string[] = []

  if (field.required) {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      errors.push(`${field.label} is required`)
    }
  }

  if (value && field.validation) {
    for (const rule of field.validation) {
      switch (rule.type) {
        case "min_length":
          if (String(value).length < Number(rule.value)) errors.push(rule.message)
          break
        case "max_length":
          if (String(value).length > Number(rule.value)) errors.push(rule.message)
          break
        case "min":
          if (Number(value) < Number(rule.value)) errors.push(rule.message)
          break
        case "max":
          if (Number(value) > Number(rule.value)) errors.push(rule.message)
          break
        case "pattern":
          if (!new RegExp(String(rule.value)).test(String(value))) errors.push(rule.message)
          break
        case "required":
          // Already handled above
          break
      }
    }
  }

  return errors
}

/** Get completion state for a section */
function getSectionState(
  section: SectionDef,
  values: Record<string, any>,
  errors: Record<string, string[]>
): SectionCompletionState {
  const visibleFields = section.fields.filter(
    (f) => f.type !== "computed" && evaluateConditions(f.conditionals, values)
  )
  if (visibleFields.length === 0) return "complete"

  const hasErrors = visibleFields.some((f) => errors[f.id]?.length)
  if (hasErrors) return "error"

  const filledCount = visibleFields.filter((f) => {
    const v = values[f.id]
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)
  }).length

  if (filledCount === 0) return "empty"
  if (filledCount < visibleFields.length) return "partial"
  return "complete"
}

/** Compute overall completion percentage */
function computeCompletion(
  sections: SectionDef[],
  values: Record<string, any>
): number {
  let total = 0
  let filled = 0
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === "computed") continue
      if (!evaluateConditions(field.conditionals, values)) continue
      total++
      const v = values[field.id]
      if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        filled++
      }
    }
  }
  return total === 0 ? 100 : Math.round((filled / total) * 100)
}

/** Count all errors */
function countIssues(errors: Record<string, string[]>): { errorCount: number } {
  let errorCount = 0
  for (const msgs of Object.values(errors)) {
    errorCount += msgs.length
  }
  return { errorCount }
}

/** Get key computed summary values from known fields */
function getKeySummaryValues(
  sections: SectionDef[],
  values: Record<string, any>
): { label: string; value: string }[] {
  const results: { label: string; value: string }[] = []

  // Find all computed fields and display their values
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === "computed" && field.computeFormula) {
        const val = evaluateFormula(field.computeFormula, values)
        if (val !== 0) {
          results.push({ label: field.label, value: formatCurrencyDisplay(val) })
        }
      }
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FormWizardProps {
  schema: FormSchema
  instance: FormInstance
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormWizard({ schema, instance }: FormWizardProps) {
  const router = useRouter()
  const sections = schema.sections
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id || "")
  const [values, setValues] = useState<Record<string, any>>(instance.values || {})
  const [errors, setErrors] = useState<Record<string, string[]>>(instance.validationErrors || {})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(
    instance.updatedAt ? new Date(instance.updatedAt) : null
  )
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  // Junebug assistant state
  const [junebugOpen, setJunebugOpen] = useState(false)
  const [focusedFieldId, setFocusedFieldId] = useState<string | undefined>(undefined)

  // Auto-populate state
  const [autoPopLoading, setAutoPopLoading] = useState(false)
  const [autoPopResult, setAutoPopResult] = useState<AutoPopulationResult | null>(null)
  const [autoPopDialogOpen, setAutoPopDialogOpen] = useState(false)
  const [autoPopApplied, setAutoPopApplied] = useState<Record<string, AutoPopulatedField>>({})

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeSectionIndex = sections.findIndex((s) => s.id === activeSection)
  const currentSection = sections[activeSectionIndex]

  const completion = useMemo(() => computeCompletion(sections, values), [sections, values])
  const { errorCount } = useMemo(() => countIssues(errors), [errors])
  const summaryValues = useMemo(() => getKeySummaryValues(sections, values), [sections, values])

  // ---------------------------------------------------------------------------
  // Auto-save
  // ---------------------------------------------------------------------------

  const doSave = useCallback(async (newValues: Record<string, any>) => {
    setSaving(true)
    try {
      await fetch(`/api/forms/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: newValues,
          completionPercent: computeCompletion(sections, newValues),
        }),
      })
      setLastSaved(new Date())
    } catch {
      // Silent failure for auto-save
    } finally {
      setSaving(false)
    }
  }, [instance.id, sections])

  const handleFieldChange = useCallback(
    (fieldId: string, value: any) => {
      setValues((prev) => {
        const next = { ...prev, [fieldId]: value }
        setErrors((e) => {
          if (!e[fieldId]) return e
          const { [fieldId]: _, ...rest } = e
          return rest
        })
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => doSave(next), 500)
        return next
      })
    },
    [doSave]
  )

  const handleFieldBlur = useCallback(
    (field: FieldDef) => {
      const fieldErrors = validateField(field, values[field.id], values)
      setErrors((prev) => {
        if (fieldErrors.length === 0) {
          const { [field.id]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [field.id]: fieldErrors }
      })
    },
    [values]
  )

  const validateAll = useCallback(() => {
    const allErrors: Record<string, string[]> = {}
    for (const section of sections) {
      for (const field of section.fields) {
        const fieldErrors = validateField(field, values[field.id], values)
        if (fieldErrors.length > 0) allErrors[field.id] = fieldErrors
      }
    }
    setErrors(allErrors)
    return Object.keys(allErrors).length === 0
  }, [sections, values])

  const sectionErrorCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const section of sections) {
      let count = 0
      for (const field of section.fields) {
        if (errors[field.id]) count += errors[field.id].length
      }
      counts[section.id] = count
    }
    return counts
  }, [sections, errors])

  // ---------------------------------------------------------------------------
  // Ctrl+J keyboard shortcut for Junebug
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault()
        setJunebugOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // ---------------------------------------------------------------------------
  // Field help handler — opens Junebug with field context
  // ---------------------------------------------------------------------------

  const handleFieldHelp = useCallback((fieldId: string) => {
    setFocusedFieldId(fieldId)
    setJunebugOpen(true)
  }, [])

  // Find the focused field definition for passing context to Junebug
  const focusedFieldDef = useMemo(() => {
    if (!focusedFieldId) return undefined
    for (const section of sections) {
      const found = section.fields.find((f) => f.id === focusedFieldId)
      if (found) return found
    }
    return undefined
  }, [focusedFieldId, sections])

  // ---------------------------------------------------------------------------
  // Auto-populate handler
  // ---------------------------------------------------------------------------

  const handleAutoPopulate = useCallback(async () => {
    setAutoPopLoading(true)
    try {
      const res = await fetch(`/api/forms/${instance.id}/auto-populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) throw new Error("Auto-populate failed")
      const result: AutoPopulationResult = await res.json()
      setAutoPopResult(result)
      setAutoPopDialogOpen(true)
    } catch {
      // Silent failure
    } finally {
      setAutoPopLoading(false)
    }
  }, [instance.id])

  const applyAutoPopulated = useCallback(
    (fields: AutoPopulatedField[]) => {
      const newValues = { ...values }
      const applied: Record<string, AutoPopulatedField> = { ...autoPopApplied }
      for (const field of fields) {
        newValues[field.fieldId] = field.value
        applied[field.fieldId] = field
      }
      setValues(newValues)
      setAutoPopApplied(applied)
      setAutoPopDialogOpen(false)
      // Trigger save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => doSave(newValues), 500)
    },
    [values, autoPopApplied, doSave]
  )

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goToSection = (sectionId: string) => setActiveSection(sectionId)
  const goPrev = () => {
    if (activeSectionIndex > 0) setActiveSection(sections[activeSectionIndex - 1].id)
  }
  const goNext = () => {
    if (activeSectionIndex < sections.length - 1) setActiveSection(sections[activeSectionIndex + 1].id)
  }

  // ---------------------------------------------------------------------------
  // Section completion icons
  // ---------------------------------------------------------------------------

  const getSectionIcon = (state: SectionCompletionState) => {
    switch (state) {
      case "complete":
        return <Check className="h-4 w-4 text-c-success" />
      case "partial":
        return (
          <svg className="h-4 w-4 text-[var(--c-teal)]" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 1a7 7 0 010 14" fill="currentColor" />
          </svg>
        )
      case "error":
        return <AlertCircle className="h-4 w-4 text-c-danger" />
      default:
        return <Circle className="h-4 w-4 text-c-gray-200" />
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-80px)]">
      {/* ------------------------------------------------------------------ */}
      {/* LEFT PANEL — Section Navigator */}
      {/* ------------------------------------------------------------------ */}
      {leftOpen ? (
        <div className="w-60 shrink-0 border-r border-[var(--c-gray-100)] overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => router.push("/forms")}
                className="flex items-center gap-1 text-sm text-c-gray-300 hover:text-c-gray-700 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <button
                onClick={() => setLeftOpen(false)}
                className="text-c-gray-300 hover:text-c-gray-700 transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-xs font-medium text-c-gray-300 uppercase tracking-wider mb-1">
                Form {schema.formNumber}
              </p>
              <h2 className="text-sm font-medium text-c-gray-700 leading-snug">
                {schema.formTitle}
              </h2>
            </div>

            <div className="mb-4">
              <Progress value={completion} size="sm" showPercent />
            </div>

            <nav className="space-y-1">
              {sections.map((section) => {
                const state = getSectionState(section, values, errors)
                const isActive = section.id === activeSection
                const errCount = sectionErrorCounts[section.id] || 0
                return (
                  <button
                    key={section.id}
                    onClick={() => goToSection(section.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      isActive
                        ? "bg-c-info-soft text-c-gray-900"
                        : "text-c-gray-700 hover:bg-c-gray-50"
                    }`}
                  >
                    <span className="shrink-0">{getSectionIcon(state)}</span>
                    <span className="text-sm truncate flex-1">{section.title}</span>
                    {errCount > 0 && (
                      <Badge className="bg-c-danger text-white text-[10px] px-1.5 py-0 h-4 min-w-[18px] flex items-center justify-center">
                        {errCount}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      ) : (
        <div className="w-10 shrink-0 border-r border-[var(--c-gray-100)] flex flex-col items-center pt-4">
          <button
            onClick={() => setLeftOpen(true)}
            className="text-c-gray-300 hover:text-c-gray-700 transition-colors"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CENTER PANEL — Form Fields */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {currentSection && (
            <>
              {/* Section header */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-display-md mb-1">{currentSection.title}</h1>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoPopulate}
                    disabled={autoPopLoading}
                    className="text-xs shrink-0"
                  >
                    {autoPopLoading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FileSearch className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Auto-populate from documents
                  </Button>
                </div>
                {currentSection.description && (
                  <p className="text-sm text-c-gray-300">{currentSection.description}</p>
                )}
                {currentSection.irsInstructions && (
                  <div className="mt-3 rounded-lg border border-[var(--c-gray-100)] bg-c-gray-50 px-4 py-3">
                    <p className="text-xs text-c-gray-300 leading-relaxed">
                      <span className="font-medium text-c-gray-700">IRS Instructions: </span>
                      {currentSection.irsInstructions}
                    </p>
                  </div>
                )}
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                {currentSection.fields.map((field) => (
                  <div
                    key={field.id}
                    onBlur={() => handleFieldBlur(field)}
                  >
                    <FieldRenderer
                      field={field}
                      value={
                        field.type === "computed" && field.computeFormula
                          ? evaluateFormula(field.computeFormula, values)
                          : values[field.id]
                      }
                      onChange={(val) => handleFieldChange(field.id, val)}
                      error={errors[field.id]?.[0]}
                      allValues={values}
                      onFieldHelp={handleFieldHelp}
                      autoPopulated={
                        autoPopApplied[field.id]
                          ? {
                              confidence: autoPopApplied[field.id].confidence,
                              sourceName: autoPopApplied[field.id].source.documentName,
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>

              {/* Section navigation */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--c-gray-100)]">
                <Button
                  variant="outline"
                  onClick={goPrev}
                  disabled={activeSectionIndex === 0}
                  className="text-sm"
                >
                  <ChevronLeft className="h-4 w-4 mr-1.5" />
                  Previous Section
                </Button>

                {/* Save indicator */}
                <div className="flex items-center gap-2 text-xs text-c-gray-300">
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : lastSaved ? (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 text-c-success" />
                      All changes saved {timeAgo(lastSaved)}
                    </>
                  ) : null}
                </div>

                <Button
                  variant="outline"
                  onClick={goNext}
                  disabled={activeSectionIndex === sections.length - 1}
                  className="text-sm"
                >
                  Next Section
                  <ChevronRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Junebug FAB button */}
      {!junebugOpen && (
        <button
          onClick={() => setJunebugOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[var(--c-teal)] px-4 py-2.5 text-white shadow-lg hover:shadow-xl transition-shadow"
          title="Ask Junebug (Ctrl+J)"
        >
          <JunebugIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Ask Junebug</span>
        </button>
      )}

      {/* Auto-populate results dialog */}
      {autoPopDialogOpen && autoPopResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-c-gray-900">Auto-Populate Results</h3>
              <button onClick={() => setAutoPopDialogOpen(false)} className="text-c-gray-300 hover:text-c-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            {autoPopResult.totalFound === 0 ? (
              <div className="text-center py-6">
                <FileSearch className="h-8 w-8 mx-auto mb-3 text-c-gray-200" />
                <p className="text-sm text-c-gray-500">No matching data found in case documents.</p>
                <p className="text-xs text-c-gray-300 mt-1">Upload more source documents and try again.</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-c-gray-50 p-3 mb-4 space-y-1">
                  <p className="text-sm text-c-gray-700">
                    Found <span className="font-medium">{autoPopResult.totalFound}</span> fields from{" "}
                    <span className="font-medium">{autoPopResult.documentsUsed.length}</span> documents.
                  </p>
                  <p className="text-xs text-c-gray-300">
                    {autoPopResult.highConfidence} high confidence, {autoPopResult.needsReview} need review.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => applyAutoPopulated(autoPopResult.fields.filter((f) => f.confidence === "high"))}
                  >
                    Accept High Confidence ({autoPopResult.highConfidence})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => applyAutoPopulated(autoPopResult.fields)}
                  >
                    Accept All ({autoPopResult.totalFound})
                  </Button>
                </div>
              </>
            )}
            <button
              onClick={() => setAutoPopDialogOpen(false)}
              className="w-full mt-3 text-xs text-c-gray-300 hover:text-c-gray-500 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* RIGHT PANEL — Live Summary or Junebug */}
      {/* ------------------------------------------------------------------ */}
      {junebugOpen ? (
        /* Junebug panel replaces right summary when open */
        <JunebugFormAssistant
          formNumber={schema.formNumber}
          formTitle={schema.formTitle}
          activeSection={activeSection}
          activeSectionTitle={currentSection?.title || ""}
          activeField={focusedFieldId}
          activeFieldLabel={focusedFieldDef?.label}
          fieldIrsReference={focusedFieldDef?.irsReference}
          currentValues={values}
          caseId={instance.caseId}
          onClose={() => {
            setJunebugOpen(false)
            setFocusedFieldId(undefined)
          }}
        />
      ) : rightOpen ? (
        <div className="w-[340px] shrink-0 flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
          {/* Collapsible stats bar */}
          <div className="border-l border-[var(--c-gray-100)] bg-[var(--c-white)]">
            <div className="px-3 py-2 border-b border-[var(--c-gray-100)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-1.5 rounded-full bg-[var(--c-gray-100)]"
                    style={{ width: 48 }}
                  >
                    <div
                      className="h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${completion}%`,
                        background: completion === 100 ? "var(--c-success)" : "var(--c-teal)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-c-gray-300 font-medium">
                    {completion}%
                  </span>
                </div>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-c-danger">
                    <AlertCircle className="h-3 w-3" />
                    {errorCount}
                  </span>
                )}
                {summaryValues.length > 0 && (
                  <span className="text-[10px] text-c-gray-300 font-mono tabular-nums">
                    {summaryValues[summaryValues.length - 1]?.value}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => validateAll()}
                  title="Validate All"
                >
                  <CheckCircle className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => doSave(values)}
                  disabled={saving}
                  title={saving ? "Saving..." : "Save"}
                >
                  <Save className="h-3 w-3" />
                </Button>
                <button
                  onClick={() => setRightOpen(false)}
                  className="text-c-gray-300 hover:text-c-gray-700 transition-colors ml-1"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* PDF Preview fills remaining space */}
          <div className="flex-1 min-h-0">
            <PDFFormPreview
              formNumber={schema.formNumber}
              currentPage={activeSectionIndex + 1}
              zoom={100}
            />
          </div>
        </div>
      ) : (
        <div className="w-10 shrink-0 border-l border-[var(--c-gray-100)] flex flex-col items-center pt-4">
          <button
            onClick={() => setRightOpen(true)}
            className="text-c-gray-300 hover:text-c-gray-700 transition-colors"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
