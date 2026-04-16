"use client"

import { useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Search, FileText, FolderOpen, Trash2 } from "lucide-react"
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS, FILING_STATUS_LABELS } from "@/types"
import { useToast } from "@/components/ui/toast"

import { formatRelative } from "@/lib/date-utils"

const timeAgo = formatRelative

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || value === "") return "-"
  const num = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(num)) return "-"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num)
}

const statusColors: Record<string, string> = {
  INTAKE: "bg-c-info-soft text-c-teal",
  ANALYSIS: "bg-c-warning-soft text-c-warning",
  REVIEW: "bg-c-info-soft text-c-info",
  ACTIVE: "bg-c-success-soft text-c-success",
  RESOLVED: "bg-c-gray-100 text-c-gray-900",
  CLOSED: "bg-c-gray-200 text-c-gray-500",
}

interface CasesListProps {
  initialCases: any[]
  practitioners: { id: string; name: string; role: string }[]
  totalCount?: number
}

export function CasesList({ initialCases, practitioners, totalCount }: CasesListProps) {
  const [cases, setCases] = useState(initialCases)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCase, setNewCase] = useState({
    clientName: "",
    caseType: "OTHER",
    notes: "",
    filingStatus: "",
    clientEmail: "",
    clientPhone: "",
    totalLiability: "",
    tabsNumber: "",
  })
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 25
  const router = useRouter()
  const { addToast } = useToast()

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false
      if (typeFilter !== "all" && c.caseType !== typeFilter) return false
      if (search) {
        const s = search.toLowerCase()
        return (
          c.tabsNumber?.toLowerCase().includes(s) ||
          c.clientName.toLowerCase().includes(s)
        )
      }
      return true
    })
  }, [cases, search, statusFilter, typeFilter])

  const handleDeleteCase = useCallback(async function handleDeleteCase(caseId: string, tabsNumber: string) {
    if (!confirm(`Delete case ${tabsNumber}? This permanently deletes all documents, AI tasks, and review history.`)) return
    try {
      const res = await fetch(`/api/cases/${caseId}`, { method: "DELETE" })
      if (res.ok) {
        setCases((prev) => prev.filter((c) => c.id !== caseId))
        addToast({ title: "Case deleted" })
        return
      }
      let detail = "Failed to delete case"
      try {
        const body = await res.json()
        if (body?.error) detail = typeof body.error === "string" ? body.error : detail
      } catch { /* keep default */ }
      addToast({ title: "Could not delete case", description: detail, variant: "destructive" })
    } catch (err: any) {
      addToast({ title: "Network error", description: err?.message || "Could not reach the server.", variant: "destructive" })
    }
  }, [addToast])

  async function handleCreateCase() {
    if (!newCase.clientName || !newCase.caseType) return
    setCreating(true)

    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCase,
          filingStatus: newCase.filingStatus || undefined,
          clientEmail: newCase.clientEmail || undefined,
          clientPhone: newCase.clientPhone || undefined,
          totalLiability: newCase.totalLiability ? parseFloat(newCase.totalLiability) : undefined,
          tabsNumber: newCase.tabsNumber || undefined,
        }),
      })

      if (!res.ok) {
        // Try to surface specific validation errors from the API
        let errorMsg = "Failed to create case"
        try {
          const errBody = await res.json()
          if (errBody?.error) {
            if (typeof errBody.error === "string") {
              errorMsg = errBody.error
            } else if (typeof errBody.error === "object") {
              // Zod fieldErrors shape: { fieldName: ["error1", "error2"] }
              const fieldErrors = Object.entries(errBody.error)
                .map(([field, msgs]) => {
                  const messages = Array.isArray(msgs) ? msgs.join(", ") : String(msgs)
                  return `${field}: ${messages}`
                })
                .join("; ")
              if (fieldErrors) errorMsg = fieldErrors
            }
          }
        } catch { /* fall back to generic message */ }
        throw new Error(errorMsg)
      }

      const created = await res.json()
      // Use functional updater to avoid stale-closure bugs when state was updated mid-flight
      setCases((prev) => [created, ...prev])
      setDialogOpen(false)
      setNewCase({ clientName: "", caseType: "OTHER", notes: "", filingStatus: "", clientEmail: "", clientPhone: "", totalLiability: "", tabsNumber: "" })
      addToast({ title: "Case created", description: `Case ${created.tabsNumber || created.id} has been created.` })
      router.refresh()
    } catch (err: any) {
      addToast({
        title: "Could not create case",
        description: err?.message || "Please check the fields and try again.",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-md">Cases</h1>
          <p className="text-muted-foreground">Manage client cases and matters</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Case
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Case</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  value={newCase.clientName}
                  onChange={(e) => setNewCase({ ...newCase, clientName: e.target.value })}
                  placeholder="Enter client name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tabsNumber">TABS Number</Label>
                <Input
                  id="tabsNumber"
                  value={newCase.tabsNumber}
                  onChange={(e) => setNewCase({ ...newCase, tabsNumber: e.target.value })}
                  placeholder="e.g. 12345.001"
                />
                <p className="text-xs text-muted-foreground">PracticeMaster client ID (required for filing)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="caseType">Case Type</Label>
                <Select
                  value={newCase.caseType}
                  onValueChange={(v) => setNewCase({ ...newCase, caseType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filingStatus">Filing Status</Label>
                <Select
                  value={newCase.filingStatus}
                  onValueChange={(v) => setNewCase({ ...newCase, filingStatus: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select filing status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Client Email (optional)</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={newCase.clientEmail}
                  onChange={(e) => setNewCase({ ...newCase, clientEmail: e.target.value })}
                  placeholder="client@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientPhone">Client Phone (optional)</Label>
                <Input
                  id="clientPhone"
                  type="tel"
                  value={newCase.clientPhone}
                  onChange={(e) => setNewCase({ ...newCase, clientPhone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalLiability">Estimated Total Liability (optional)</Label>
                <Input
                  id="totalLiability"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newCase.totalLiability}
                  onChange={(e) => setNewCase({ ...newCase, totalLiability: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={newCase.notes}
                  onChange={(e) => setNewCase({ ...newCase, notes: e.target.value })}
                  placeholder="Add any initial notes..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCase} disabled={creating || !newCase.clientName || !newCase.tabsNumber}>
                {creating ? "Creating..." : "Create Case"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by TABS number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(CASE_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No cases found</h3>
              <p className="text-sm text-muted-foreground">
                {cases.length === 0
                  ? "Create your first case to get started."
                  : "Try adjusting your search or filters."}
              </p>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TABS #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden xl:table-cell">Filing Status</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Liability</TableHead>
                  <TableHead className="hidden xl:table-cell">Assigned To</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Docs</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((c) => (
                  <TableRow key={c.id} className="cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]" onClick={() => router.push(`/cases/${c.id}`)}>
                    <TableCell className="font-medium font-mono tabular-nums">{c.tabsNumber || "—"}</TableCell>
                    <TableCell>{c.clientName}</TableCell>
                    <TableCell>
                      <span className="text-sm">{CASE_TYPE_LABELS[c.caseType as keyof typeof CASE_TYPE_LABELS] || c.caseType}</span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm">{c.filingStatus ? (FILING_STATUS_LABELS[c.filingStatus as keyof typeof FILING_STATUS_LABELS] || c.filingStatus) : <span className="text-muted-foreground">&mdash;</span>}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[c.status] || ""} variant="secondary">
                        {CASE_STATUS_LABELS[c.status as keyof typeof CASE_STATUS_LABELS] || c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">{c.totalLiability != null && c.totalLiability !== "" ? formatCurrency(c.totalLiability) : <span className="text-muted-foreground">&mdash;</span>}</TableCell>
                    <TableCell className="hidden xl:table-cell">{c.assignedPractitioner?.name || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{timeAgo(c.updatedAt)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <FileText className="h-3 w-3" />
                        {c._count?.documents || 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCase(c.id, c.tabsNumber || c.id) }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredCases.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCases.length)} of {filteredCases.length} cases
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage * PAGE_SIZE >= filteredCases.length}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
