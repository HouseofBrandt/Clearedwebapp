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
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  FileSearch,
  Sparkles,
  X,
} from "lucide-react"
import type {
  FormSchema,
  FormInstance,
  SectionDef,
  FieldDef,
  FieldMeta,
  ValidationRule,
  ConditionalRule,
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
import { useToast } from "@/components/ui/toast"
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

/** Check if a section should be visible based on its conditionals */
function isSectionVisible(section: SectionDef, values: Record<string, any>): boolean {
  if (!section.conditionals || section.conditionals.length === 0) return true
  return evaluateConditions(section.conditionals, values)
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
  /**
   * True when the logged-in user has filled out CAF + (PTIN or license) +
   * full firm address. When false and the form has a representative slot,
   * the wizard nudges them to fill Settings → Profile.
   */
  practitionerProfileComplete?: boolean
}

// Forms whose schemas have a "representative" / preparer slot that auto-populate
// fills from the user's practitioner profile. If the profile is incomplete, the
// wizard surfaces a one-click banner pointing to Settings → Profile.
const FORMS_WITH_REP_SLOT = new Set(["2848", "12153", "911"])

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormWizard({ schema, instance, practitionerProfileComplete = true }: FormWizardProps) {
  const router = useRouter()
  const allSections = schema.sections
  const [activeSection, setActiveSection] = useState<string>(allSections[0]?.id || "")
  const [values, setValues] = useState<Record<string, any>>(instance.values || {})
  // Per-field metadata — provenance and review state. Loaded from the
  // server-persisted instance.valuesMeta so badges survive a reload.
  const [valuesMeta, setValuesMeta] = useState<Record<string, FieldMeta>>(instance.valuesMeta || {})
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
  const [autoPopError, setAutoPopError] = useState<string | null>(null)
  const [autoPopEngineNote, setAutoPopEngineNote] = useState<string | null>(null)

  // Review queue panel state
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false)

  // PDF generation state
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Practitioner-profile nudge: dismissable per session.
  const showProfileNudge =
    !practitionerProfileComplete &&
    FORMS_WITH_REP_SLOT.has(schema.formNumber)
  const [profileNudgeDismissed, setProfileNudgeDismissed] = useState(false)

  const { addToast } = useToast()

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filter sections based on section-level conditionals
  const sections = useMemo(
    () => allSections.filter((s) => isSectionVisible(s, values)),
    [allSections, values]
  )

  const activeSectionIndex = sections.findIndex((s) => s.id === activeSection)
  const currentSection = sections[activeSectionIndex]

  const completion = useMemo(() => computeCompletion(sections, values), [sections, values])
  const { errorCount } = useMemo(() => countIssues(errors), [errors])
  const summaryValues = useMemo(() => getKeySummaryValues(sections, values), [sections, values])

  // If the active section becomes hidden due to conditionals, switch to first visible
  useEffect(() => {
    if (sections.length > 0 && !sections.find((s) => s.id === activeSection)) {
      setActiveSection(sections[0].id)
    }
  }, [sections, activeSection])

  // ---------------------------------------------------------------------------
  // Auto-save
  // ---------------------------------------------------------------------------

  const doSave = useCallback(async (newValues: Record<string, any>, newMeta?: Record<string, FieldMeta>) => {
    setSaving(true)
    try {
      await fetch(`/api/forms/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: newValues,
          ...(newMeta ? { valuesMeta: newMeta } : {}),
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

        // If the field had auto-fill metadata and the user has now changed
        // the value, mark it as manually edited (clears reviewed). This is
        // how the wizard surfaces "you edited an AI-suggested value — make
        // sure it's still right."
        let metaPatch: Record<string, FieldMeta> | undefined
        setValuesMeta((prevMeta) => {
          const existing = prevMeta[fieldId]
          if (!existing) return prevMeta
          // Only flip flags if the value actually changed.
          if (JSON.stringify(prev[fieldId]) === JSON.stringify(value)) return prevMeta
          const updated: FieldMeta = {
            ...existing,
            manuallyEdited: true,
            reviewed: false,
            reviewedAt: undefined,
            reviewedBy: undefined,
          }
          metaPatch = { [fieldId]: updated }
          return { ...prevMeta, [fieldId]: updated }
        })

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => doSave(next, metaPatch), 500)
        return next
      })
    },
    [doSave]
  )

  // ---------------------------------------------------------------------------
  // Review actions — per-field "Mark reviewed"
  // ---------------------------------------------------------------------------

  const handleMarkReviewed = useCallback(
    (fieldId: string) => {
      setValuesMeta((prev) => {
        const existing = prev[fieldId] || {}
        const now = new Date().toISOString()
        const updated: FieldMeta = {
          ...existing,
          reviewed: true,
          reviewedAt: now,
          manuallyEdited: false,
        }
        const nextMeta = { ...prev, [fieldId]: updated }
        // Persist the single-field change without delaying via the autosave
        // timer — the click is the explicit save signal.
        doSave(values, { [fieldId]: updated })
        return nextMeta
      })
    },
    [values, doSave]
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
  // Review Queue — fields the practitioner should look at before exporting.
  //
  // Three buckets:
  //   1. missing   — required, visible, currently empty
  //   2. verify    — auto-filled, not yet marked reviewed
  //   3. re-verify — was auto-filled, then user edited the value
  //
  // The user-facing copy collapses (2) and (3) into "needs your eyes" since
  // the action ("look at it, click Mark reviewed") is the same.
  // ---------------------------------------------------------------------------

  type ReviewItem = {
    fieldId: string
    fieldLabel: string
    sectionId: string
    sectionTitle: string
    reason: "missing" | "verify" | "reverify"
    confidence?: FieldMeta["confidence"]
    sourceName?: string
    currentValue?: any
  }

  const reviewItems = useMemo<ReviewItem[]>(() => {
    const items: ReviewItem[] = []
    for (const section of sections) {
      for (const field of section.fields) {
        if (field.type === "computed") continue
        if (!evaluateConditions(field.conditionals, values)) continue
        const value = values[field.id]
        const meta = valuesMeta[field.id]
        const isEmpty =
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)

        if (field.required && isEmpty) {
          items.push({
            fieldId: field.id,
            fieldLabel: field.label,
            sectionId: section.id,
            sectionTitle: section.title,
            reason: "missing",
          })
          continue
        }
        if (meta?.manuallyEdited) {
          items.push({
            fieldId: field.id,
            fieldLabel: field.label,
            sectionId: section.id,
            sectionTitle: section.title,
            reason: "reverify",
            confidence: meta.confidence,
            sourceName: meta.extractedFrom?.[0]?.documentName || meta.source,
            currentValue: value,
          })
          continue
        }
        if (meta?.autoFilled && !meta.reviewed) {
          items.push({
            fieldId: field.id,
            fieldLabel: field.label,
            sectionId: section.id,
            sectionTitle: section.title,
            reason: "verify",
            confidence: meta.confidence,
            sourceName: meta.extractedFrom?.[0]?.documentName || meta.source,
            currentValue: value,
          })
        }
      }
    }
    return items
  }, [sections, values, valuesMeta])

  const reviewCounts = useMemo(() => {
    let missing = 0
    let verify = 0
    for (const it of reviewItems) {
      if (it.reason === "missing") missing++
      else verify++
    }
    return { missing, verify, total: reviewItems.length }
  }, [reviewItems])

  const handleJumpToField = useCallback(
    (item: ReviewItem) => {
      setActiveSection(item.sectionId)
      setReviewPanelOpen(false)
      // Defer the focus call until after the active section re-renders.
      setTimeout(() => {
        const el = document.getElementById(item.fieldId)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          ;(el as HTMLInputElement).focus?.()
        }
      }, 100)
    },
    []
  )

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
    setAutoPopError(null)
    setAutoPopEngineNote(null)
    try {
      const res = await fetch(`/api/forms/${instance.id}/auto-populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Auto-populate failed (${res.status})`)
      }
      const result: AutoPopulationResult & { engine?: string; engineNote?: string } = await res.json()
      setAutoPopResult(result)
      if (result.engineNote) setAutoPopEngineNote(result.engineNote)
      setAutoPopDialogOpen(true)
    } catch (err: any) {
      setAutoPopError(err?.message || "Auto-populate failed")
    } finally {
      setAutoPopLoading(false)
    }
  }, [instance.id])

  const applyAutoPopulated = useCallback(
    (fields: AutoPopulatedField[]) => {
      const newValues = { ...values }
      const newMeta = { ...valuesMeta }
      for (const field of fields) {
        newValues[field.fieldId] = field.value
        // Build a FieldMeta entry from the auto-populate payload. The shape
        // is normalised across V2 (source: object) and V3 (source: string +
        // extractedFrom: array) so the UI sees a single representation.
        const v2Source = (field as any).source
        const v3ExtractedFrom = (field as any).extractedFrom
        const sourceLabel: string =
          typeof v2Source === "string"
            ? v2Source
            : v2Source?.documentName
            ? `${v2Source.documentType || "Document"}: ${v2Source.documentName}`
            : (field as any).extractedFrom && typeof (field as any).extractedFrom === "string"
            ? (field as any).extractedFrom
            : "Auto-populate"
        const citations: FieldMeta["extractedFrom"] = Array.isArray(v3ExtractedFrom)
          ? v3ExtractedFrom
          : v2Source?.documentId
          ? [{ documentId: v2Source.documentId, documentName: v2Source.documentName }]
          : []
        newMeta[field.fieldId] = {
          confidence: field.confidence,
          source: sourceLabel,
          extractedFrom: citations,
          reasoning: (field as any).reasoning,
          autoFilled: true,
          reviewed: false,
          manuallyEdited: false,
        }
      }
      setValues(newValues)
      setValuesMeta(newMeta)
      setAutoPopDialogOpen(false)
      // Trigger save with both halves
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => doSave(newValues, newMeta), 500)
    },
    [values, valuesMeta, doSave]
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
          {/* Practitioner-profile nudge — shown once per session for forms with a rep slot. */}
          {showProfileNudge && !profileNudgeDismissed && (
            <div
              className="mb-5 rounded-xl border px-4 py-3 flex items-start gap-3"
              style={{
                background: "var(--c-info-soft)",
                borderColor: "rgba(20, 184, 166, 0.2)",
              }}
            >
              <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-[var(--c-teal)]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-c-gray-900">
                  Fill your practitioner profile once and skip it forever
                </p>
                <p className="text-xs text-c-gray-500 mt-0.5">
                  CAF, PTIN, jurisdiction, and firm address auto-fill the representative section
                  on this form (and every other form with a rep slot). One-time setup in Settings.
                </p>
                <a
                  href="/settings"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--c-teal)] hover:text-c-success mt-1.5 transition-colors"
                >
                  Open Settings → Profile
                  <ChevronRight className="h-3 w-3" />
                </a>
              </div>
              <button
                onClick={() => setProfileNudgeDismissed(true)}
                className="text-c-gray-300 hover:text-c-gray-700 transition-colors shrink-0"
                aria-label="Dismiss"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {currentSection && (
            <>
              {/* Section header */}
              <div className="mb-6">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="text-display-md mb-1">{currentSection.title}</h1>
                  <div className="flex items-center gap-2 shrink-0">
                    {reviewCounts.total > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewPanelOpen(true)}
                        className="text-xs"
                        title="Fields that need your attention before export"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-[var(--c-teal)]" />
                        Review queue
                        <span
                          className="ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                          style={{
                            background: reviewCounts.missing > 0 ? "var(--c-warning-soft, #FFF9EB)" : "var(--c-info-soft)",
                            color: reviewCounts.missing > 0 ? "var(--c-warning, #92400e)" : "var(--c-teal)",
                            minWidth: "1.25rem",
                          }}
                        >
                          {reviewCounts.total}
                        </span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoPopulate}
                      disabled={autoPopLoading}
                      className="text-xs"
                    >
                      {autoPopLoading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <FileSearch className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {autoPopLoading ? "Searching documents\u2026" : "Auto-populate from documents"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        // Flush any pending autosave so the PDF reflects the latest values.
                        if (saveTimerRef.current) {
                          clearTimeout(saveTimerRef.current)
                          saveTimerRef.current = null
                        }
                        await doSave(values, valuesMeta)
                        setGeneratingPdf(true)
                        try {
                          const res = await fetch(`/api/forms/${instance.id}/preview-pdf?download=1`)
                          if (!res.ok) {
                            const body = await res.json().catch(() => ({}))
                            addToast({
                              title: "PDF generation failed",
                              description: body?.error || `Server returned ${res.status}`,
                              variant: "destructive",
                            })
                            return
                          }
                          // Read fill stats off the response headers \u2014 surfaced by the
                          // V2 renderer in src/lib/forms/pdf-renderer/index.ts.
                          const filledHdr = res.headers.get("X-Forms-V2-Filled")
                          const skippedHdr = res.headers.get("X-Forms-V2-Skipped")
                          const failedHdr = res.headers.get("X-Forms-V2-Failed")
                          const filled = filledHdr !== null ? Number(filledHdr) : null
                          const skipped = skippedHdr !== null ? Number(skippedHdr) : null
                          const failed = failedHdr !== null ? Number(failedHdr) : null

                          // Pull the filename out of Content-Disposition; fall back gracefully.
                          const disposition = res.headers.get("Content-Disposition") || ""
                          const filename = /filename="?([^"]+)"?/i.exec(disposition)?.[1]
                            || `Form-${schema.formNumber}.pdf`

                          const blob = await res.blob()
                          const blobUrl = URL.createObjectURL(blob)
                          const link = document.createElement("a")
                          link.href = blobUrl
                          link.download = filename
                          document.body.appendChild(link)
                          link.click()
                          document.body.removeChild(link)
                          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

                          // Show stats. The toast tells the practitioner exactly which
                          // proportion of binding entries had values; if many are blank,
                          // they know to fill more in the wizard or run auto-populate.
                          if (filled === null) {
                            addToast({ title: "PDF downloaded" })
                          } else if (failed && failed > 0) {
                            addToast({
                              title: "PDF generated with errors",
                              description: `${filled} filled \u00b7 ${skipped ?? 0} blank \u00b7 ${failed} failed at fill. Server logs have the field IDs.`,
                              variant: "destructive",
                            })
                          } else if (skipped && skipped > 0) {
                            addToast({
                              title: `PDF generated \u00b7 ${filled} fields filled`,
                              description: `${skipped} fields are blank on the PDF. Click "Review queue" to see what's missing or unverified.`,
                            })
                          } else {
                            addToast({
                              title: `PDF generated \u00b7 ${filled} fields filled`,
                              description: "Every bound field on the form had a value.",
                            })
                          }
                        } catch (err: any) {
                          addToast({
                            title: "PDF generation failed",
                            description: err?.message || "Network error",
                            variant: "destructive",
                          })
                        } finally {
                          setGeneratingPdf(false)
                        }
                      }}
                      disabled={generatingPdf}
                      className="text-xs"
                      title="Save and download the filled PDF"
                    >
                      {generatingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {generatingPdf ? "Generating\u2026" : "Generate PDF"}
                    </Button>
                  </div>
                </div>
                {autoPopError && (
                  <div className="mt-2 rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--c-danger-soft, #FEF2F2)", color: "var(--c-danger, #b91c1c)", border: "1px solid rgba(239,68,68,0.15)" }}>
                    <strong>Auto-populate failed: </strong>{autoPopError}
                  </div>
                )}
                {autoPopEngineNote && !autoPopError && (
                  <div className="mt-2 rounded-md px-3 py-2 text-[11.5px]" style={{ background: "var(--c-warning-soft, #FFF9EB)", color: "var(--c-warning, #92400e)", border: "1px solid rgba(217,119,6,0.15)" }}>
                    {autoPopEngineNote}
                  </div>
                )}
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
                {currentSection.fields.map((field) => {
                  const isFullWidth = field.type === "textarea" || field.type === "repeating_group" || field.type === "file_upload" || field.type === "computed"
                  return (
                  <div
                    key={field.id}
                    className={isFullWidth ? "col-span-2" : undefined}
                    onBlur={(e) => {
                      // Only validate on blur from actual input/textarea/select elements,
                      // not from button clicks within the field (which would eat the click).
                      // Use setTimeout to defer validation so pending onClick events fire first.
                      const target = e.target as HTMLElement
                      const relatedTarget = e.relatedTarget as HTMLElement | null
                      const isInputBlur = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"
                      // Check if the user is clicking a button, checkbox, or any interactive element.
                      // relatedTarget can be null in some browsers (e.g., Safari), so also check
                      // if the blur is going to something within the same field container.
                      const isClickingInteractive =
                        relatedTarget?.tagName === "BUTTON" ||
                        relatedTarget?.closest("button") !== null ||
                        relatedTarget?.role === "checkbox" ||
                        relatedTarget?.closest("[role=checkbox]") !== null ||
                        relatedTarget?.closest("[role=combobox]") !== null ||
                        relatedTarget?.closest("[role=listbox]") !== null
                      if (isInputBlur && !isClickingInteractive) {
                        // Defer validation with enough time for click handlers to fire
                        setTimeout(() => handleFieldBlur(field), 50)
                      }
                    }}
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
                      meta={valuesMeta[field.id]}
                      onMarkReviewed={
                        valuesMeta[field.id]?.autoFilled || valuesMeta[field.id]?.manuallyEdited
                          ? () => handleMarkReviewed(field.id)
                          : undefined
                      }
                    />
                  </div>
                  )
                })}
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

      {/* Junebug FAB button — positioned above the PDF panel footer */}
      {!junebugOpen && (
        <button
          onClick={() => setJunebugOpen(true)}
          className="fixed bottom-28 right-[396px] z-30 flex items-center gap-2 rounded-full bg-[var(--c-teal)] px-3 py-2 text-white shadow-md hover:shadow-lg transition-shadow text-xs pointer-events-auto"
          title="Ask Junebug (Ctrl+J)"
        >
          <JunebugIcon className="h-4 w-4" />
          <span className="font-medium">Ask Junebug</span>
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Review Queue dialog                                                 */}
      {/* ------------------------------------------------------------------ */}
      {reviewPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--c-gray-100)]">
              <div>
                <h3 className="text-base font-semibold text-c-gray-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--c-teal)]" />
                  Review queue
                </h3>
                <p className="text-xs text-c-gray-300 mt-0.5">
                  Fields that need your eyes before you export {schema.formNumber}.
                </p>
              </div>
              <button
                onClick={() => setReviewPanelOpen(false)}
                className="text-c-gray-300 hover:text-c-gray-700 transition-colors shrink-0"
                aria-label="Close review queue"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Counts strip */}
            <div className="flex items-center gap-4 px-5 py-3 bg-c-gray-50 text-xs border-b border-[var(--c-gray-100)]">
              <span className="flex items-center gap-1.5 text-c-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="font-medium tabular-nums">{reviewCounts.missing}</span>
                <span className="text-c-gray-500">missing</span>
              </span>
              <span className="flex items-center gap-1.5 text-[var(--c-teal)]">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="font-medium tabular-nums">{reviewCounts.verify}</span>
                <span className="text-c-gray-500">to verify</span>
              </span>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto">
              {reviewItems.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-c-success" />
                  <p className="text-sm text-c-gray-700 font-medium">All clear</p>
                  <p className="text-xs text-c-gray-300 mt-1">Every required field is filled and every auto-populated value has been reviewed.</p>
                </div>
              ) : (
                (() => {
                  // Group by section, in section order, preserving the order they appeared.
                  const grouped: Array<{ sectionId: string; sectionTitle: string; items: ReviewItem[] }> = []
                  for (const item of reviewItems) {
                    let bucket = grouped.find((g) => g.sectionId === item.sectionId)
                    if (!bucket) {
                      bucket = { sectionId: item.sectionId, sectionTitle: item.sectionTitle, items: [] }
                      grouped.push(bucket)
                    }
                    bucket.items.push(item)
                  }
                  return (
                    <div className="divide-y divide-[var(--c-gray-100)]">
                      {grouped.map((g) => (
                        <div key={g.sectionId}>
                          <div className="px-5 py-2.5 bg-c-gray-50/50 sticky top-0 z-10">
                            <p className="text-[11px] font-medium text-c-gray-300 uppercase tracking-wider">
                              {g.sectionTitle}
                            </p>
                          </div>
                          {g.items.map((item) => {
                            const reasonStyle =
                              item.reason === "missing"
                                ? { bg: "var(--c-warning-soft, #FFF9EB)", fg: "var(--c-warning, #92400e)", label: "Missing" }
                                : item.reason === "reverify"
                                ? { bg: "var(--c-warning-soft, #FFF9EB)", fg: "var(--c-warning, #92400e)", label: "Edited — re-verify" }
                                : { bg: "var(--c-info-soft)", fg: "var(--c-teal)", label: "Verify" }
                            const valuePreview =
                              item.currentValue === undefined || item.currentValue === null
                                ? null
                                : Array.isArray(item.currentValue)
                                ? `${item.currentValue.length} item${item.currentValue.length === 1 ? "" : "s"}`
                                : typeof item.currentValue === "object"
                                ? JSON.stringify(item.currentValue).slice(0, 80)
                                : String(item.currentValue).slice(0, 80)
                            return (
                              <div key={`${item.sectionId}-${item.fieldId}`} className="px-5 py-3 flex items-start gap-3 hover:bg-c-gray-50/40">
                                <span
                                  className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider mt-0.5"
                                  style={{ background: reasonStyle.bg, color: reasonStyle.fg }}
                                >
                                  {reasonStyle.label}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-c-gray-900 leading-tight">{item.fieldLabel}</p>
                                  {valuePreview && (
                                    <p className="text-xs text-c-gray-500 mt-0.5 font-mono truncate">{valuePreview}</p>
                                  )}
                                  {item.sourceName && (
                                    <p className="text-[11px] text-c-gray-300 mt-0.5">
                                      From <span className="font-medium">{item.sourceName}</span>
                                      {item.confidence ? ` · ${item.confidence} confidence` : ""}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {(item.reason === "verify" || item.reason === "reverify") && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleMarkReviewed(item.fieldId)}
                                      className="text-[11px] h-7 px-2"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Confirm
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleJumpToField(item)}
                                    className="text-[11px] h-7 px-2 text-c-gray-500 hover:text-c-gray-900"
                                  >
                                    Open
                                    <ChevronRight className="h-3 w-3 ml-0.5" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )
                })()
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--c-gray-100)] p-4 flex items-center justify-end gap-2">
              <p className="text-[11px] text-c-gray-300 mr-auto">
                {reviewItems.length === 0 ? "Ready to export." : "Address each item, then export."}
              </p>
              <Button variant="outline" size="sm" onClick={() => setReviewPanelOpen(false)} className="text-xs">
                Done
              </Button>
            </div>
          </div>
        </div>
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
        <div className="w-[380px] shrink-0 flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
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
              instanceId={instance.id}
              values={values}
              currentPage={activeSectionIndex + 1}
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
