import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"

interface HealthCheckOutput {
  name: string
  controlId: string
  status: "pass" | "fail" | "warning"
  details: Record<string, any>
}

export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  try {
    const checks: HealthCheckOutput[] = []

    // 1. MFA Enrollment Check (CC6.2)
    const totalUsers = await prisma.user.count()
    const mfaEnabledUsers = await prisma.user.count({
      where: { mfaEnabled: true },
    })
    const mfaRate = totalUsers > 0 ? mfaEnabledUsers / totalUsers : 0
    checks.push({
      name: "MFA Enrollment Rate",
      controlId: "CC6.2",
      status: mfaRate >= 0.9 ? "pass" : mfaRate >= 0.5 ? "warning" : "fail",
      details: {
        totalUsers,
        mfaEnabled: mfaEnabledUsers,
        enrollmentRate: Math.round(mfaRate * 100),
        threshold: "90% for pass, 50% for warning",
      },
    })

    // 2. Inactive Accounts Check (CC6.5)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
    })

    const inactiveUsers: { id: string; email: string; name: string }[] = []
    for (const user of allUsers) {
      const recentActivity = await prisma.auditLog.findFirst({
        where: {
          practitionerId: user.id,
          timestamp: { gte: ninetyDaysAgo },
        },
      })
      if (!recentActivity) {
        inactiveUsers.push(user)
      }
    }

    checks.push({
      name: "Inactive Account Detection",
      controlId: "CC6.5",
      status: inactiveUsers.length === 0 ? "pass" : "warning",
      details: {
        inactiveCount: inactiveUsers.length,
        totalUsers: allUsers.length,
        inactiveAccounts: inactiveUsers.map((u) => ({
          name: u.name,
          email: u.email,
        })),
        threshold: "No accounts inactive > 90 days",
      },
    })

    // 3. AI Audit Log Integrity Check (PI1.1)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const aiTasksLast30Days = await prisma.aITask.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    })

    const aiAuditLogsLast30Days = await prisma.auditLog.count({
      where: {
        action: "AI_REQUEST",
        timestamp: { gte: thirtyDaysAgo },
      },
    })

    const auditGap = aiTasksLast30Days > 0
      ? Math.abs(aiTasksLast30Days - aiAuditLogsLast30Days)
      : 0
    const auditIntegrity = aiTasksLast30Days > 0
      ? auditGap === 0
        ? "pass" as const
        : auditGap <= 5
          ? "warning" as const
          : "fail" as const
      : "pass" as const

    checks.push({
      name: "AI Audit Log Integrity",
      controlId: "PI1.1",
      status: auditIntegrity,
      details: {
        aiTasksLast30Days,
        auditLogsLast30Days: aiAuditLogsLast30Days,
        gap: auditGap,
        note: auditGap > 0
          ? `${auditGap} AI tasks without corresponding audit log entries`
          : "All AI tasks have corresponding audit log entries",
      },
    })

    // 4. Encryption Status Check (P4.2)
    const encryptionKeySet = !!process.env.ENCRYPTION_KEY
    checks.push({
      name: "Encryption Configuration",
      controlId: "P4.2",
      status: encryptionKeySet ? "pass" : "fail",
      details: {
        encryptionKeyConfigured: encryptionKeySet,
        note: encryptionKeySet
          ? "ENCRYPTION_KEY environment variable is set"
          : "ENCRYPTION_KEY environment variable is NOT set — PII encryption is disabled",
      },
    })

    // 5. Deployment / Backup Freshness Check (A1.2)
    // Check for recent audit log entries indicating system activity as a proxy for backup freshness
    const lastSystemActivity = await prisma.auditLog.findFirst({
      orderBy: { timestamp: "desc" },
    })

    const lastActivityAge = lastSystemActivity
      ? Math.round(
          (Date.now() - new Date(lastSystemActivity.timestamp).getTime()) /
            (1000 * 60 * 60)
        )
      : null

    checks.push({
      name: "System Activity / Backup Freshness",
      controlId: "A1.2",
      status:
        lastActivityAge === null
          ? "warning"
          : lastActivityAge < 24
            ? "pass"
            : lastActivityAge < 72
              ? "warning"
              : "fail",
      details: {
        lastActivityTimestamp: lastSystemActivity?.timestamp ?? null,
        hoursAgo: lastActivityAge,
        note:
          lastActivityAge === null
            ? "No audit log entries found"
            : `Last system activity ${lastActivityAge} hours ago`,
      },
    })

    // Store results as HealthCheckResult records
    for (const check of checks) {
      // Find or create the HealthCheck record for this control
      const control = await prisma.complianceControl.findUnique({
        where: { controlId: check.controlId },
      })

      if (control) {
        let healthCheck = await prisma.healthCheck.findFirst({
          where: {
            controlId: control.id,
            checkType: "automated",
          },
        })

        if (!healthCheck) {
          healthCheck = await prisma.healthCheck.create({
            data: {
              controlId: control.id,
              checkType: "automated",
              interval: "daily",
            },
          })
        }

        // Update the health check
        await prisma.healthCheck.update({
          where: { id: healthCheck.id },
          data: {
            lastRun: new Date(),
            lastResult: check.status,
            nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
          },
        })

        // Create a result record
        await prisma.healthCheckResult.create({
          data: {
            healthCheckId: healthCheck.id,
            status: check.status,
            details: check.details,
            evidenceSnapshot: check.details,
          },
        })
      }
    }

    logAudit({
      userId: auth.userId,
      action: "COMPLIANCE_HEALTH_CHECK_RUN",
      metadata: {
        checksRun: checks.length,
        results: checks.map((c) => ({
          name: c.name,
          controlId: c.controlId,
          status: c.status,
        })),
      },
    })

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      checksRun: checks.length,
      summary: {
        pass: checks.filter((c) => c.status === "pass").length,
        warning: checks.filter((c) => c.status === "warning").length,
        fail: checks.filter((c) => c.status === "fail").length,
      },
      checks,
    })
  } catch (error: any) {
    console.error("[compliance/health POST] Error:", error)
    return NextResponse.json(
      { error: "Failed to run health checks", details: error.message },
      { status: 500 }
    )
  }
}
