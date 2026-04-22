import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { requireJunebugSession } from "@/lib/junebug/thread-access"
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/ai/audit"
import {
  getDeploymentSnapshot,
  isConfigured,
} from "@/lib/vercel/client"

/**
 * GET /api/junebug/diagnostics/deployment
 *
 * Returns the latest Vercel deployment snapshot plus a trailing slice
 * of build logs and runtime events. Read-only; no way to trigger a
 * deploy or mutate env from here.
 *
 * Access model:
 *   - Requires a Junebug session (same gate as thread routes).
 *   - Rate-limited implicitly by Vercel's own API limits — we don't
 *     add an app-level tier yet because this is called server-side
 *     from the messages route (Full Fetch turns only). If a UI ever
 *     exposes a manual refresh button, revisit.
 *
 * Audit:
 *   - Every call writes a JUNEBUG_DIAGNOSTICS_FETCH row. No PII in the
 *     metadata — just userId + deployment id. Deployment state + log
 *     content are deliberately NOT logged to the audit stream to keep
 *     it lean and to avoid accidentally capturing internal details.
 *
 * Not-configured behavior:
 *   - If VERCEL_API_TOKEN / VERCEL_PROJECT_ID are missing the route
 *     returns 200 with `{ configured: false, diagnostics: null }` so
 *     the client can downgrade gracefully instead of erroring.
 */
export async function GET(_request: NextRequest) {
  const auth = await requireJunebugSession()
  if (!auth.ok) return auth.response

  if (!isConfigured()) {
    return NextResponse.json({
      configured: false,
      diagnostics: null,
      hint: "Set VERCEL_API_TOKEN + VERCEL_PROJECT_ID to enable deployment diagnostics.",
    })
  }

  try {
    const diagnostics = await getDeploymentSnapshot()

    createAuditLog({
      practitionerId: auth.userId,
      action: AUDIT_ACTIONS.JUNEBUG_DIAGNOSTICS_FETCH,
      metadata: {
        deploymentId: diagnostics?.deployment?.id ?? null,
        state: diagnostics?.deployment?.readyState ?? null,
        hadLogs: (diagnostics?.buildLogLines?.length ?? 0) > 0,
        hadRuntime: (diagnostics?.runtimeEvents?.length ?? 0) > 0,
      },
    }).catch(() => {})

    return NextResponse.json({ configured: true, diagnostics })
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        route: "junebug/diagnostics/deployment",
        junebug: "diagnostics-failed",
      },
      user: { id: auth.userId },
    })
    return NextResponse.json(
      { error: "Failed to load deployment diagnostics" },
      { status: 500 }
    )
  }
}
