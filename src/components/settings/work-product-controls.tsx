"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  FileText,
  Scale,
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  Trash2,
  Eye,
  RotateCcw,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkProductType {
  taskType: string
  label: string
  description: string
  category: string
  icon: string
  surfaces: string[]
  typicalLength: string
  tunableDimensions: string[]
  hasOverride: boolean
  exampleCount: number
}

interface WorkProductDetail {
  taskType: string
  label: string
  description: string
  category: string
  icon: string
  surfaces: string[]
  typicalLength: string
  tunableDimensions: string[]
  enabled: boolean
  systemPrompt: string
  overrides: Record<string, string>
  examples: WorkProductExample[]
}

interface WorkProductExample {
  id: string
  label: string
  content: string
  type: "good" | "anti"
  notes: string
}

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  Scale,
  Shield,
  Search,
  Sparkles,
}

function resolveIcon(name: string) {
  return ICON_MAP[name] || FileText
}

// ---------------------------------------------------------------------------
// Dimension metadata
// ---------------------------------------------------------------------------

const DIMENSION_META: Record<string, { label: string; placeholder: string }> = {
  toneDirective: {
    label: "Tone Directive",
    placeholder: "e.g. Professional but approachable, avoid legalese where possible...",
  },
  structureDirective: {
    label: "Structure Directive",
    placeholder: "e.g. Use numbered sections with clear headers. Include a summary at top...",
  },
  lengthDirective: {
    label: "Length Directive",
    placeholder: "e.g. Keep to 2-3 pages. Be concise but thorough on key points...",
  },
  emphasisAreas: {
    label: "Emphasis Areas",
    placeholder: "e.g. Reasonable collection potential calculation, asset valuation methodology...",
  },
  avoidances: {
    label: "Avoidances",
    placeholder: "e.g. Do not include client SSN in the narrative. Avoid speculative language...",
  },
  customInstructions: {
    label: "Custom Instructions",
    placeholder: "Any additional instructions for the AI when generating this work product...",
  },
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkProductControls() {
  const [registry, setRegistry] = useState<WorkProductType[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [detail, setDetail] = useState<WorkProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state for overrides
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [enabled, setEnabled] = useState(true)

  // Example form state
  const [showAddExample, setShowAddExample] = useState(false)
  const [newExample, setNewExample] = useState({ label: "", content: "", type: "good" as "good" | "anti", notes: "" })

  // Preview modal
  const [previewText, setPreviewText] = useState<string | null>(null)

  // ------- Fetch registry -------
  useEffect(() => {
    fetch("/api/work-product")
      .then((r) => r.json())
      .then((data) => {
        // API returns { categories: { case_analysis: [...], ... }, stats: {...} }
        // Flatten categories into a single array
        if (data.categories) {
          const flat = Object.values(data.categories).flat() as WorkProductType[]
          setRegistry(flat)
        } else if (data.types) {
          setRegistry(data.types)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // ------- Fetch detail -------
  useEffect(() => {
    if (!selectedType) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    fetch(`/api/work-product/${selectedType}`)
      .then((r) => r.json())
      .then((data) => {
        setDetail(data)
        setOverrides(data.overrides || {})
        setEnabled(data.enabled !== false)
        setDetailLoading(false)
      })
      .catch(() => setDetailLoading(false))
  }, [selectedType])

  // ------- Computed stats -------
  const totalTypes = registry.length
  const customizedCount = registry.filter((t) => t.hasOverride).length
  const totalExamples = registry.reduce((sum, t) => sum + (t.exampleCount || 0), 0)

  // ------- Group by category -------
  const grouped = registry.reduce<Record<string, WorkProductType[]>>((acc, t) => {
    const cat = t.category || "Other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(t)
    return acc
  }, {})

  // ------- Handlers -------
  async function handleSave() {
    if (!selectedType) return
    setSaving(true)
    try {
      await fetch(`/api/work-product/${selectedType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides, enabled }),
      })
      // Refresh registry
      const res = await fetch("/api/work-product")
      const data = await res.json()
      setRegistry(data.categories ? (Object.values(data.categories).flat() as WorkProductType[]) : (data.types || []))
      // Refresh detail
      const detRes = await fetch(`/api/work-product/${selectedType}`)
      const detData = await detRes.json()
      setDetail(detData)
      setOverrides(detData.overrides || {})
    } catch {
      // silent
    }
    setSaving(false)
  }

  async function handleReset() {
    if (!selectedType) return
    setSaving(true)
    try {
      await fetch(`/api/work-product/${selectedType}`, { method: "DELETE" })
      const detRes = await fetch(`/api/work-product/${selectedType}`)
      const detData = await detRes.json()
      setDetail(detData)
      setOverrides(detData.overrides || {})
      setEnabled(detData.enabled !== false)
      const res = await fetch("/api/work-product")
      const data = await res.json()
      setRegistry(data.categories ? (Object.values(data.categories).flat() as WorkProductType[]) : (data.types || []))
    } catch {
      // silent
    }
    setSaving(false)
  }

  async function handlePreview() {
    if (!selectedType) return
    try {
      const res = await fetch(`/api/work-product/${selectedType}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides, enabled }),
      })
      const data = await res.json()
      setPreviewText(data.renderedPrompt || "No preview available.")
    } catch {
      setPreviewText("Failed to generate preview.")
    }
  }

  async function handleAddExample() {
    if (!selectedType || !newExample.label || !newExample.content) return
    try {
      await fetch(`/api/work-product/${selectedType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addExample: newExample }),
      })
      const detRes = await fetch(`/api/work-product/${selectedType}`)
      const detData = await detRes.json()
      setDetail(detData)
      setNewExample({ label: "", content: "", type: "good", notes: "" })
      setShowAddExample(false)
    } catch {
      // silent
    }
  }

  async function handleDeleteExample(exampleId: string) {
    if (!selectedType) return
    try {
      await fetch(`/api/work-product/${selectedType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeExampleId: exampleId }),
      })
      const detRes = await fetch(`/api/work-product/${selectedType}`)
      const detData = await detRes.json()
      setDetail(detData)
    } catch {
      // silent
    }
  }

  // =====================================================================
  // DETAIL VIEW
  // =====================================================================
  if (selectedType) {
    return (
      <div className="space-y-6">
        {/* Back / breadcrumb */}
        <button
          onClick={() => setSelectedType(null)}
          className="flex items-center gap-1.5 text-[13px] text-c-gray-500 hover:text-c-gray-800 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Work Product Types
        </button>

        {detailLoading ? (
          <Card className="p-10 text-center text-[13px] text-c-gray-400">Loading...</Card>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = resolveIcon(detail.icon)
                  return <Icon className="h-6 w-6 text-c-teal" />
                })()}
                <div>
                  <h1 className="text-display-md">{detail.label}</h1>
                  <p className="text-[13px] text-c-gray-500 mt-0.5">{detail.description}</p>
                </div>
              </div>

              {/* Enable/Disable toggle */}
              <button
                onClick={() => setEnabled((v) => !v)}
                className="flex items-center gap-2 text-[13px] transition-colors"
              >
                {enabled ? (
                  <>
                    <ToggleRight className="h-5 w-5 text-c-teal" />
                    <span className="text-c-teal font-medium">Enabled</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-5 w-5 text-c-gray-400" />
                    <span className="text-c-gray-400 font-medium">Disabled</span>
                  </>
                )}
              </button>
            </div>

            {/* System Prompt (collapsible) */}
            <SystemPromptSection prompt={detail.systemPrompt} />

            {/* Tunable dimensions form */}
            {detail.tunableDimensions.length > 0 && (
              <Card className="p-6">
                <h2 className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500 font-medium mb-4">
                  Customization
                </h2>
                <div className="space-y-4">
                  {detail.tunableDimensions.map((dim) => {
                    const meta = DIMENSION_META[dim]
                    if (!meta) return null
                    return (
                      <div key={dim}>
                        <label className="block text-[13px] font-medium text-c-gray-700 mb-1.5">
                          {meta.label}
                        </label>
                        <textarea
                          value={overrides[dim] || ""}
                          onChange={(e) => setOverrides((o) => ({ ...o, [dim]: e.target.value }))}
                          placeholder={meta.placeholder}
                          rows={3}
                          className="w-full rounded-lg border border-c-gray-200 bg-white px-3 py-2 text-[13px] text-c-gray-800 placeholder:text-c-gray-400 focus:border-c-teal/30 focus:outline-none focus:ring-2 focus:ring-c-teal/10 transition-colors resize-y"
                        />
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-3">
              <Button onClick={handlePreview} variant="outline" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Preview Injection
              </Button>
              <Button onClick={handleReset} variant="outline" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>

            {/* Preview modal */}
            {previewText !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b border-c-gray-100">
                    <h3 className="text-[13px] font-medium">Rendered Prompt Preview</h3>
                    <button onClick={() => setPreviewText(null)} className="text-c-gray-400 hover:text-c-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1">
                    <pre className="text-[12px] text-c-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                      {previewText}
                    </pre>
                  </div>
                </Card>
              </div>
            )}

            {/* Model Examples */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500 font-medium">
                  Model Examples
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddExample(true)}
                  className="gap-1.5 text-[12px]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Example
                </Button>
              </div>

              {/* Existing examples */}
              {detail.examples.length === 0 && !showAddExample && (
                <p className="text-[13px] text-c-gray-400 py-4 text-center">
                  No model examples yet. Add one to guide AI output quality.
                </p>
              )}

              <div className="space-y-3">
                {detail.examples.map((ex) => (
                  <div key={ex.id} className="flex items-start gap-3 p-3 rounded-lg bg-c-gray-50">
                    <Badge variant={ex.type === "good" ? "success" : "danger"} className="mt-0.5 shrink-0">
                      {ex.type === "good" ? "Good" : "Anti"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-c-gray-800">{ex.label}</p>
                      <p className="text-[12px] text-c-gray-500 mt-0.5 line-clamp-2">
                        {ex.content.slice(0, 200)}
                        {ex.content.length > 200 && "..."}
                      </p>
                      {ex.notes && (
                        <p className="text-[11px] text-c-gray-400 mt-1 italic">{ex.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteExample(ex.id)}
                      className="text-c-gray-400 hover:text-c-danger transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add example form */}
              {showAddExample && (
                <div className="mt-4 p-4 rounded-lg border border-c-gray-200 space-y-3">
                  <div>
                    <label className="block text-[13px] font-medium text-c-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={newExample.label}
                      onChange={(e) => setNewExample((v) => ({ ...v, label: e.target.value }))}
                      placeholder="Brief name for this example"
                      className="w-full rounded-lg border border-c-gray-200 bg-white px-3 py-2 text-[13px] text-c-gray-800 placeholder:text-c-gray-400 focus:border-c-teal/30 focus:outline-none focus:ring-2 focus:ring-c-teal/10 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-c-gray-700 mb-1">Content</label>
                    <textarea
                      value={newExample.content}
                      onChange={(e) => setNewExample((v) => ({ ...v, content: e.target.value }))}
                      placeholder="Paste a representative example of this work product..."
                      rows={5}
                      className="w-full rounded-lg border border-c-gray-200 bg-white px-3 py-2 text-[13px] text-c-gray-800 placeholder:text-c-gray-400 focus:border-c-teal/30 focus:outline-none focus:ring-2 focus:ring-c-teal/10 transition-colors resize-y"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="block text-[13px] font-medium text-c-gray-700">Type</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setNewExample((v) => ({ ...v, type: "good" }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                          newExample.type === "good"
                            ? "bg-c-success-soft text-c-success"
                            : "bg-c-gray-50 text-c-gray-500 hover:bg-c-gray-100"
                        }`}
                      >
                        <Check className="h-3 w-3" />
                        Good
                      </button>
                      <button
                        onClick={() => setNewExample((v) => ({ ...v, type: "anti" }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                          newExample.type === "anti"
                            ? "bg-c-danger-soft text-c-danger"
                            : "bg-c-gray-50 text-c-gray-500 hover:bg-c-gray-100"
                        }`}
                      >
                        <X className="h-3 w-3" />
                        Anti
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-c-gray-700 mb-1">Notes</label>
                    <textarea
                      value={newExample.notes}
                      onChange={(e) => setNewExample((v) => ({ ...v, notes: e.target.value }))}
                      placeholder="Why is this a good or bad example? What should the AI learn from it?"
                      rows={2}
                      className="w-full rounded-lg border border-c-gray-200 bg-white px-3 py-2 text-[13px] text-c-gray-800 placeholder:text-c-gray-400 focus:border-c-teal/30 focus:outline-none focus:ring-2 focus:ring-c-teal/10 transition-colors resize-y"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={handleAddExample} size="sm" className="gap-1.5 text-[12px]">
                      <Plus className="h-3.5 w-3.5" />
                      Add Example
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddExample(false)
                        setNewExample({ label: "", content: "", type: "good", notes: "" })
                      }}
                      className="text-[12px]"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="p-10 text-center text-[13px] text-c-gray-400">
            Could not load work product details.
          </Card>
        )}
      </div>
    )
  }

  // =====================================================================
  // DASHBOARD VIEW
  // =====================================================================
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-md">Work Product Controls</h1>
        <p className="text-sm text-muted-foreground">
          Control how the AI writes each type of deliverable
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500 font-medium">
            Total Types
          </div>
          <div className="text-2xl font-semibold text-c-gray-800 mt-1">{totalTypes}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500 font-medium">
            Customized
          </div>
          <div className="text-2xl font-semibold text-c-teal mt-1">{customizedCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500 font-medium">
            Total Examples
          </div>
          <div className="text-2xl font-semibold text-c-gray-800 mt-1">{totalExamples}</div>
        </Card>
      </div>

      {loading ? (
        <Card className="p-10 text-center text-[13px] text-c-gray-400">Loading work product types...</Card>
      ) : registry.length === 0 ? (
        <Card className="p-10 text-center text-[13px] text-c-gray-400">
          No work product types found. Ensure the API is configured.
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, types]) => (
            <div key={category}>
              <h2 className="text-[11px] uppercase tracking-[0.06em] text-c-gray-500 font-medium mb-3">
                {category}
              </h2>
              <div className="grid gap-3">
                {types.map((t) => {
                  const Icon = resolveIcon(t.icon)
                  return (
                    <button
                      key={t.taskType}
                      onClick={() => setSelectedType(t.taskType)}
                      className="w-full text-left"
                    >
                      <Card
                        className={`p-4 hover:border-c-teal/30 transition-colors cursor-pointer ${
                          t.hasOverride ? "border-l-[3px] border-l-c-teal" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-c-gray-50 shrink-0">
                            <Icon className="h-4.5 w-4.5 text-c-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13.5px] font-medium text-c-gray-800">
                                {t.label}
                              </span>
                              {t.hasOverride && (
                                <Badge variant="success" className="text-[10px]">
                                  Customized
                                </Badge>
                              )}
                            </div>
                            <p className="text-[12px] text-c-gray-500 mt-0.5 line-clamp-1">
                              {t.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {t.surfaces.map((s) => (
                                <Badge key={s} variant="neutral" className="text-[10px]">
                                  {s}
                                </Badge>
                              ))}
                              <span className="text-[11px] text-c-gray-400">{t.typicalLength}</span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-c-gray-400 shrink-0" />
                        </div>
                      </Card>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// System Prompt collapsible section
// ---------------------------------------------------------------------------

function SystemPromptSection({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-c-gray-50 transition-colors"
      >
        <span className="text-[13px] font-medium text-c-gray-700">View System Prompt</span>
        <ChevronRight
          className={`h-4 w-4 text-c-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-c-gray-100">
          <pre className="mt-3 text-[12px] text-c-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
            {prompt || "No system prompt available."}
          </pre>
        </div>
      )}
    </Card>
  )
}
