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
import type { FormPackageItem } from "@/lib/forms/resolution-engine"

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

interface Props {
  caseId: string
  caseNumber: string
  clientName: string
  resolutionPathId: string
  resolutionPathName: string
  packageItems: FormPackageItem[]
  instances: InstanceSummary[]
  availableForms: AvailableForm[]
}

export function CaseFormsPackage({
  caseId,
  caseNumber,
  clientName,
  resolutionPathId,
  resolutionPathName,
  packageItems,
  instances,
  availableForms,
}: Props) {
  const router = useRouter()
  const [downloadingPackage, setDownloadingPackage] = useState(false)
  const [addFormOpen, setAddFormOpen] = useState(false)

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
          {resolutionPathName} for {clientName}
        </h1>
        <div className="mt-4 flex items-center gap-4">
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
          <Button
            variant="outline"
            disabled={completeCount === 0 || downloadingPackage}
            onClick={downloadPackage}
          >
            {downloadingPackage ? "Generating…" : "Download package"}
          </Button>
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
  return (
    <div className="space-y-4">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger>
          <SelectValue placeholder="Select a form…" />
        </SelectTrigger>
        <SelectContent>
          {forms.map((f) => (
            <SelectItem key={f.formNumber} value={f.formNumber} disabled={!f.hasBinding}>
              Form {f.formNumber} — {f.formTitle}
              {!f.hasBinding ? "  (no PDF binding yet)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DialogFooter>
        <Button disabled={!selected} onClick={() => onPick(selected)}>
          Start this form
        </Button>
      </DialogFooter>
    </div>
  )
}
