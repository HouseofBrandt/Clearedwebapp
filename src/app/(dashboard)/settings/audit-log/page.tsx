import { requireRole } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { formatDateTime } from "@/lib/date-utils"
import { AUDIT_ACTIONS } from "@/lib/ai/audit"
import { Card } from "@/components/ui/card"
import { ScrollText } from "lucide-react"

const ACTION_GROUPS: Record<string, string[]> = {
  Auth: ["LOGIN_SUCCESS", "LOGIN_FAILURE", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET"],
  Cases: ["CASE_CREATED", "CASE_UPDATED", "CASE_DELETED", "CASE_VIEWED", "CASE_STATUS_CHANGED"],
  Documents: ["DOCUMENT_UPLOADED", "DOCUMENT_VIEWED", "DOCUMENT_DOWNLOADED", "DOCUMENT_DELETED"],
  AI: ["AI_REQUEST", "AI_COMPLETED", "AI_FAILED"],
  Review: ["REVIEW_APPROVE", "REVIEW_REJECT_REPROMPT", "REVIEW_REJECT_MANUAL", "REVIEW_EDIT_APPROVE", "REVIEW_APPROVED", "REVIEW_REJECTED"],
  Export: ["DELIVERABLE_EXPORTED", "MESSAGES_EXPORTED"],
  Users: ["USER_CREATED", "USER_UPDATED", "USER_DEACTIVATED", "USER_ROLE_CHANGED"],
  "Knowledge Base": ["KB_DOCUMENT_UPLOADED", "KB_DOCUMENT_DELETED", "KB_OUTPUT_ADDED"],
  Deadlines: ["DEADLINE_CREATED", "DEADLINE_UPDATED", "DEADLINE_DELETED"],
  Messages: ["MESSAGE_SENT", "BUG_REPORT_SUBMITTED", "FEATURE_REQUEST_SUBMITTED"],
}

const AI_ACTIONS = new Set(["AI_REQUEST", "AI_COMPLETED", "AI_FAILED"])
const SECURITY_ACTIONS = new Set(["LOGIN_FAILURE", "LOGIN_SUCCESS", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET", "USER_DEACTIVATED", "USER_ROLE_CHANGED"])

function getActionBadgeColor(action: string): string {
  if (action.includes("LOGIN_FAILURE") || action.includes("DELETE") || action.includes("REJECT")) return "bg-c-danger-soft text-c-danger"
  if (action.includes("CREATED") || action.includes("APPROVE") || action.includes("LOGIN_SUCCESS")) return "bg-c-success-soft text-c-success"
  if (action.includes("EXPORT") || action.includes("DOWNLOAD")) return "bg-c-info-soft text-c-teal"
  if (action.includes("VIEW")) return "bg-c-gray-100 text-c-gray-500"
  return "bg-c-warning-soft text-c-warning"
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { action?: string; user?: string; case?: string; from?: string; page?: string; q?: string }
}) {
  await requireRole(["ADMIN"])

  const page = parseInt(searchParams.page || "1")
  const pageSize = 50
  const actionFilter = searchParams.action
  const userFilter = searchParams.user
  const caseFilter = searchParams.case
  const dateFrom = searchParams.from
  const searchQuery = searchParams.q

  const where: any = {}
  if (actionFilter) where.action = actionFilter
  if (userFilter) where.practitionerId = userFilter
  if (caseFilter) where.caseId = caseFilter
  if (dateFrom) where.timestamp = { gte: new Date(dateFrom) }

  const [logs, total, users, allLogsForStats] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        practitioner: { select: { name: true, email: true } },
        case: { select: { tabsNumber: true } },
      },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Fetch summary stats from filtered results (without pagination)
    prisma.auditLog.findMany({
      where,
      select: {
        action: true,
        practitionerId: true,
      },
    }),
  ])

  // Compute summary stats
  const totalCount = allLogsForStats.length
  const aiCount = allLogsForStats.filter(l => AI_ACTIONS.has(l.action)).length
  const securityCount = allLogsForStats.filter(l => SECURITY_ACTIONS.has(l.action)).length
  const uniqueUsers = new Set(allLogsForStats.map(l => l.practitionerId).filter(Boolean)).size

  // Apply text search filter on the current page results
  const filteredLogs = searchQuery
    ? logs.filter(log => {
        const meta = (log.metadata as any) || {}
        const details = Object.entries(meta)
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join(", ")
        const searchLower = searchQuery.toLowerCase()
        return (
          log.action.toLowerCase().includes(searchLower) ||
          (log.practitioner?.name || "").toLowerCase().includes(searchLower) ||
          (log.practitioner?.email || "").toLowerCase().includes(searchLower) ||
          details.toLowerCase().includes(searchLower) ||
          ((log.case as any)?.tabsNumber || "").toLowerCase().includes(searchLower)
        )
      })
    : logs

  const totalPages = Math.ceil(total / pageSize)

  // Build query string helper for pagination links
  function buildQs(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams()
    if (overrides.page) params.set("page", overrides.page)
    else if (searchParams.page) params.set("page", searchParams.page)
    if (actionFilter) params.set("action", actionFilter)
    if (userFilter) params.set("user", userFilter)
    if (dateFrom) params.set("from", dateFrom)
    if (searchQuery) params.set("q", searchQuery)
    // Apply overrides
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) params.set(k, v)
      else params.delete(k)
    }
    return params.toString()
  }

  const hasFilters = actionFilter || userFilter || caseFilter || dateFrom || searchQuery

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-display-md">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          SOC 2 compliance — all security-relevant events. {total} total entries.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Entries</div>
          <div className="text-2xl font-medium">{totalCount.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">AI Requests</div>
          <div className="text-2xl font-medium text-c-teal">{aiCount.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Security Events</div>
          <div className="text-2xl font-medium text-c-warning">{securityCount.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Users Active</div>
          <div className="text-2xl font-medium">{uniqueUsers}</div>
        </Card>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <input
            type="text"
            name="q"
            defaultValue={searchQuery || ""}
            placeholder="Search logs..."
            className="block w-48 rounded-md border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground/60"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Action</label>
          <select name="action" defaultValue={actionFilter || ""} className="block w-48 rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">All actions</option>
            {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
              <optgroup key={group} label={group}>
                {actions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">User</label>
          <select name="user" defaultValue={userFilter || ""} className="block w-40 rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">All users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Since</label>
          <input type="date" name="from" defaultValue={dateFrom || ""} className="block rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Filter
        </button>
        {hasFilters && (
          <a href="/settings/audit-log" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Timestamp</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">User</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Case</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredLogs.map(log => {
              const meta = (log.metadata as any) || {}
              const details = Object.entries(meta)
                .filter(([k]) => !["timestamp", "resourceType", "ipAddress", "resourceId"].includes(k))
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(", ")

              return (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {log.practitioner?.name || meta.email || "System"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getActionBadgeColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {log.case?.tabsNumber || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-md truncate" title={details}>
                    {details || "—"}
                    {meta.ipAddress && meta.ipAddress !== "unknown" && (
                      <span className="ml-2 opacity-50">IP: {meta.ipAddress}</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8">
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ScrollText className="h-12 w-12 text-c-gray-300 mb-4" />
                    <h3 className="text-sm font-medium text-c-gray-900">No matching audit entries</h3>
                    <p className="text-sm text-c-gray-500 mt-1">Try adjusting your filters or selecting a different time range.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({total} entries)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`/settings/audit-log?${buildQs({ page: String(page - 1) })}`}
                className="rounded-md border px-3 py-1 hover:bg-muted">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={`/settings/audit-log?${buildQs({ page: String(page + 1) })}`}
                className="rounded-md border px-3 py-1 hover:bg-muted">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
