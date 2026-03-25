import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { calculateComplianceScore } from "@/lib/compliance/score-calculator"
import { generateRiskRegister } from "@/lib/compliance/risk-register"
import { generateRACIMatrix } from "@/lib/compliance/raci-generator"
import { getSystemVendors } from "@/lib/compliance/vendor-inventory"
import { detectSODConflicts } from "@/lib/compliance/sod-detector"

/**
 * GET /api/admin/compliance-export
 *
 * Generates a comprehensive compliance report for auditors.
 * Admin-only endpoint. Returns JSON with all compliance data
 * organized for SOC 2 audit evidence packages.
 */
export async function GET() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    // ── 1. Controls with health check results ──
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

    // ── 2. Calculate overall compliance score ──
    const scoreInput = controls.map((c) => ({
      controlId: c.controlId,
      tsc: c.tsc,
      status: c.status as
        | "COMPLIANT"
        | "PARTIALLY_COMPLIANT"
        | "NON_COMPLIANT"
        | "NOT_ASSESSED",
    }))
    const complianceScore = calculateComplianceScore(scoreInput)

    // ── 3. Executive summary ──
    const controlsByStatus = {
      COMPLIANT: controls.filter((c) => c.status === "COMPLIANT").length,
      PARTIALLY_COMPLIANT: controls.filter(
        (c) => c.status === "PARTIALLY_COMPLIANT"
      ).length,
      NON_COMPLIANT: controls.filter((c) => c.status === "NON_COMPLIANT")
        .length,
      NOT_ASSESSED: controls.filter((c) => c.status === "NOT_ASSESSED").length,
    }

    const allIssues = await prisma.complianceIssue.findMany({
      include: { control: { select: { controlId: true } } },
      orderBy: { createdAt: "desc" },
    })

    const issuesBySeverity = {
      CRITICAL: allIssues.filter((i) => i.severity === "CRITICAL").length,
      HIGH: allIssues.filter((i) => i.severity === "HIGH").length,
      MEDIUM: allIssues.filter((i) => i.severity === "MEDIUM").length,
      LOW: allIssues.filter((i) => i.severity === "LOW").length,
    }

    // ── 4. Control matrix ──
    const controlMatrix = controls.map((c) => ({
      controlId: c.controlId,
      tsc: c.tsc,
      controlFamily: c.controlFamily,
      description: c.description,
      status: c.status,
      monitoringMethod: c.monitoringMethod,
      lastEvidenceCollected: c.lastEvidenceCollected,
      healthChecks: c.healthChecks.map((hc) => ({
        checkType: hc.checkType,
        interval: hc.interval,
        lastRun: hc.lastRun,
        lastResult: hc.lastResult,
        recentResults: hc.results.map((r) => ({
          timestamp: r.timestamp,
          status: r.status,
          details: r.details,
        })),
      })),
      issueCount: c.issues.length,
      openIssues: c.issues.filter(
        (i) => i.status === "OPEN" || i.status === "IN_PROGRESS"
      ).length,
      evidenceCount: c.evidence.length,
    }))

    // ── 5. Evidence index ──
    const evidenceByControl: Record<
      string,
      Array<{
        id: string
        evidenceType: string
        collectedAt: Date
        collector: string
        validUntil: Date | null
      }>
    > = {}
    for (const control of controls) {
      evidenceByControl[control.controlId] = control.evidence.map((e) => ({
        id: e.id,
        evidenceType: e.evidenceType,
        collectedAt: e.collectedAt,
        collector: e.collector,
        validUntil: e.validUntil,
      }))
    }

    // ── 6. Issue log ──
    const issueLog = allIssues.map((i) => ({
      id: i.id,
      controlId: i.control.controlId,
      severity: i.severity,
      status: i.status,
      description: i.description,
      remediationPlan: i.remediationPlan,
      ownerId: i.ownerId,
      slaDeadline: i.slaDeadline,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt,
      slaBreached: i.slaDeadline
        ? new Date(i.slaDeadline) < new Date() &&
          i.status !== "CLOSED" &&
          i.status !== "VERIFIED"
        : false,
    }))

    // ── 7. Risk register ──
    const riskRegister = generateRiskRegister()

    // ── 8. RACI matrix ──
    const raciMatrix = generateRACIMatrix()

    // ── 9. Policy acknowledgment status ──
    const policies = await prisma.compliancePolicy.findMany({
      where: { isActive: true },
      include: {
        acknowledgments: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    })
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
    })

    const policyAcknowledgmentStatus = policies.map((policy) => {
      const acknowledgedUserIds = Array.from(
        new Set(
          policy.acknowledgments
            .filter((a) => a.version === policy.version)
            .map((a) => a.userId)
        )
      )
      const pendingUsers = allUsers.filter(
        (u) => !acknowledgedUserIds.includes(u.id)
      )
      return {
        policyId: policy.id,
        slug: policy.slug,
        title: policy.title,
        version: policy.version,
        totalUsers: allUsers.length,
        acknowledged: acknowledgedUserIds.length,
        pending: pendingUsers.length,
        pendingUsers: pendingUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        })),
      }
    })

    // ── 10. Training completion status ──
    const trainings = await prisma.securityTraining.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    })
    const requiredModules = [
      "data-handling",
      "phishing-awareness",
      "incident-reporting",
      "client-confidentiality",
    ]
    const trainingStatus = allUsers.map((user) => {
      const userTrainings = trainings.filter((t) => t.userId === user.id)
      const moduleStatus = requiredModules.map((moduleId) => {
        const completed = userTrainings.find(
          (t) => t.moduleId === moduleId && t.passed
        )
        return {
          moduleId,
          completed: !!completed,
          completedAt: completed?.completedAt || null,
          score: completed?.score || null,
        }
      })
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        modules: moduleStatus,
        completionRate:
          moduleStatus.filter((m) => m.completed).length /
          requiredModules.length,
      }
    })

    // ── 11. Vendor compliance ──
    const vendorRecords = await prisma.vendorRecord.findMany({
      orderBy: { name: "asc" },
    })
    const systemVendors = getSystemVendors()
    const vendorCompliance = vendorRecords.map((v) => {
      const systemInfo = systemVendors.find((sv) => sv.name === v.name)
      return {
        id: v.id,
        name: v.name,
        service: v.service,
        dataShared: v.dataShared,
        integrationType: v.integrationType,
        riskLevel: v.riskLevel,
        soc2ReportDate: v.soc2ReportDate,
        soc2ExpiryDate: v.soc2ExpiryDate,
        soc2Status: v.soc2ExpiryDate
          ? new Date(v.soc2ExpiryDate) < new Date()
            ? "EXPIRED"
            : "CURRENT"
          : "MISSING",
        dpaStatus: v.dpaStatus,
        lastAssessmentDate: v.lastAssessmentDate,
        systemMatch: !!systemInfo,
      }
    })

    // ── 12. Incident history ──
    const incidents = await prisma.incidentRecord.findMany({
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { detectedAt: "desc" },
    })
    const incidentHistory = incidents.map((inc) => ({
      id: inc.id,
      title: inc.title,
      severity: inc.severity,
      status: inc.status,
      classification: inc.classification,
      detectedAt: inc.detectedAt,
      detectedBy: inc.detectedBy,
      assignedTo: inc.assignedTo
        ? { name: inc.assignedTo.name, email: inc.assignedTo.email }
        : null,
      resolvedAt: inc.resolvedAt,
      rootCause: inc.rootCause,
      affectedClients: inc.affectedClients,
      resolutionTimeHours: inc.resolvedAt
        ? Math.round(
            (new Date(inc.resolvedAt).getTime() -
              new Date(inc.detectedAt).getTime()) /
              3600000
          )
        : null,
    }))

    // ── 13. Separation of duties conflicts ──
    const sodConflicts = await detectSODConflicts()

    // ── Assemble report ──
    const report = {
      generatedAt: new Date().toISOString(),
      generatedBy: { name: auth.name, email: auth.email },
      executiveSummary: {
        overallScore: complianceScore.overall,
        scoreByTsc: complianceScore.byTsc,
        controlsByStatus,
        issuesBySeverity,
        totalControls: controls.length,
        totalEvidence: controls.reduce(
          (sum, c) => sum + c.evidence.length,
          0
        ),
        totalIssues: allIssues.length,
        openIssues: allIssues.filter(
          (i) => i.status === "OPEN" || i.status === "IN_PROGRESS"
        ).length,
        slaBreaches: issueLog.filter((i) => i.slaBreached).length,
      },
      controlMatrix,
      evidenceIndex: evidenceByControl,
      issueLog,
      riskRegister,
      raciMatrix,
      policyAcknowledgmentStatus,
      trainingCompletionStatus: trainingStatus,
      vendorCompliance,
      incidentHistory,
      sodConflicts,
    }

    await logAudit({
      userId: auth.userId,
      action: "COMPLIANCE_EXPORT_GENERATED",
      metadata: {
        controlCount: controls.length,
        evidenceCount: report.executiveSummary.totalEvidence,
        issueCount: allIssues.length,
        overallScore: complianceScore.overall,
      },
    })

    return NextResponse.json(report)
  } catch (error: any) {
    console.error("[compliance-export] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate compliance export", details: error.message },
      { status: 500 }
    )
  }
}
