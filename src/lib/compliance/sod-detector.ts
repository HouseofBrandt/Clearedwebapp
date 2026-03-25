/**
 * Separation of Duties (SOD) Conflict Detector — SOC 2 CC5.2
 *
 * Detects conflicts where a single user performs actions that should
 * require two different people. These are compliance red flags for
 * SOC 2 auditors.
 */

import { prisma } from "@/lib/db"

export interface SODConflict {
  conflictType: string
  description: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  userId: string
  userName: string
  userEmail: string
  details: Record<string, any>
  detectedAt: string
}

/**
 * Detect Separation of Duties conflicts across the platform.
 *
 * Checks for:
 * 1. Same user creating AND being the sole approver of AI output
 * 2. Same user editing a policy AND being the only acknowledger
 * 3. Same user creating an incident AND self-resolving it
 * 4. Same user requesting data disposal AND confirming it
 * 5. Users with ADMIN role who also perform practitioner review actions
 */
export async function detectSODConflicts(): Promise<SODConflict[]> {
  const conflicts: SODConflict[] = []
  const now = new Date().toISOString()

  // ── 1. Self-approval of AI-generated output ──
  // A user who created an AI task should not be the same user who approved it
  const aiTasks = await prisma.aITask.findMany({
    where: {
      status: "APPROVED",
      createdById: { not: null },
    },
    include: {
      reviewActions: {
        where: { action: "APPROVE" },
        include: {
          practitioner: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  for (const task of aiTasks) {
    if (!task.createdBy) continue
    const selfApprovals = task.reviewActions.filter(
      (ra) => ra.practitionerId === task.createdById
    )
    if (selfApprovals.length > 0) {
      conflicts.push({
        conflictType: "SELF_APPROVAL",
        description:
          "User approved their own AI-generated output without independent review",
        severity: "HIGH",
        userId: task.createdBy.id,
        userName: task.createdBy.name,
        userEmail: task.createdBy.email,
        details: {
          aiTaskId: task.id,
          taskType: task.taskType,
          caseId: task.caseId,
          approvedAt: selfApprovals[0].reviewCompletedAt,
        },
        detectedAt: now,
      })
    }
  }

  // ── 2. Single-person policy acknowledgment ──
  // If a policy was created by a user and that user is the only one who acknowledged it
  const policies = await prisma.compliancePolicy.findMany({
    where: { isActive: true },
    include: {
      acknowledgments: {
        select: { userId: true },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  for (const policy of policies) {
    const uniqueAcknowledgers = Array.from(
      new Set(policy.acknowledgments.map((a) => a.userId))
    )
    if (
      uniqueAcknowledgers.length === 1 &&
      uniqueAcknowledgers[0] === policy.createdById
    ) {
      conflicts.push({
        conflictType: "SOLE_POLICY_ACKNOWLEDGMENT",
        description:
          "Policy creator is the only user who acknowledged their own policy",
        severity: "MEDIUM",
        userId: policy.createdBy.id,
        userName: policy.createdBy.name,
        userEmail: policy.createdBy.email,
        details: {
          policyId: policy.id,
          policySlug: policy.slug,
          policyTitle: policy.title,
          version: policy.version,
        },
        detectedAt: now,
      })
    }
  }

  // ── 3. Self-resolved incidents ──
  // An incident should not be resolved by the same person who created/detected it
  const incidents = await prisma.incidentRecord.findMany({
    where: {
      status: "RESOLVED",
      resolvedById: { not: null },
    },
  })

  const incidentUsers = Array.from(
    new Set(
      incidents
        .map((inc) => inc.resolvedById)
        .filter((id): id is string => id !== null)
    )
  )
  const incidentUserMap = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: incidentUsers } },
        select: { id: true, name: true, email: true },
      })
    ).map((u) => [u.id, u])
  )

  for (const incident of incidents) {
    if (
      incident.detectedBy !== "system" &&
      incident.detectedBy === incident.resolvedById
    ) {
      const user = incidentUserMap.get(incident.resolvedById!)
      if (user) {
        conflicts.push({
          conflictType: "SELF_RESOLVED_INCIDENT",
          description:
            "Incident was detected and resolved by the same person",
          severity: "HIGH",
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          details: {
            incidentId: incident.id,
            incidentTitle: incident.title,
            detectedAt: incident.detectedAt,
            resolvedAt: incident.resolvedAt,
          },
          detectedAt: now,
        })
      }
    }
  }

  // ── 4. Self-confirmed data disposal ──
  // Data disposal should be confirmed by someone other than the requester
  const disposals = await prisma.dataDisposalRecord.findMany({
    where: {
      status: { in: ["CONFIRMED", "EXECUTED", "CERTIFIED"] },
      confirmedById: { not: null },
    },
  })

  // Check audit logs for who queued each disposal
  for (const disposal of disposals) {
    const queuedLog = await prisma.auditLog.findFirst({
      where: {
        action: { in: ["DATA_DISPOSAL_QUEUED", "DATA_DISPOSAL_CREATED"] },
        metadata: {
          path: ["disposalId"],
          equals: disposal.id,
        },
      },
      select: { practitionerId: true },
    })

    if (
      queuedLog?.practitionerId &&
      queuedLog.practitionerId === disposal.confirmedById
    ) {
      const user = await prisma.user.findUnique({
        where: { id: disposal.confirmedById },
        select: { id: true, name: true, email: true },
      })
      if (user) {
        conflicts.push({
          conflictType: "SELF_CONFIRMED_DISPOSAL",
          description:
            "Data disposal was requested and confirmed by the same person",
          severity: "CRITICAL",
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          details: {
            disposalId: disposal.id,
            clientCount: disposal.clientCount,
            recordCount: disposal.recordCount,
            method: disposal.method,
            confirmedAt: disposal.confirmedAt,
          },
          detectedAt: now,
        })
      }
    }
  }

  // ── 5. Admin performing practitioner reviews ──
  // Flag when ADMIN users are also heavy review performers (should delegate)
  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true },
  })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  for (const admin of adminUsers) {
    const reviewCount = await prisma.reviewAction.count({
      where: {
        practitionerId: admin.id,
        reviewStartedAt: { gte: thirtyDaysAgo },
      },
    })
    // Flag if admin has more than 20 reviews in the last 30 days
    if (reviewCount > 20) {
      conflicts.push({
        conflictType: "ADMIN_HEAVY_REVIEWER",
        description:
          "ADMIN role user is also a heavy reviewer, potentially concentrating too many duties",
        severity: "LOW",
        userId: admin.id,
        userName: admin.name,
        userEmail: admin.email,
        details: {
          reviewCount,
          period: "30 days",
          threshold: 20,
        },
        detectedAt: now,
      })
    }
  }

  return conflicts
}
