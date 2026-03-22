import { requireRole } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { formatDateTime } from "@/lib/date-utils"
import { AUDIT_ACTIONS } from "@/lib/ai/audit"

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

function getActionBadgeColor(action: string): string {
  if (action.includes("LOGIN_FAILURE") || action.includes("DELETE") || action.includes("REJECT")) return "bg-red-100 text-red-700"
  if (action.includes("CREATED") || action.includes("APPROVE") || action.includes("LOGIN_SUCCESS")) return "bg-green-100 text-green-700"
  if (action.includes("EXPORT") || action.includes("DOWNLOAD")) return "bg-blue-100 text-blue-700"
  if (action.includes("VIEW")) return "bg-gray-100 text-gray-600"
  return "bg-amber-100 text-amber-700"
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { action?: string; user?: string; case?: string; from?: string; page?: string }
}) {
  await requireRole(["ADMIN"])

  const page = parseInt(searchParams.page || "1")
  const pageSize = 50
  const actionFilter = searchParams.action
  const userFilter = searchParams.user
  const caseFilter = searchParams.case
  const dateFrom = searchParams.from

  const where: any = {}
  if (actionFilter) where.action = actionFilter
  if (userFilter) where.practitionerId = userFilter
  if (caseFilter) where.caseId = caseFilter
  if (dateFrom) where.timestamp = { gte: new Date(dateFrom) }

  const [logs, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        practitioner: { select: { name: true, email: true } },
        case: { select: { caseNumber: true } },
      },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          SOC 2 compliance — all security-relevant events. {total} total entries.
        </p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3 items-end">
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
        {(actionFilter || userFilter || caseFilter || dateFrom) && (
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
            {logs.map(log => {
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
                    {log.case?.caseNumber || "—"}
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
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No audit log entries found.
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
              <a href={`/settings/audit-log?page=${page - 1}${actionFilter ? `&action=${actionFilter}` : ""}${userFilter ? `&user=${userFilter}` : ""}${dateFrom ? `&from=${dateFrom}` : ""}`}
                className="rounded-md border px-3 py-1 hover:bg-muted">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={`/settings/audit-log?page=${page + 1}${actionFilter ? `&action=${actionFilter}` : ""}${userFilter ? `&user=${userFilter}` : ""}${dateFrom ? `&from=${dateFrom}` : ""}`}
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
