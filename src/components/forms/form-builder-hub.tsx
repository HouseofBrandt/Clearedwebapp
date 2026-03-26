"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileText,
  Plus,
  Clock,
  ArrowRight,
  Search,
  Loader2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import type { FormInstance } from "@/lib/forms/types"
import {
  FORM_STATUS_LABELS,
  FORM_STATUS_STYLES,
  type FormInstanceUIStatus,
} from "@/types/forms"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FormBuilderHubProps {
  currentUser: {
    id?: string
    name?: string | null
    email?: string | null
    role?: string
  }
}

// Available form metadata — fetched from API or kept as local constant
interface AvailableForm {
  formNumber: string
  formTitle: string
  estimatedMinutes: number
  description?: string
  sectionCount?: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormBuilderHub({ currentUser }: FormBuilderHubProps) {
  const router = useRouter()
  const [instances, setInstances] = useState<FormInstance[]>([])
  const [availableForms, setAvailableForms] = useState<AvailableForm[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newCaseId, setNewCaseId] = useState("")
  const [newFormNumber, setNewFormNumber] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [cases, setCases] = useState<{ id: string; caseNumber: string; clientName: string }[]>([])

  // Load available forms and recent instances
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/forms")
        if (res.ok) {
          const data = await res.json()
          setInstances(data.instances || [])
          setAvailableForms(data.availableForms || data.forms || [])
        }
      } catch {
        // Silent — empty state is fine
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Fetch cases for the new form dialog
  useEffect(() => {
    if (!showNewDialog) return
    async function loadCases() {
      try {
        const res = await fetch("/api/cases?limit=50")
        if (res.ok) {
          const data = await res.json()
          setCases(data.cases || data || [])
        }
      } catch {
        // Fall through
      }
    }
    loadCases()
  }, [showNewDialog])

  // Create new form instance
  const handleCreate = async () => {
    if (!newCaseId || !newFormNumber) return
    setCreating(true)
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: newCaseId, formNumber: newFormNumber }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/forms/${data.instance?.id || data.id}`)
      }
    } catch {
      // Show error via toast in production
    } finally {
      setCreating(false)
    }
  }

  // Filter templates
  const filteredForms = availableForms.filter(
    (t) =>
      !searchQuery ||
      t.formNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.formTitle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Fallback forms if API hasn't returned yet
  const formsToShow = filteredForms.length > 0 ? filteredForms : [
    { formNumber: "433-A", formTitle: "Collection Information Statement for Wage Earners and Self-Employed Individuals", estimatedMinutes: 45, description: "Financial disclosure for individual taxpayers.", sectionCount: 6 },
    { formNumber: "433-B", formTitle: "Collection Information Statement for Businesses", estimatedMinutes: 60, description: "Financial disclosure for business entities.", sectionCount: 5 },
    { formNumber: "656", formTitle: "Offer in Compromise", estimatedMinutes: 30, description: "Application for settling tax debt.", sectionCount: 4 },
  ].filter((t) =>
    !searchQuery ||
    t.formNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.formTitle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-md">Form Builder</h1>
          <p className="text-sm text-c-gray-300 mt-1">
            Complete IRS forms with guided data entry and live validation
          </p>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="text-sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Start New Form
        </Button>
      </div>

      {/* New Form Dialog (inline) */}
      {showNewDialog && (
        <Card className="border border-[var(--c-gray-100)] rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-4">
                <h3 className="text-sm font-medium text-c-gray-700">Start a New Form</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-c-gray-700">Case</label>
                    <Select value={newCaseId} onValueChange={setNewCaseId}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select case..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cases.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.caseNumber} — {c.clientName}
                          </SelectItem>
                        ))}
                        {cases.length === 0 && (
                          <div className="px-3 py-2 text-sm text-c-gray-300">No cases found</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-c-gray-700">Form Type</label>
                    <Select value={newFormNumber} onValueChange={setNewFormNumber}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select form..." />
                      </SelectTrigger>
                      <SelectContent>
                        {formsToShow.map((t) => (
                          <SelectItem key={t.formNumber} value={t.formNumber}>
                            Form {t.formNumber} — {t.formTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowNewDialog(false)
                    setNewCaseId("")
                    setNewFormNumber("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newCaseId || !newFormNumber || creating}
                >
                  {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Forms Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-c-gray-700 uppercase tracking-wider">
            Available Forms
          </h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-c-gray-300" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search forms..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formsToShow.map((form) => (
            <Card
              key={form.formNumber}
              className="border border-[var(--c-gray-100)] rounded-xl hover:border-[var(--c-gray-200)] transition-colors cursor-pointer group"
              onClick={() => {
                setNewFormNumber(form.formNumber)
                setShowNewDialog(true)
              }}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-9 w-9 rounded-lg bg-c-info-soft flex items-center justify-center">
                    <FileText className="h-4.5 w-4.5 text-[var(--c-teal)]" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-c-gray-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-c-gray-300">
                    Form {form.formNumber}
                  </p>
                  <h3 className="text-sm font-medium text-c-gray-700 leading-snug line-clamp-2">
                    {form.formTitle}
                  </h3>
                  {form.description && (
                    <p className="text-xs text-c-gray-300 line-clamp-2 mt-1">
                      {form.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--c-gray-100)]">
                  <div className="flex items-center gap-1 text-xs text-c-gray-300">
                    <Clock className="h-3 w-3" />
                    ~{form.estimatedMinutes} min
                  </div>
                  {form.sectionCount && (
                    <span className="text-xs text-c-gray-200">
                      {form.sectionCount} sections
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent Form Instances Table */}
      <section>
        <h2 className="text-sm font-medium text-c-gray-700 uppercase tracking-wider mb-4">
          Recent Forms
        </h2>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-c-gray-50 animate-pulse" />
            ))}
          </div>
        ) : instances.length === 0 ? (
          <div className="rounded-xl border border-[var(--c-gray-100)] p-8 text-center">
            <FileText className="h-8 w-8 mx-auto mb-3 text-c-gray-200" />
            <p className="text-sm text-c-gray-300">
              No forms started yet. Select a form above to begin.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--c-gray-100)] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Case</TableHead>
                  <TableHead className="text-xs">Form</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Progress</TableHead>
                  <TableHead className="text-xs">Last Edited</TableHead>
                  <TableHead className="text-xs w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((inst) => {
                  const statusLabel = FORM_STATUS_LABELS[inst.status as FormInstanceUIStatus] || inst.status
                  const statusStyle = FORM_STATUS_STYLES[inst.status as FormInstanceUIStatus] || "bg-c-gray-100 text-c-gray-700"
                  const completedCount = inst.completedSections?.length || 0
                  const progressPct = completedCount > 0 ? Math.round((completedCount / 6) * 100) : 0
                  return (
                    <TableRow
                      key={inst.id}
                      className="cursor-pointer hover:bg-c-gray-50"
                      onClick={() => router.push(`/forms/${inst.id}`)}
                    >
                      <TableCell className="text-sm">
                        <span className="font-medium">{inst.caseId || "—"}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        Form {inst.formNumber}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[11px] ${statusStyle}`}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={progressPct} size="sm" className="flex-1" />
                          <span className="text-xs font-mono tabular-nums text-c-gray-300">
                            {progressPct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-c-gray-300">
                        {new Date(inst.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <ArrowRight className="h-3.5 w-3.5 text-c-gray-200" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
