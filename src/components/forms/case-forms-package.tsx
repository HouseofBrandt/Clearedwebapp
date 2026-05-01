"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, Sparkles, RefreshCw, Loader2 } from "lucide-react"
import type { FormPackageItem, CaseCharacteristics } from "@/lib/forms/resolution-engine"

interface InstanceSummary {
  id: string
  formNumber: string
  status: string
  updatedAt: string
  completionPercent: number
}

interface AvailableForm {
  formNumber: string
  formTitle: string
  estimatedMinutes: number
  hasBinding: boolean
  currentRevision: string
}

interface PathChoice {
  id: string
  name: string
  description: string
}

interface Recommendation {
  path: string
  reasoning: string
  recommendedAt: string | null
}

interface Props {
  caseId: string
  caseNumber: string
  clientName: string
  resolutionPathId: string
  resolutionPathName: string
  /** Every available resolution path — drives the manual override picker. */
  allPaths: PathChoice[]
  packageItems: FormPackageItem[]
  /** Auto-detected characteristics, before practitioner overrides. */
  detectedCharacteristics: CaseCharacteristics
  /** Practitioner overrides currently in effect (subset of CaseCharacteristics). */
  characteristicOverrides: Partial<CaseCharacteristics>
  /** detected ⊕ overrides — the values the package generator was called with. */
  effectiveCharacteristics: CaseCharacteristics
  /** Last AI path recommendation, if any. */
  recommendation: Recommendation | null
  instances: InstanceSummary[]
  availableForms: AvailableForm[]
}

// Characteristic toggle definitions — drives the collapsible toggles UI.
const TOGGLE_DEFS: Array<{
  key: keyof CaseCharacteristics
  label: string
  description: string
}> = [
  { key: "hasBusiness",        label: "Business liability",     description: "Adds 433-B / 433-B-OIC to the package." },
  { key: "isSelfEmployed",     label: "Self-employed",          description: "Sole-proprietor or 1099 income." },
  { key: "isMarriedJoint",     label: "Married filing jointly", description: "Drives spouse-signature fields and 8857 eligibility." },
  { key: "hasIdentityTheft",   label: "Identity theft flagged", description: "Adds 14039 to the package." },
  { key: "needsAmendedReturn", label: "Needs amended return",   description: "Adds 1040-X to the package." },
  { key: "hasNoITIN",          label: "No ITIN on file",        description: "Adds W-7 (foreign filer) to the package." },
  { key: "needsTranscripts",   label: "Need transcripts",       description: "Adds 4506-T to the package." },
]

export function CaseFormsPackage({
  caseId,
  caseNumber,
  clientName,
  resolutionPathId,
  resolutionPathName,
  allPaths,
  packageItems,
  detectedCharacteristics,
  characteristicOverrides,
  effectiveCharacteristics,
  recommendation,
  instances,
  availableForms,
}: Props) {
  const router = useRouter()
  const [downloadingPackage, setDownloadingPackage] = useState(false)
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [savingPath, setSavingPath] = useState(false)
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)
  const [togglesOpen, setTogglesOpen] = useState(false)
  const [savingToggle, setSavingToggle] = useState<keyof CaseCharacteristics | null>(null)
  const [localRecommendation, setLocalRecommendation] = useState<Recommendation | null>(recommendation)

  async function setResolutionPath(nextPath: string) {
    if (nextPath === resolutionPathId) return
    setSavingPath(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/resolution`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionType: nextPath }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body?.error || "Failed to update path")
        return
      }
      router.refresh()
    } finally {
      setSavingPath(false)
    }
  }

  async function toggleCharacteristic(key: keyof CaseCharacteristics, next: boolean) {
    setSavingToggle(key)
    try {
      const res = await fetch(`/api/cases/${caseId}/resolution`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseCharacteristics: { [key]: next } }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body?.error || "Failed to update characteristic")
        return
      }
      router.refresh()
    } finally {
      setSavingToggle(null)
    }
  }

  async function fetchRecommendation() {
    setRecommendLoading(true)
    setRecommendError(null)
    try {
      const res = await fetch(`/api/cases/${caseId}/recommend-resolution`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRecommendError(body?.error || `Server returned ${res.status}`)
        return
      }
      const data = await res.json()
      setLocalRecommendation({
        path: data.recommendedPath,
        reasoning: data.reasoning,
        recommendedAt: new Date().toISOString(),
      })
      // Don't auto-apply — practitioner clicks "Use this path" if they want it.
    } catch (err: any) {
      setRecommendError(err?.message || "Network error")
    } finally {
      setRecommendLoading(false)
    }
  }

  const rows = useMemo(() => {
    return packageItems.map((item) => {
      const matching = instances.filter((i) => i.formNumber === item.formNumber)
      const best = matching.sort((a, b) => {
        const order = (s: string) => (s === "complete" ? 0 : s === "in_progress" ? 1 : 2)
        const byStatus = order(a.status) - order(b.status)
        if (byStatus !== 0) return byStatus
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })[0]
      return { ...item, instance: best }
    })
  }, [packageItems, instances])

  const completeCount = rows.filter((r) => r.instance?.status === "complete").length
  const totalCount = rows.length
  const packageProgress = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0

  const missingFromPackage = useMemo(() => {
    const inPackage = new Set(packageItems.map((p) => p.formNumber))
    return availableForms.filter((f) => !inPackage.has(f.formNumber))
  }, [packageItems, availableForms])

  const orphanInstances = useMemo(() => {
    const inPackage = new Set(packageItems.map((p) => p.formNumber))
    return instances.filter((i) => !inPackage.has(i.formNumber))
  }, [packageItems, instances])

  async function downloadPackage() {
    setDownloadingPackage(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/forms/package/download`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Failed to generate package: ${err.error || res.statusText}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${caseNumber}-forms-package.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingPackage(false)
    }
  }

  async function createInstance(formNumber: string) {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formNumber, caseId }),
    })
    if (!res.ok) {
      alert("Failed to create form instance")
      return
    }
    const { instance } = await res.json()
    router.push(`/forms/${instance.id}`)
  }

  function openInstance(id: string) {
    router.push(`/forms/${id}`)
  }

  const recPathName = localRecommendation
    ? allPaths.find((p) => p.id === localRecommendation.path)?.name
    : null
  const recIsCurrent = localRecommendation?.path === resolutionPathId

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Link href={`/cases/${caseId}`} className="hover:underline">
            {caseNumber}
          </Link>
          <span>›</span>
          <span>Forms</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Resolution package for {clientName}
        </h1>

        {/* ───── Resolution path picker ─────────────────────────────────── */}
        <div className="mt-5 rounded-xl border border-[var(--c-gray-100)] bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Resolution path</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Select
                  value={resolutionPathId}
                  onValueChange={setResolutionPath}
                  disabled={savingPath}
                >
                  <SelectTrigger className="w-[280px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allPaths.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {savingPath && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchRecommendation}
                  disabled={recommendLoading}
                  className="text-xs"
                  title="Ask Claude to recommend a path based on this case's data"
                >
                  {recommendLoading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5 text-[var(--c-teal)]" />
                  )}
                  {localRecommendation ? "Refresh recommendation" : "Get AI recommendation"}
                </Button>
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {allPaths.find((p) => p.id === resolutionPathId)?.description}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={completeCount === 0 || downloadingPackage}
              onClick={downloadPackage}
            >
              {downloadingPackage ? "Generating…" : "Download package"}
            </Button>
          </div>

          {/* AI recommendation panel (shows after Get / Refresh) */}
          {localRecommendation && (
            <div
              className="mt-3 rounded-lg border px-3 py-2.5 flex items-start gap-3"
              style={{ background: "var(--c-info-soft)", borderColor: "rgba(20, 184, 166, 0.2)" }}
            >
              <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-[var(--c-teal)]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Recommended: {recPathName || localRecommendation.path}
                  {recIsCurrent && <span className="text-xs font-normal text-muted-foreground ml-2">(currently selected)</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{localRecommendation.reasoning}</p>
              </div>
              {!recIsCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={() => setResolutionPath(localRecommendation.path)}
                  disabled={savingPath}
                >
                  Use this path
                </Button>
              )}
            </div>
          )}
          {recommendError && (
            <p className="mt-2 text-xs text-c-danger">Recommendation failed: {recommendError}</p>
          )}

          {/* Case characteristics — collapsible toggles */}
          <button
            type="button"
            onClick={() => setTogglesOpen(!togglesOpen)}
            className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${togglesOpen ? "" : "-rotate-90"}`}
            />
            Case characteristics ({Object.keys(characteristicOverrides).length} customized)
          </button>
          {togglesOpen && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {TOGGLE_DEFS.map((def) => {
                const detected = (detectedCharacteristics as any)[def.key] as boolean
                const overridden = def.key in characteristicOverrides
                const value = (effectiveCharacteristics as any)[def.key] as boolean
                const saving = savingToggle === def.key
                return (
                  <label
                    key={def.key}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      saving
                        ? "border-[var(--c-gray-100)] opacity-60"
                        : overridden
                        ? "border-[var(--c-teal)]/40 bg-c-info-soft/40"
                        : "border-[var(--c-gray-100)] hover:bg-c-gray-50/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={value}
                      disabled={saving}
                      onChange={(e) => toggleCharacteristic(def.key, e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--c-teal)]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground leading-tight">
                        {def.label}
                        {overridden && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[var(--c-teal)]">
                            override
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{def.description}</p>
                      {overridden && detected !== value && (
                        <p className="text-[10.5px] text-muted-foreground/80 mt-0.5">
                          Auto-detected: {detected ? "yes" : "no"}
                        </p>
                      )}
                    </div>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                {completeCount} of {totalCount} forms complete
              </span>
              <span className="font-medium text-foreground">
                {packageProgress}%
              </span>
            </div>
            <Progress value={packageProgress} className="mt-2 h-1.5" />
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Required and recommended forms</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul>
            {rows.map((row, idx) => (
              <li key={row.formNumber}>
                <FormRow
                  item={row}
                  onCreate={() => createInstance(row.formNumber)}
                  onOpen={(id) => openInstance(id)}
                />
                {idx < rows.length - 1 && <Separator />}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {orphanInstances.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Other forms on this case
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul>
                {orphanInstances.map((inst, idx) => (
                  <li key={inst.id}>
                    <button
                      className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-accent"
                      onClick={() => openInstance(inst.id)}
                    >
                      <div>
                        <div className="font-medium text-foreground">
                          Form {inst.formNumber}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Not part of the {resolutionPathName} package · {statusLabel(inst.status)}
                        </div>
                      </div>
                      <StatusBadge status={inst.status} percent={inst.completionPercent} />
                    </button>
                    {idx < orphanInstances.length - 1 && <Separator />}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <div className="mt-8 flex justify-center">
        <Dialog open={addFormOpen} onOpenChange={setAddFormOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">+ Add form outside package</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a form</DialogTitle>
              <DialogDescription>
                Forms not currently in the {resolutionPathName} package. Adding one creates a new instance for this case.
              </DialogDescription>
            </DialogHeader>
            <AddFormPicker
              forms={missingFromPackage}
              onPick={async (formNumber) => {
                setAddFormOpen(false)
                await createInstance(formNumber)
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function FormRow({
  item,
  onCreate,
  onOpen,
}: {
  item: FormPackageItem & { instance?: InstanceSummary }
  onCreate: () => void
  onOpen: (id: string) => void
}) {
  const inst = item.instance
  const hasInstance = !!inst

  return (
    <div className="flex items-start gap-4 px-6 py-4">
      <div className="mt-1 shrink-0">
        <StatusIcon status={inst?.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">
            Form {item.formNumber}
          </span>
          <RequirementBadge level={item.requirement} />
          {!item.available && (
            <span className="text-xs text-muted-foreground">· schema not yet available</span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {item.formTitle}
        </div>
        <div className="mt-1 text-xs text-muted-foreground/80">
          {item.reason}
        </div>
      </div>
      <div className="shrink-0">
        {hasInstance ? (
          <div className="flex items-center gap-3">
            <StatusBadge status={inst!.status} percent={inst!.completionPercent} />
            <Button size="sm" variant="outline" onClick={() => onOpen(inst!.id)}>
              Open
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={onCreate} disabled={!item.available}>
            Start
          </Button>
        )}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "complete" || status === "submitted") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
        style={{ background: "hsl(var(--c-success-soft))", color: "hsl(var(--c-success))" }}
        aria-label="Complete"
      >
        ✓
      </span>
    )
  }
  if (status === "in_progress" || status === "draft") {
    return (
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
        style={{ background: "hsl(var(--c-warning-soft))", color: "hsl(var(--c-warning))" }}
        aria-label="In progress"
      >
        ◐
      </span>
    )
  }
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full text-xs bg-muted text-muted-foreground"
      aria-label="Not started"
    >
      ○
    </span>
  )
}

function StatusBadge({ status, percent }: { status: string; percent: number }) {
  if (status === "complete" || status === "submitted") {
    return <Badge variant="outline" className="text-xs">Complete</Badge>
  }
  if (status === "in_progress") {
    return <Badge variant="outline" className="text-xs">{percent}%</Badge>
  }
  if (status === "draft") {
    return <Badge variant="outline" className="text-xs">Draft</Badge>
  }
  return null
}

function RequirementBadge({ level }: { level: "required" | "recommended" | "if_applicable" }) {
  if (level === "required") {
    return (
      <Badge
        className="text-[10px] uppercase tracking-wide"
        style={{ background: "hsl(var(--c-danger-soft))", color: "hsl(var(--c-danger))" }}
      >
        Required
      </Badge>
    )
  }
  if (level === "recommended") {
    return (
      <Badge
        className="text-[10px] uppercase tracking-wide"
        style={{ background: "hsl(var(--c-info-soft))", color: "hsl(var(--c-info))" }}
      >
        Recommended
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
      Optional
    </Badge>
  )
}

function statusLabel(status: string) {
  switch (status) {
    case "complete":    return "Complete"
    case "submitted":   return "Submitted"
    case "in_progress": return "In progress"
    case "draft":       return "Draft"
    default:            return status
  }
}

function AddFormPicker({
  forms,
  onPick,
}: {
  forms: AvailableForm[]
  onPick: (formNumber: string) => void
}) {
  const [selected, setSelected] = useState<string>("")

  const available = forms.filter((f) => f.hasBinding)
  const blocked = forms.filter((f) => !f.hasBinding)

  return (
    <div className="space-y-4">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger>
          <SelectValue placeholder="Select a form…" />
        </SelectTrigger>
        <SelectContent>
          {available.map((f) => (
            <SelectItem key={f.formNumber} value={f.formNumber}>
              Form {f.formNumber} — {f.formTitle}
            </SelectItem>
          ))}
          {blocked.length > 0 && (
            <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground border-t mt-1">
              Coming soon — PDF binding not yet authored
            </div>
          )}
          {blocked.map((f) => (
            <SelectItem key={f.formNumber} value={f.formNumber} disabled>
              Form {f.formNumber} — {f.formTitle}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {blocked.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground leading-snug">
          Forms listed under <em>Coming soon</em> have a schema and validation in place but
          the PDF field-name mapping hasn&rsquo;t been authored yet. They&rsquo;ll
          render incorrectly if forced, so they&rsquo;re blocked at the picker.
          {" "}See TASKS.md for the authoring queue.
        </p>
      )}

      <DialogFooter>
        <Button disabled={!selected} onClick={() => onPick(selected)}>
          Start this form
        </Button>
      </DialogFooter>
    </div>
  )
}
