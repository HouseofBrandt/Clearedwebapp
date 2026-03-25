import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { calculateComplianceScore } from "@/lib/compliance/score-calculator"

export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    // Fetch all controls with related data
    const controls = await prisma.complianceControl.findMany({
      include: {
        healthChecks: {
          include: {
            results: {
              orderBy: { timestamp: "desc" },
              take: 5,
            },
          },
        },
        issues: true,
        evidence: {
          orderBy: { collectedAt: "desc" },
        },
      },
      orderBy: { controlId: "asc" },
    })

    // 1. Compliance Score
    const scores = calculateComplianceScore(controls)

    // 2. Executive Summary
    const openIssues = controls.flatMap((c) =>
      c.issues.filter((i) => !["CLOSED", "ACCEPTED_RISK"].includes(i.status))
    )
    const criticalIssues = openIssues.filter((i) => i.severity === "CRITICAL")
    const highIssues = openIssues.filter((i) => i.severity === "HIGH")

    const controlsByStatus = {
      compliant: controls.filter((c) => c.status === "COMPLIANT").length,
      partiallyCompliant: controls.filter((c) => c.status === "PARTIALLY_COMPLIANT").length,
      nonCompliant: controls.filter((c) => c.status === "NON_COMPLIANT").length,
      notAssessed: controls.filter((c) => c.status === "NOT_ASSESSED").length,
    }

    const executiveSummary = {
      overallScore: scores.overall,
      totalControls: controls.length,
      controlsByStatus,
      openIssueCount: openIssues.length,
      criticalIssueCount: criticalIssues.length,
      highIssueCount: highIssues.length,
      assessmentDate: new Date().toISOString(),
    }

    // 3. Control Matrix
    const controlMatrix = Object.entries(scores.byTsc).map(([tsc, data]) => {
      const tscControls = controls.filter((c) => c.tsc === tsc)
      return {
        tsc,
        score: data.score,
        total: data.total,
        passing: data.passing,
        controls: tscControls.map((c) => ({
          controlId: c.controlId,
          description: c.description,
          status: c.status,
          monitoringMethod: c.monitoringMethod,
          lastEvidenceCollected: c.lastEvidenceCollected,
          nextReviewDate: c.nextReviewDate,
          openIssueCount: c.issues.filter(
            (i) => !["CLOSED", "ACCEPTED_RISK"].includes(i.status)
          ).length,
        })),
      }
    })

    // 4. Evidence Index
    const now = new Date()
    const evidenceIndex = controls.map((c) => {
      const latestEvidence = c.evidence[0]
      const evidenceAge = latestEvidence
        ? Math.round(
            (now.getTime() - new Date(latestEvidence.collectedAt).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null

      return {
        controlId: c.controlId,
        description: c.description,
        totalEvidenceItems: c.evidence.length,
        latestCollected: latestEvidence?.collectedAt ?? null,
        evidenceAgeDays: evidenceAge,
        status:
          evidenceAge === null
            ? "missing"
            : evidenceAge <= 30
              ? "current"
              : evidenceAge <= 90
                ? "stale"
                : "expired",
      }
    })

    const evidenceSummary = {
      current: evidenceIndex.filter((e) => e.status === "current").length,
      stale: evidenceIndex.filter((e) => e.status === "stale").length,
      expired: evidenceIndex.filter((e) => e.status === "expired").length,
      missing: evidenceIndex.filter((e) => e.status === "missing").length,
    }

    // 5. Issue Log
    const allIssues = controls.flatMap((c) =>
      c.issues.map((issue) => ({
        id: issue.id,
        controlId: c.controlId,
        controlDescription: c.description,
        tsc: c.tsc,
        severity: issue.severity,
        status: issue.status,
        description: issue.description,
        remediationPlan: issue.remediationPlan,
        slaDeadline: issue.slaDeadline,
        createdAt: issue.createdAt,
        resolvedAt: issue.resolvedAt,
        slaStatus: issue.slaDeadline
          ? new Date(issue.slaDeadline) < now &&
            !["CLOSED", "ACCEPTED_RISK", "VERIFIED"].includes(issue.status)
            ? "overdue"
            : "on_track"
          : "no_sla",
      }))
    )

    // 6. Trend Analysis — based on health check history
    const trendData: Record<string, { date: string; pass: number; fail: number; warning: number }[]> = {}
    for (const control of controls) {
      for (const hc of control.healthChecks) {
        for (const result of hc.results) {
          const dateKey = new Date(result.timestamp).toISOString().split("T")[0]
          if (!trendData[dateKey]) {
            trendData[dateKey] = []
          }
          trendData[dateKey].push({
            date: dateKey,
            pass: result.status === "pass" ? 1 : 0,
            fail: result.status === "fail" ? 1 : 0,
            warning: result.status === "warning" ? 1 : 0,
          })
        }
      }
    }

    const trendAnalysis = Object.entries(trendData)
      .map(([date, entries]) => ({
        date,
        pass: entries.reduce((s, e) => s + e.pass, 0),
        fail: entries.reduce((s, e) => s + e.fail, 0),
        warning: entries.reduce((s, e) => s + e.warning, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // 7. Readiness Assessment
    const readinessFactors = [
      {
        factor: "Control Coverage",
        score:
          controlsByStatus.notAssessed === 0
            ? 100
            : Math.round(
                ((controls.length - controlsByStatus.notAssessed) /
                  controls.length) *
                  100
              ),
        status:
          controlsByStatus.notAssessed === 0
            ? "ready"
            : controlsByStatus.notAssessed <= 5
              ? "needs_attention"
              : "not_ready",
        detail: `${controlsByStatus.notAssessed} controls not yet assessed`,
      },
      {
        factor: "Critical Issues",
        score: criticalIssues.length === 0 ? 100 : 0,
        status: criticalIssues.length === 0 ? "ready" : "not_ready",
        detail: `${criticalIssues.length} critical issues open`,
      },
      {
        factor: "Evidence Collection",
        score:
          evidenceSummary.missing === 0
            ? evidenceSummary.expired === 0
              ? 100
              : 50
            : Math.round(
                ((controls.length - evidenceSummary.missing) /
                  controls.length) *
                  100
              ),
        status:
          evidenceSummary.missing === 0 && evidenceSummary.expired === 0
            ? "ready"
            : evidenceSummary.missing <= 5
              ? "needs_attention"
              : "not_ready",
        detail: `${evidenceSummary.missing} controls missing evidence, ${evidenceSummary.expired} expired`,
      },
      {
        factor: "Issue Resolution",
        score:
          openIssues.length === 0
            ? 100
            : Math.round(
                ((allIssues.length - openIssues.length) / allIssues.length) *
                  100
              ) || 0,
        status:
          openIssues.length === 0
            ? "ready"
            : openIssues.length <= 5
              ? "needs_attention"
              : "not_ready",
        detail: `${openIssues.length} issues still open`,
      },
    ]

    const overallReadiness =
      readinessFactors.every((f) => f.status === "ready")
        ? "AUDIT_READY"
        : readinessFactors.some((f) => f.status === "not_ready")
          ? "NOT_READY"
          : "NEEDS_ATTENTION"

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      executiveSummary,
      controlMatrix,
      evidenceIndex: {
        summary: evidenceSummary,
        controls: evidenceIndex,
      },
      issueLog: {
        total: allIssues.length,
        open: openIssues.length,
        issues: allIssues,
      },
      trendAnalysis,
      readinessAssessment: {
        overall: overallReadiness,
        overallScore: scores.overall,
        factors: readinessFactors,
      },
    })
  } catch (error: any) {
    console.error("[compliance/report GET] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate report", details: error.message },
      { status: 500 }
    )
  }
}
