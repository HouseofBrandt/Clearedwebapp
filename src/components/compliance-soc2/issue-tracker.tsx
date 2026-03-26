"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle2,
  Filter,
} from "lucide-react"

interface ComplianceIssue {
  id: string
  controlId: string
  severity: string
  status: string
  description: string
  remediationPlan: string | null
  ownerId: string | null
  slaDeadline: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  control: {
    controlId: string
    description: string
    tsc: string
  }
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-c-danger-soft text-c-danger border-c-danger/20",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
  LOW: "bg-c-info-soft text-c-teal border-c-teal/20",
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-c-danger-soft text-c-danger",
  IN_PROGRESS: "bg-c-info-soft text-c-teal",
  IMPLEMENTED: "bg-purple-100 text-purple-800",
  VERIFIED: "bg-c-success-soft text-c-success",
  CLOSED: "bg-c-gray-100 text-c-gray-900",
  ACCEPTED_RISK: "bg-c-warning-soft text-c-warning",
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "ACCEPTED_RISK"],
  IN_PROGRESS: ["IMPLEMENTED", "OPEN"],
  IMPLEMENTED: ["VERIFIED", "IN_PROGRESS"],
  VERIFIED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["OPEN"],
  ACCEPTED_RISK: ["OPEN"],
}

function getSlaCountdown(slaDeadline: string | null): {
  text: string
  isOverdue: boolean
} {
  if (!slaDeadline) return { text: "No SLA", isOverdue: false }
  const now = new Date()
  const deadline = new Date(slaDeadline)
  const diffMs = deadline.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true }
  }
  if (diffDays === 0) {
    return { text: "Due today", isOverdue: false }
  }
  return { text: `${diffDays}d remaining`, isOverdue: false }
}

export function IssueTracker() {
  const [issues, setIssues] = useState<ComplianceIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const fetchIssues = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (severityFilter !== "all") params.set("severity", severityFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const res = await fetch(`/api/compliance/issues?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setIssues(data)
      }
    } catch (err) {
      console.error("Failed to fetch issues:", err)
    } finally {
      setLoading(false)
    }
  }, [severityFilter, statusFilter])

  useEffect(() => {
    fetchIssues()
  }, [fetchIssues])

  const updateStatus = async (issueId: string, newStatus: string) => {
    setUpdating(issueId)
    try {
      const res = await fetch("/api/compliance/issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, status: newStatus }),
      })
      if (res.ok) {
        await fetchIssues()
      } else {
        const data = await res.json()
        console.error("Failed to update:", data.error)
      }
    } catch (err) {
      console.error("Failed to update issue:", err)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Severity:</span>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="IMPLEMENTED">Implemented</SelectItem>
                  <SelectItem value="VERIFIED">Verified</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="ACCEPTED_RISK">Accepted Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground ml-auto">
              {issues.length} issue{issues.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Issue List */}
      {issues.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-c-success mx-auto mb-3" />
            <p className="text-muted-foreground">
              No issues match the current filters
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const sla = getSlaCountdown(issue.slaDeadline)
            const transitions = STATUS_TRANSITIONS[issue.status] || []
            const isUpdating = updating === issue.id

            return (
              <Card key={issue.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    {/* Severity Badge */}
                    <Badge
                      className={`text-xs shrink-0 ${
                        SEVERITY_COLORS[issue.severity] || ""
                      }`}
                    >
                      {issue.severity}
                    </Badge>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">
                            {issue.description}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Control: {issue.control.controlId} &mdash;{" "}
                            {issue.control.description} ({issue.control.tsc})
                          </p>
                        </div>
                        <Badge
                          className={`text-xs shrink-0 ${
                            STATUS_COLORS[issue.status] || ""
                          }`}
                        >
                          {issue.status.replace("_", " ")}
                        </Badge>
                      </div>

                      {issue.remediationPlan && (
                        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          <span className="font-medium">Remediation:</span>{" "}
                          {issue.remediationPlan}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created:{" "}
                            {new Date(issue.createdAt).toLocaleDateString()}
                          </span>
                          {issue.slaDeadline && (
                            <span
                              className={`flex items-center gap-1 ${
                                sla.isOverdue
                                  ? "text-c-danger font-medium"
                                  : ""
                              }`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              SLA: {sla.text}
                            </span>
                          )}
                        </div>

                        {/* Status Flow Buttons */}
                        <div className="flex items-center gap-1">
                          {transitions.map((nextStatus) => (
                            <Button
                              key={nextStatus}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              disabled={isUpdating}
                              onClick={() =>
                                updateStatus(issue.id, nextStatus)
                              }
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  {nextStatus.replace("_", " ")}
                                </>
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
