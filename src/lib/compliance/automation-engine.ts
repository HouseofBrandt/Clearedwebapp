/**
 * Compliance Automation Engine — SOC 2 Orchestration Layer
 *
 * Central orchestration that runs all automated health checks,
 * collects evidence, updates control statuses, and auto-creates
 * issues when checks fail.
 */

import { prisma } from "@/lib/db"
import { generateRiskRegister } from "./risk-register"
import { generateRACIMatrix } from "./raci-generator"
import { getSystemVendors } from "./vendor-inventory"

export interface AutomationResult {
  checksRun: number
  issuesCreated: number
  evidenceCollected: number
  controlsUpdated: number
}

export interface CheckResult {
  status: "PASS" | "FAIL" | "WARNING"
  details: Record<string, any>
  evidence?: Record<string, any>
  severity?: string
  failureDescription?: string
  remediation?: string
}

/**
 * Run all automated compliance checks and update control statuses.
 */
export async function runComplianceAutomation(): Promise<AutomationResult> {
  let checksRun = 0
  let issuesCreated = 0
  let evidenceCollected = 0
  let controlsUpdated = 0

  const checks = await getAllAutomatedChecks()

  for (const check of checks) {
    try {
      const result = await executeCheck(check)
      checksRun++

      // Store health check result
      await prisma.healthCheckResult.create({
        data: {
          healthCheckId: check.id,
          status: result.status,
          details: result.details as any,
          evidenceSnapshot: result.evidence as any,
        },
      })

      // Update health check last run
      await prisma.healthCheck.update({
        where: { id: check.id },
        data: {
          lastRun: new Date(),
          lastResult: result.status,
          nextRun: computeNextRun(check.interval),
        },
      })

      // Auto-collect evidence
      if (result.evidence) {
        await prisma.evidenceItem.create({
          data: {
            controlId: check.controlId,
            evidenceType: "AUTOMATED_LOG",
            contentOrPath: JSON.stringify(result.evidence),
            collector: "system",
            validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
          },
        })
        evidenceCollected++
      }

      // Auto-create issue if check failed
      if (result.status === "FAIL") {
        const existingIssue = await prisma.complianceIssue.findFirst({
          where: {
            controlId: check.controlId,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        })
        if (!existingIssue) {
          await prisma.complianceIssue.create({
            data: {
              controlId: check.controlId,
              severity: (result.severity as any) || "MEDIUM",
              status: "OPEN",
              description:
                result.failureDescription ||
                `Automated check failed: ${check.checkType}`,
              remediationPlan: result.remediation || null,
              slaDeadline: computeSLADeadline(result.severity || "MEDIUM"),
            },
          })
          issuesCreated++
        }
      }

      // Update control status based on check results
      const controlStatus =
        result.status === "PASS"
          ? "COMPLIANT"
          : result.status === "WARNING"
            ? "PARTIALLY_COMPLIANT"
            : "NON_COMPLIANT"
      await prisma.complianceControl.update({
        where: { id: check.controlId },
        data: {
          status: controlStatus,
          lastEvidenceCollected: new Date(),
        },
      })
      controlsUpdated++
    } catch (err) {
      console.error(`[compliance-automation] Check ${check.id} failed:`, err)
    }
  }

  return { checksRun, issuesCreated, evidenceCollected, controlsUpdated }
}

/**
 * Execute a single automated check based on its type.
 */
async function executeCheck(check: any): Promise<CheckResult> {
  switch (check.checkType) {
    // CC1.1 - Policy acknowledgment compliance
    case "POLICY_ACKNOWLEDGMENT": {
      const policies = await prisma.compliancePolicy.findMany({
        where: { isActive: true },
      })
      const users = await prisma.user.findMany({ select: { id: true } })
      let compliant = 0
      let total = 0
      for (const policy of policies) {
        for (const user of users) {
          total++
          const ack = await prisma.policyAcknowledgment.findFirst({
            where: {
              policyId: policy.id,
              userId: user.id,
              version: policy.version,
            },
          })
          if (ack) compliant++
        }
      }
      const rate = total > 0 ? compliant / total : 1
      return {
        status: rate >= 0.95 ? "PASS" : rate >= 0.8 ? "WARNING" : "FAIL",
        details: {
          compliantCount: compliant,
          totalRequired: total,
          rate: Math.round(rate * 100),
        },
        evidence: {
          type: "policy_acknowledgment_status",
          rate,
          compliant,
          total,
          checkedAt: new Date().toISOString(),
        },
        severity: rate < 0.8 ? "HIGH" : "MEDIUM",
        failureDescription: `Only ${Math.round(rate * 100)}% of required policy acknowledgments are complete`,
        remediation:
          "Send reminders to users with pending policy acknowledgments",
      }
    }

    // CC1.4 - Training completion
    case "TRAINING_COMPLETION": {
      const users = await prisma.user.findMany({ select: { id: true } })
      const requiredModules = [
        "data-handling",
        "phishing-awareness",
        "incident-reporting",
        "client-confidentiality",
      ]
      let completed = 0
      const required = users.length * requiredModules.length
      for (const user of users) {
        for (const moduleId of requiredModules) {
          const training = await prisma.securityTraining.findFirst({
            where: { userId: user.id, moduleId, passed: true },
          })
          if (training) completed++
        }
      }
      const rate = required > 0 ? completed / required : 1
      return {
        status: rate >= 0.95 ? "PASS" : rate >= 0.7 ? "WARNING" : "FAIL",
        details: {
          completedModules: completed,
          requiredModules: required,
          rate: Math.round(rate * 100),
        },
        evidence: {
          type: "training_completion_status",
          rate,
          completed,
          required,
          checkedAt: new Date().toISOString(),
        },
        severity: rate < 0.7 ? "HIGH" : "MEDIUM",
        failureDescription: `Only ${Math.round(rate * 100)}% of required security training is complete`,
        remediation:
          "Assign overdue training modules to users who haven't completed them",
      }
    }

    // CC6.2 - MFA enrollment
    case "MFA_ENROLLMENT": {
      const total = await prisma.user.count()
      const mfaEnabled = await prisma.user.count({
        where: { mfaEnabled: true },
      })
      const rate = total > 0 ? mfaEnabled / total : 1
      return {
        status: rate >= 0.9 ? "PASS" : rate >= 0.5 ? "WARNING" : "FAIL",
        details: {
          mfaEnabled,
          totalUsers: total,
          rate: Math.round(rate * 100),
        },
        evidence: {
          type: "mfa_enrollment",
          mfaEnabled,
          total,
          checkedAt: new Date().toISOString(),
        },
      }
    }

    // CC6.5 - Inactive accounts
    case "INACTIVE_ACCOUNTS": {
      const threshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const inactiveUsers = await prisma.user.findMany({
        where: { updatedAt: { lt: threshold } },
        select: { id: true, name: true, email: true, updatedAt: true },
      })
      return {
        status: inactiveUsers.length === 0 ? "PASS" : "WARNING",
        details: {
          inactiveCount: inactiveUsers.length,
          threshold: "90 days",
          users: inactiveUsers.map((u) => ({
            name: u.name,
            email: u.email,
          })),
        },
        evidence: {
          type: "inactive_account_check",
          inactiveCount: inactiveUsers.length,
          checkedAt: new Date().toISOString(),
        },
      }
    }

    // PI1.1 - AI audit log integrity
    case "AI_AUDIT_INTEGRITY": {
      const aiTasks = await prisma.aITask.count({
        where: { status: { not: "QUEUED" } },
      })
      const aiAuditLogs = await prisma.auditLog.count({
        where: {
          action: { in: ["AI_REQUEST", "AI_COMPLETED", "AI_FAILED"] },
        },
      })
      const gapRate =
        aiTasks > 0 ? Math.abs(aiTasks - aiAuditLogs) / aiTasks : 0
      return {
        status:
          gapRate < 0.05 ? "PASS" : gapRate < 0.2 ? "WARNING" : "FAIL",
        details: {
          aiTasks,
          auditLogs: aiAuditLogs,
          gapRate: Math.round(gapRate * 100),
        },
        evidence: {
          type: "ai_audit_integrity",
          aiTasks,
          auditLogs: aiAuditLogs,
          gapRate,
          checkedAt: new Date().toISOString(),
        },
      }
    }

    // P4.2 - Encryption config
    case "ENCRYPTION_STATUS": {
      const hasKey = !!process.env.ENCRYPTION_KEY
      const keyLength = (process.env.ENCRYPTION_KEY || "").length
      return {
        status: hasKey && keyLength >= 32 ? "PASS" : "FAIL",
        details: {
          keyConfigured: hasKey,
          keyStrength: keyLength >= 32 ? "STRONG" : "WEAK",
        },
        evidence: {
          type: "encryption_config",
          configured: hasKey,
          strength: keyLength >= 32 ? "AES-256" : "INSUFFICIENT",
          checkedAt: new Date().toISOString(),
        },
        severity: "CRITICAL",
        failureDescription:
          "Encryption key is not configured or too short",
        remediation:
          "Set ENCRYPTION_KEY environment variable with at least 32 characters",
      }
    }

    // CC9.1 - Vendor SOC 2 report currency
    case "VENDOR_SOC2_STATUS": {
      const vendors = await prisma.vendorRecord.findMany()
      const now = new Date()
      const sixtyDaysFromNow = new Date(
        Date.now() + 60 * 24 * 60 * 60 * 1000
      )
      const expired = vendors.filter(
        (v) => v.soc2ExpiryDate && new Date(v.soc2ExpiryDate) < now
      )
      const approaching = vendors.filter(
        (v) =>
          v.soc2ExpiryDate &&
          new Date(v.soc2ExpiryDate) < sixtyDaysFromNow &&
          new Date(v.soc2ExpiryDate) >= now
      )
      return {
        status:
          expired.length === 0
            ? approaching.length === 0
              ? "PASS"
              : "WARNING"
            : "FAIL",
        details: {
          totalVendors: vendors.length,
          expired: expired.length,
          approaching: approaching.length,
        },
        evidence: {
          type: "vendor_soc2_status",
          vendors: vendors.map((v) => ({
            name: v.name,
            expiry: v.soc2ExpiryDate,
            status: v.soc2ExpiryDate
              ? new Date(v.soc2ExpiryDate) < now
                ? "EXPIRED"
                : "CURRENT"
              : "MISSING",
          })),
          checkedAt: new Date().toISOString(),
        },
        severity: expired.length > 0 ? "HIGH" : "MEDIUM",
        failureDescription: `${expired.length} vendor SOC 2 report(s) expired`,
        remediation:
          "Request updated SOC 2 reports from expired vendors",
      }
    }

    // C1.2 - Data retention compliance
    case "DATA_RETENTION": {
      const retentionYears = 7
      const threshold = new Date()
      threshold.setFullYear(threshold.getFullYear() - retentionYears)
      const expiredCases = await prisma.case.count({
        where: {
          status: { in: ["CLOSED", "RESOLVED"] },
          updatedAt: { lt: threshold },
        },
      })
      return {
        status: expiredCases === 0 ? "PASS" : "WARNING",
        details: {
          casesExceedingRetention: expiredCases,
          retentionPeriod: `${retentionYears} years`,
        },
        evidence: {
          type: "data_retention_check",
          expiredCases,
          retentionYears,
          checkedAt: new Date().toISOString(),
        },
        failureDescription: `${expiredCases} closed case(s) exceed the ${retentionYears}-year retention period`,
        remediation:
          "Queue expired cases for data disposal review",
      }
    }

    // A1.2 - System availability / backup freshness
    case "SYSTEM_AVAILABILITY": {
      const lastActivity = await prisma.auditLog.findFirst({
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      })
      const minutesSinceActivity = lastActivity
        ? (Date.now() - new Date(lastActivity.timestamp).getTime()) / 60000
        : Infinity
      return {
        status:
          minutesSinceActivity < 60
            ? "PASS"
            : minutesSinceActivity < 360
              ? "WARNING"
              : "FAIL",
        details: {
          lastActivity: lastActivity?.timestamp,
          minutesSince: Math.round(minutesSinceActivity),
        },
        evidence: {
          type: "system_availability",
          lastActivity: lastActivity?.timestamp,
          checkedAt: new Date().toISOString(),
        },
      }
    }

    // CC7.1 - Security event monitoring
    case "SECURITY_MONITORING": {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const securityEvents = await prisma.auditLog.count({
        where: {
          timestamp: { gte: last24h },
          action: {
            in: [
              "LOGIN_FAILURE",
              "UNAUTHORIZED_ACCESS_ATTEMPT",
              "RATE_LIMIT_HIT",
            ],
          },
        },
      })
      const unresolvedIncidents = await prisma.incidentRecord.count({
        where: {
          status: { in: ["DETECTED", "CLASSIFIED", "RESPONDING"] },
        },
      })
      return {
        status: unresolvedIncidents === 0 ? "PASS" : "WARNING",
        details: {
          securityEventsLast24h: securityEvents,
          unresolvedIncidents,
        },
        evidence: {
          type: "security_monitoring",
          events24h: securityEvents,
          openIncidents: unresolvedIncidents,
          checkedAt: new Date().toISOString(),
        },
      }
    }

    // P5.1 - DSR response compliance
    case "DSR_COMPLIANCE": {
      const overdueRequests = await prisma.dataSubjectRequest.count({
        where: {
          status: { in: ["RECEIVED", "IN_PROGRESS"] },
          slaDeadline: { lt: new Date() },
        },
      })
      const pendingRequests = await prisma.dataSubjectRequest.count({
        where: { status: { in: ["RECEIVED", "IN_PROGRESS"] } },
      })
      return {
        status: overdueRequests === 0 ? "PASS" : "FAIL",
        details: { overdueRequests, pendingRequests },
        evidence: {
          type: "dsr_compliance",
          overdue: overdueRequests,
          pending: pendingRequests,
          checkedAt: new Date().toISOString(),
        },
        severity: overdueRequests > 0 ? "HIGH" : undefined,
        failureDescription: `${overdueRequests} data subject request(s) are past their 30-day SLA`,
        remediation:
          "Immediately process overdue data subject requests",
      }
    }

    // Default — unknown check type
    default:
      return {
        status: "PASS",
        details: { message: `Unknown check type: ${check.checkType}` },
      }
  }
}

/**
 * Get all health checks that need to run (non-manual).
 */
async function getAllAutomatedChecks() {
  return prisma.healthCheck.findMany({
    where: { checkType: { not: "MANUAL" } },
    include: { control: true },
  })
}

/**
 * Compute next run time based on interval string.
 */
function computeNextRun(interval: string): Date {
  const now = new Date()
  switch (interval) {
    case "15m":
      return new Date(now.getTime() + 15 * 60 * 1000)
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000)
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000)
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000)
  }
}

/**
 * Compute SLA deadline based on issue severity.
 */
function computeSLADeadline(severity: string): Date {
  const now = new Date()
  const hoursMap: Record<string, number> = {
    CRITICAL: 72,
    HIGH: 168,
    MEDIUM: 720,
    LOW: 2160,
  }
  const hours = hoursMap[severity] || 720
  return new Date(now.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Seed automated health checks for all controls marked as AUTOMATED.
 * Maps each control ID to a check type and interval.
 */
export async function seedHealthChecks(): Promise<number> {
  const controls = await prisma.complianceControl.findMany({
    where: { monitoringMethod: "AUTOMATED" },
  })

  const checkMap: Record<string, { checkType: string; interval: string }> = {
    "CC1.1": { checkType: "POLICY_ACKNOWLEDGMENT", interval: "24h" },
    "CC1.4": { checkType: "TRAINING_COMPLETION", interval: "24h" },
    "CC6.2": { checkType: "MFA_ENROLLMENT", interval: "1h" },
    "CC6.5": { checkType: "INACTIVE_ACCOUNTS", interval: "24h" },
    "CC7.1": { checkType: "SECURITY_MONITORING", interval: "15m" },
    "CC9.1": { checkType: "VENDOR_SOC2_STATUS", interval: "24h" },
    "PI1.1": { checkType: "AI_AUDIT_INTEGRITY", interval: "1h" },
    "P4.2": { checkType: "ENCRYPTION_STATUS", interval: "1h" },
    "A1.2": { checkType: "SYSTEM_AVAILABILITY", interval: "15m" },
    "C1.2": { checkType: "DATA_RETENTION", interval: "24h" },
    "P5.1": { checkType: "DSR_COMPLIANCE", interval: "24h" },
  }

  let seeded = 0
  for (const control of controls) {
    const config = checkMap[control.controlId]
    if (config) {
      await prisma.healthCheck.upsert({
        where: { id: `hc-${control.controlId}` },
        create: {
          id: `hc-${control.controlId}`,
          controlId: control.id,
          checkType: config.checkType,
          interval: config.interval,
          lastResult: "NOT_RUN",
          nextRun: new Date(),
        },
        update: {
          checkType: config.checkType,
          interval: config.interval,
        },
      })
      seeded++
    }
  }
  return seeded
}

/**
 * Get the latest automation run summary for dashboard display.
 */
export async function getAutomationStatus(): Promise<{
  lastRunAt: Date | null
  healthChecks: Array<{
    id: string
    checkType: string
    controlId: string
    interval: string
    lastRun: Date | null
    lastResult: string | null
    nextRun: Date | null
  }>
  openIssues: number
  slaBreaches: number
  evidenceCount: number
}> {
  const healthChecks = await prisma.healthCheck.findMany({
    include: { control: { select: { controlId: true } } },
    orderBy: { lastRun: "desc" },
  })

  const openIssues = await prisma.complianceIssue.count({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
  })

  const slaBreaches = await prisma.complianceIssue.count({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      slaDeadline: { lt: new Date() },
    },
  })

  const evidenceCount = await prisma.evidenceItem.count({
    where: { collector: "system" },
  })

  const lastRunAt =
    healthChecks.length > 0 && healthChecks[0].lastRun
      ? healthChecks[0].lastRun
      : null

  return {
    lastRunAt,
    healthChecks: healthChecks.map((hc) => ({
      id: hc.id,
      checkType: hc.checkType,
      controlId: hc.control.controlId,
      interval: hc.interval,
      lastRun: hc.lastRun,
      lastResult: hc.lastResult,
      nextRun: hc.nextRun,
    })),
    openIssues,
    slaBreaches,
    evidenceCount,
  }
}
