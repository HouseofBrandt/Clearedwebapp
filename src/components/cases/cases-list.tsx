"use client"

import { useState } from "react"
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

function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || value === "") return "-"
  const num = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(num)) return "-"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num)
}

const statusColors: Record<string, string> = {
  INTAKE: "bg-blue-100 text-blue-800",
  ANALYSIS: "bg-yellow-100 text-yellow-800",
  REVIEW: "bg-purple-100 text-purple-800",
  ACTIVE: "bg-green-100 text-green-800",
  RESOLVED: "bg-gray-100 text-gray-800",
  CLOSED: "bg-gray-200 text-gray-600",
}

interface CasesListProps {
  initialCases: any[]
  practitioners: { id: string; name: string; role: string }[]
}

export function CasesList({ initialCases, practitioners }: CasesListProps) {
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
  })
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 25
  const router = useRouter()
  const { addToast } = useToast()

  const filteredCases = cases.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    if (typeFilter !== "all" && c.caseType !== typeFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (
        c.caseNumber.toLowerCase().includes(s) ||
        c.clientName.toLowerCase().includes(s)
      )
    }
    return true
  })

  async function handleDeleteCase(caseId: string, caseNumber: string) {
    if (!confirm(`Delete case ${caseNumber}? This permanently deletes all documents, AI tasks, and review history.`)) return
    const res = await fetch(`/api/cases/${caseId}`, { method: "DELETE" })
    if (res.ok) {
      setCases((prev) => prev.filter((c) => c.id !== caseId))
      addToast({ title: "Case deleted" })
    } else {
      addToast({ title: "Error", description: "Failed to delete case", variant: "destructive" })
    }
  }

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
        }),
      })

      if (!res.ok) throw new Error("Failed to create case")

      const created = await res.json()
      setCases([created, ...cases])
      setDialogOpen(false)
      setNewCase({ clientName: "", caseType: "OTHER", notes: "", filingStatus: "", clientEmail: "", clientPhone: "", totalLiability: "" })
      addToast({ title: "Case created", description: `Case ${created.caseNumber} has been created.` })
      router.refresh()
    } catch {
      addToast({ title: "Error", description: "Failed to create case", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cases</h1>
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
              <Button onClick={handleCreateCase} disabled={creating || !newCase.clientName || !newCase.filingStatus}>
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
                placeholder="Search cases..."
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
              <h3 className="mt-4 text-lg font-semibold">No cases found</h3>
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
                  <TableHead>Case #</TableHead>
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
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/cases/${c.id}`)}>
                    <TableCell className="font-medium">{c.caseNumber}</TableCell>
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
                    <TableCell>{c.totalLiability != null && c.totalLiability !== "" ? formatCurrency(c.totalLiability) : <span className="text-muted-foreground">&mdash;</span>}</TableCell>
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
                        onClick={(e) => { e.stopPropagation(); handleDeleteCase(c.id, c.caseNumber) }}>
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
