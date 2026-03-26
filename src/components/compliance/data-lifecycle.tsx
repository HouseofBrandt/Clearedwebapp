"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Trash2,
  Clock,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  Shield,
  Archive,
  CheckCircle2,
  User,
  Plus,
  ArrowRight,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

interface ExpiredClient {
  caseId: string
  clientName: string
  tabsNumber: string
  closedAt: string
  retentionExpiry: string
  dataTypes: string[]
  documentCount: number
  aiTaskCount: number
  noteCount: number
  tokenMapCount: number
}

interface DisposalRecord {
  id: string
  clientCount: number
  recordCount: number
  method: string
  status: string
  queuedAt: string
  confirmedAt: string | null
  executedAt: string | null
  certificateId: string | null
  confirmedBy: { id: string; name: string; email: string } | null
  details: any
}

interface DataSubjectRequest {
  id: string
  requestType: string
  subjectName: string
  subjectEmail: string
  description: string
  status: string
  slaDeadline: string
  assignedTo: { id: string; name: string; email: string } | null
  completedAt: string | null
  notes: string | null
  createdAt: string
  slaBreached: boolean
  slaRemainingDays: number | null
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function requestTypeColor(type: string): string {
  switch (type) {
    case "ACCESS":
      return "bg-c-info-soft text-c-teal"
    case "CORRECTION":
      return "bg-yellow-100 text-yellow-800"
    case "DELETION":
      return "bg-c-danger-soft text-c-danger"
    default:
      return "bg-c-gray-100 text-c-gray-900"
  }
}

function disposalStatusColor(status: string): string {
  switch (status) {
    case "QUEUED":
      return "bg-yellow-100 text-yellow-800"
    case "CONFIRMED":
      return "bg-c-info-soft text-c-teal"
    case "EXECUTED":
      return "bg-emerald-100 text-emerald-800"
    case "CERTIFIED":
      return "bg-c-success-soft text-c-success"
    default:
      return "bg-c-gray-100 text-c-gray-900"
  }
}

function dsrStatusColor(status: string): string {
  switch (status) {
    case "RECEIVED":
      return "bg-yellow-100 text-yellow-800"
    case "IN_PROGRESS":
      return "bg-c-info-soft text-c-teal"
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800"
    case "DENIED":
      return "bg-c-danger-soft text-c-danger"
    default:
      return "bg-c-gray-100 text-c-gray-900"
  }
}

// ── Component ──────────────────────────────────────────────────────

export function DataLifecycleDashboard() {
  const [activeTab, setActiveTab] = useState("retention")
  const [loading, setLoading] = useState(false)

  // Retention / Disposal state
  const [expiredData, setExpiredData] = useState<ExpiredClient[]>([])
  const [disposalRecords, setDisposalRecords] = useState<DisposalRecord[]>([])
  const [showConfirmDisposal, setShowConfirmDisposal] = useState(false)
  const [disposalToConfirm, setDisposalToConfirm] = useState<string | null>(
    null
  )

  // Data Subject Requests state
  const [dsrList, setDsrList] = useState<DataSubjectRequest[]>([])
  const [showCreateDsr, setShowCreateDsr] = useState(false)
  const [selectedDsr, setSelectedDsr] = useState<DataSubjectRequest | null>(
    null
  )
  const [showDsrDetail, setShowDsrDetail] = useState(false)

  // Create DSR form
  const [dsrType, setDsrType] = useState("ACCESS")
  const [dsrName, setDsrName] = useState("")
  const [dsrEmail, setDsrEmail] = useState("")
  const [dsrDescription, setDsrDescription] = useState("")
  const [actionLoading, setActionLoading] = useState(false)

  // Fetch data subject requests
  const fetchDSRs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/data-requests")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setDsrList(data.requests || [])
    } catch (err) {
      console.error("[data-lifecycle] DSR fetch error:", err)
    }
  }, [])

  // Fetch disposal records (from the general switchboard or direct API)
  const fetchDisposalRecords = useCallback(async () => {
    // For now, disposal records will come from the existing data-retention API
    // This is a placeholder that can be connected to a real endpoint
    try {
      // The disposal records are fetched via the data-lifecycle API
      // We'll display whatever is available
    } catch (err) {
      console.error("[data-lifecycle] Disposal fetch error:", err)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "requests") {
      fetchDSRs()
    }
    if (activeTab === "retention") {
      fetchDisposalRecords()
    }
  }, [activeTab, fetchDSRs, fetchDisposalRecords])

  const handleCreateDsr = async () => {
    setActionLoading(true)
    try {
      const res = await fetch("/api/admin/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: dsrType,
          subjectName: dsrName,
          subjectEmail: dsrEmail,
          description: dsrDescription,
        }),
      })
      if (!res.ok) throw new Error("Failed to create")
      setShowCreateDsr(false)
      setDsrName("")
      setDsrEmail("")
      setDsrDescription("")
      fetchDSRs()
    } catch (err) {
      console.error("[data-lifecycle] Create DSR error:", err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDsrAction = async (
    requestId: string,
    action: string,
    extraData?: any
  ) => {
    setActionLoading(true)
    try {
      const body: any = {}
      if (action === "compile" || action === "correct" || action === "delete") {
        body.executeAction = action
        if (extraData) Object.assign(body, extraData)
      } else {
        body.status = action
      }

      const res = await fetch(`/api/admin/data-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("Failed to update")
      fetchDSRs()
    } catch (err) {
      console.error("[data-lifecycle] DSR action error:", err)
    } finally {
      setActionLoading(false)
    }
  }

  // Summary counts
  const pendingDsrs = dsrList.filter(
    (r) => r.status !== "COMPLETED" && r.status !== "DENIED"
  ).length
  const breachedDsrs = dsrList.filter((r) => r.slaBreached).length

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="retention">
            <Archive className="h-4 w-4 mr-2" />
            Data Retention
          </TabsTrigger>
          <TabsTrigger value="requests">
            <Shield className="h-4 w-4 mr-2" />
            Subject Requests
            {pendingDsrs > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {pendingDsrs}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="certificates">
            <FileCheck className="h-4 w-4 mr-2" />
            Disposal Certificates
          </TabsTrigger>
        </TabsList>

        {/* ── Retention Tab ─────────────────────────────────── */}
        <TabsContent value="retention" className="space-y-4 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-c-warning" />
                  <p className="text-xs font-medium text-c-warning uppercase tracking-wider">
                    Approaching Expiry
                  </p>
                </div>
                <p className="text-2xl font-medium mt-1">
                  {expiredData.length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-c-danger" />
                  <p className="text-xs font-medium text-c-danger uppercase tracking-wider">
                    Pending Disposal
                  </p>
                </div>
                <p className="text-2xl font-medium mt-1">
                  {disposalRecords.filter(
                    (r) => r.status === "QUEUED" || r.status === "CONFIRMED"
                  ).length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                    Completed
                  </p>
                </div>
                <p className="text-2xl font-medium mt-1">
                  {
                    disposalRecords.filter(
                      (r) => r.status === "EXECUTED"
                    ).length
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-c-teal" />
                  <p className="text-xs font-medium text-c-teal uppercase tracking-wider">
                    Retention Policy
                  </p>
                </div>
                <p className="text-lg font-medium mt-1">7 Years</p>
              </CardContent>
            </Card>
          </div>

          {/* Expired Data Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium uppercase tracking-wider">
                  Data Approaching Retention Expiry
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLoading(true)
                    setTimeout(() => setLoading(false), 500)
                  }}
                  disabled={loading}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
                  />
                  Scan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {expiredData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    No data currently past retention period.
                  </p>
                  <p className="text-xs mt-1">
                    Run a scan to check for expired data.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Closed</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Data Types</TableHead>
                      <TableHead>Records</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiredData.map((item) => (
                      <TableRow key={item.caseId}>
                        <TableCell className="font-mono text-xs">
                          {item.tabsNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.clientName}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(item.closedAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className="text-xs bg-c-danger-soft text-c-danger"
                          >
                            {formatDate(item.retentionExpiry)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {item.dataTypes.map((dt) => (
                              <Badge
                                key={dt}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {dt}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.documentCount + item.aiTaskCount +
                            item.noteCount + item.tokenMapCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pending Disposal Batches */}
          {disposalRecords.filter(
            (r) => r.status === "QUEUED" || r.status === "CONFIRMED"
          ).length > 0 && (
            <Card className="border-c-danger/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-c-danger">
                  Pending Disposal Batches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Clients</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Queued</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disposalRecords
                      .filter(
                        (r) =>
                          r.status === "QUEUED" || r.status === "CONFIRMED"
                      )
                      .map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-xs">
                            {record.id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>{record.clientCount}</TableCell>
                          <TableCell>{record.recordCount}</TableCell>
                          <TableCell className="text-xs">
                            {record.method === "CRYPTO_SHRED"
                              ? "Crypto Shred"
                              : record.method}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs ${disposalStatusColor(record.status)}`}
                            >
                              {record.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDate(record.queuedAt)}
                          </TableCell>
                          <TableCell>
                            {record.status === "QUEUED" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setDisposalToConfirm(record.id)
                                  setShowConfirmDisposal(true)
                                }}
                              >
                                Confirm
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Data Subject Requests Tab ─────────────────────── */}
        <TabsContent value="requests" className="space-y-4 mt-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Requests
                </p>
                <p className="text-2xl font-medium mt-1">{dsrList.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-yellow-600 uppercase tracking-wider">
                  Pending
                </p>
                <p className="text-2xl font-medium mt-1 text-yellow-700">
                  {pendingDsrs}
                </p>
              </CardContent>
            </Card>
            <Card className={breachedDsrs > 0 ? "border-c-danger/20" : ""}>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-c-danger uppercase tracking-wider">
                  SLA Breached
                </p>
                <p className="text-2xl font-medium mt-1 text-c-danger">
                  {breachedDsrs}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                  Completed
                </p>
                <p className="text-2xl font-medium mt-1 text-emerald-700">
                  {dsrList.filter((r) => r.status === "COMPLETED").length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowCreateDsr(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </div>

          {/* Request List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider">
                Active Data Subject Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dsrList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No data subject requests</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dsrList.map((dsr) => (
                      <TableRow
                        key={dsr.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setSelectedDsr(dsr)
                          setShowDsrDetail(true)
                        }}
                      >
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${requestTypeColor(dsr.requestType)}`}
                          >
                            {dsr.requestType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {dsr.subjectName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${dsrStatusColor(dsr.status)}`}
                          >
                            {dsr.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {dsr.slaBreached ? (
                            <Badge
                              variant="destructive"
                              className="text-xs"
                            >
                              BREACHED
                            </Badge>
                          ) : dsr.slaRemainingDays !== null ? (
                            <span className="text-xs font-mono">
                              {dsr.slaRemainingDays}d left
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              --
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {dsr.assignedTo ? (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs">
                                {dsr.assignedTo.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Unassigned
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(dsr.createdAt)}
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Certificates Tab ──────────────────────────────── */}
        <TabsContent value="certificates" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider">
                Disposal Certificate History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {disposalRecords.filter((r) => r.status === "EXECUTED")
                .length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No disposal certificates yet</p>
                  <p className="text-xs mt-1">
                    Certificates are generated when data disposal batches are
                    executed.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate ID</TableHead>
                      <TableHead>Clients</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Executed</TableHead>
                      <TableHead>Confirmed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disposalRecords
                      .filter((r) => r.status === "EXECUTED")
                      .map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-xs">
                            {record.certificateId || record.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{record.clientCount}</TableCell>
                          <TableCell>{record.recordCount}</TableCell>
                          <TableCell className="text-xs">
                            {record.method === "CRYPTO_SHRED"
                              ? "Cryptographic Shredding"
                              : record.method}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDateTime(record.executedAt)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {record.confirmedBy?.name || "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DSR Detail Dialog ──────────────────────────────── */}
      <Dialog open={showDsrDetail} onOpenChange={setShowDsrDetail}>
        <DialogContent className="max-w-lg">
          {selectedDsr && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Data Subject Request: {selectedDsr.requestType}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Subject
                    </p>
                    <p className="font-medium">{selectedDsr.subjectName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Email
                    </p>
                    <p className="font-medium">{selectedDsr.subjectEmail}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      SLA Deadline
                    </p>
                    <p
                      className={`font-medium ${selectedDsr.slaBreached ? "text-c-danger" : ""}`}
                    >
                      {formatDate(selectedDsr.slaDeadline)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Status
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${dsrStatusColor(selectedDsr.status)}`}
                    >
                      {selectedDsr.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Description
                  </p>
                  <p className="text-sm bg-muted/30 rounded-md p-3">
                    {selectedDsr.description}
                  </p>
                </div>

                {selectedDsr.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Notes
                    </p>
                    <p className="text-sm bg-muted/30 rounded-md p-3">
                      {selectedDsr.notes}
                    </p>
                  </div>
                )}

                {/* Actions based on request type and status */}
                <div className="flex gap-2 pt-2 border-t">
                  {selectedDsr.requestType === "ACCESS" &&
                    selectedDsr.status !== "COMPLETED" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleDsrAction(selectedDsr.id, "compile")
                        }
                        disabled={actionLoading}
                      >
                        Compile Data Package
                      </Button>
                    )}
                  {selectedDsr.status === "RECEIVED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleDsrAction(selectedDsr.id, "IN_PROGRESS")
                      }
                      disabled={actionLoading}
                    >
                      Begin Processing
                    </Button>
                  )}
                  {selectedDsr.status === "IN_PROGRESS" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        handleDsrAction(selectedDsr.id, "COMPLETED")
                      }
                      disabled={actionLoading}
                    >
                      Mark Complete
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create DSR Dialog ──────────────────────────────── */}
      <Dialog open={showCreateDsr} onOpenChange={setShowCreateDsr}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Data Subject Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium">Request Type</label>
              <div className="flex gap-2 mt-1">
                {["ACCESS", "CORRECTION", "DELETION"].map((type) => (
                  <Button
                    key={type}
                    variant={dsrType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDsrType(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Subject Name</label>
              <input
                type="text"
                value={dsrName}
                onChange={(e) => setDsrName(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                placeholder="Full name of data subject"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Subject Email</label>
              <input
                type="email"
                value={dsrEmail}
                onChange={(e) => setDsrEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                placeholder="Email address"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={dsrDescription}
                onChange={(e) => setDsrDescription(e.target.value)}
                placeholder="Describe the request..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCreateDsr(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDsr}
                disabled={
                  actionLoading || !dsrName || !dsrEmail || !dsrDescription
                }
              >
                {actionLoading ? "Creating..." : "Create Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Disposal Dialog ────────────────────────── */}
      <Dialog
        open={showConfirmDisposal}
        onOpenChange={setShowConfirmDisposal}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-c-danger">
              <AlertTriangle className="h-5 w-5" />
              Confirm Data Disposal
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="bg-c-danger-soft border border-c-danger/20 rounded-md p-4">
              <p className="text-sm text-c-danger font-medium">
                This action is irreversible.
              </p>
              <p className="text-xs text-c-danger mt-1">
                All data in this disposal batch will be permanently destroyed
                via cryptographic shredding. Encryption keys will be deleted,
                making all encrypted data irrecoverable.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDisposal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={actionLoading}
                onClick={async () => {
                  // This would call the disposal execution API
                  setShowConfirmDisposal(false)
                  setDisposalToConfirm(null)
                }}
              >
                {actionLoading
                  ? "Processing..."
                  : "Confirm Permanent Disposal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
