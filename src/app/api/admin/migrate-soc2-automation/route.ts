import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * POST /api/admin/migrate-soc2-automation
 * Creates tables for Policy Acknowledgment Gate, Security Training,
 * Background Checks, Governance Meetings, Vendor Records, Incident Records,
 * Data Disposal Records, and Data Subject Requests.
 * Covers SOC 2 controls CC1.1, CC2.2, CC5.3.
 * Idempotent — safe to run multiple times.
 */
export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const results: string[] = []

  const migrations = [
    // ─── Compliance Policies ───
    `CREATE TABLE IF NOT EXISTS "compliance_policies" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1,
      "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdById" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "compliance_policies_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "compliance_policies_slug_key" UNIQUE ("slug"),
      CONSTRAINT "compliance_policies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "compliance_policies_slug_version_idx" ON "compliance_policies"("slug","version")`,

    // ─── Policy Acknowledgments ───
    `CREATE TABLE IF NOT EXISTS "policy_acknowledgments" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "policyId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ipAddress" TEXT,
      CONSTRAINT "policy_acknowledgments_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "policy_acknowledgments_policyId_userId_version_key" UNIQUE ("policyId","userId","version"),
      CONSTRAINT "policy_acknowledgments_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "compliance_policies"("id"),
      CONSTRAINT "policy_acknowledgments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "policy_acknowledgments_userId_idx" ON "policy_acknowledgments"("userId")`,

    // ─── Security Trainings ───
    `CREATE TABLE IF NOT EXISTS "security_trainings" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL,
      "moduleId" TEXT NOT NULL,
      "moduleName" TEXT NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1,
      "score" INTEGER,
      "passed" BOOLEAN NOT NULL DEFAULT false,
      "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "security_trainings_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "security_trainings_userId_moduleId_version_key" UNIQUE ("userId","moduleId","version"),
      CONSTRAINT "security_trainings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "security_trainings_userId_idx" ON "security_trainings"("userId")`,

    // ─── Background Checks ───
    `CREATE TABLE IF NOT EXISTS "background_checks" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "userId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "dateCompleted" TIMESTAMP(3) NOT NULL,
      "result" TEXT NOT NULL,
      "nextCheckDate" TIMESTAMP(3),
      "notes" TEXT,
      "enteredById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "background_checks_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "background_checks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id"),
      CONSTRAINT "background_checks_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "background_checks_userId_idx" ON "background_checks"("userId")`,

    // ─── Governance Meetings ───
    `CREATE TABLE IF NOT EXISTS "governance_meetings" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "meetingDate" TIMESTAMP(3) NOT NULL,
      "attendeeIds" TEXT[] DEFAULT '{}',
      "agenda" TEXT NOT NULL,
      "decisions" TEXT NOT NULL,
      "actionItems" JSONB NOT NULL,
      "quarter" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "governance_meetings_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "governance_meetings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id")
    )`,

    // ─── Vendor Records ───
    `CREATE TABLE IF NOT EXISTS "vendor_records" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "name" TEXT NOT NULL,
      "service" TEXT NOT NULL,
      "dataShared" TEXT NOT NULL,
      "integrationType" TEXT NOT NULL,
      "soc2ReportDate" TIMESTAMP(3),
      "soc2ExpiryDate" TIMESTAMP(3),
      "dpaStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
      "lastAssessmentDate" TIMESTAMP(3),
      "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "vendor_records_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "vendor_records_name_key" UNIQUE ("name")
    )`,

    // ─── Incident Records ───
    `CREATE TABLE IF NOT EXISTS "incident_records" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "title" TEXT NOT NULL,
      "severity" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'DETECTED',
      "classification" TEXT,
      "description" TEXT NOT NULL,
      "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "detectedBy" TEXT NOT NULL,
      "assignedToId" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "resolvedById" TEXT,
      "postMortemNotes" TEXT,
      "rootCause" TEXT,
      "affectedClients" INTEGER NOT NULL DEFAULT 0,
      "affectedStates" TEXT[] DEFAULT '{}',
      "playbookSteps" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "incident_records_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "incident_records_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "incident_records_status_idx" ON "incident_records"("status")`,
    `CREATE INDEX IF NOT EXISTS "incident_records_severity_idx" ON "incident_records"("severity")`,

    // ─── Data Disposal Records ───
    `CREATE TABLE IF NOT EXISTS "data_disposal_records" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "clientCount" INTEGER NOT NULL,
      "recordCount" INTEGER NOT NULL,
      "method" TEXT NOT NULL DEFAULT 'CRYPTO_SHRED',
      "status" TEXT NOT NULL DEFAULT 'QUEUED',
      "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "confirmedById" TEXT,
      "confirmedAt" TIMESTAMP(3),
      "executedAt" TIMESTAMP(3),
      "certificateId" TEXT,
      "details" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "data_disposal_records_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "data_disposal_records_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id")
    )`,

    // ─── Data Subject Requests ───
    `CREATE TABLE IF NOT EXISTS "data_subject_requests" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "requestType" TEXT NOT NULL,
      "subjectName" TEXT NOT NULL,
      "subjectEmail" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'RECEIVED',
      "slaDeadline" TIMESTAMP(3) NOT NULL,
      "assignedToId" TEXT,
      "responseData" JSONB,
      "completedAt" TIMESTAMP(3),
      "completedById" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "data_subject_requests_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "data_subject_requests_status_idx" ON "data_subject_requests"("status")`,
  ]

  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql)
      results.push(`OK: ${sql.substring(0, 60)}...`)
    } catch (e: any) {
      results.push(`SKIP: ${sql.substring(0, 60)}... (${e.message?.substring(0, 80)})`)
    }
  }

  return NextResponse.json({ success: true, results })
}
