import { NextResponse } from "next/server"
import { requireApiAuth, ADMIN_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * POST /api/admin/migrate-notes-compliance
 * Creates tables for Client Notes, Conversations, and SOC 2 Compliance.
 * Idempotent — safe to run multiple times.
 */
export async function POST() {
  const auth = await requireApiAuth(ADMIN_ROLES)
  if (!auth.authorized) return auth.response

  const results: string[] = []

  const migrations = [
    // ─── Enums ───
    `DO $$ BEGIN
      CREATE TYPE "NoteType" AS ENUM ('JOURNAL_ENTRY','CALL_LOG','IRS_CONTACT','STRATEGY_NOTE','CLIENT_INTERACTION','RESEARCH','GENERAL');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "NoteVisibility" AS ENUM ('ALL_PRACTITIONERS','CASE_TEAM_ONLY','PRIVATE');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "FeatureArea" AS ENUM ('TRANSCRIPT_DECODER','CASE_INTELLIGENCE','PENALTY_ABATEMENT','OIC','COMPLIANCE','DEADLINE_TRACKER','GENERAL');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "ConversationStatus" AS ENUM ('OPEN','RESOLVED','ARCHIVED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "ConversationPriority" AS ENUM ('NORMAL','URGENT','FYI');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "TSC" AS ENUM ('SECURITY','AVAILABILITY','PROCESSING_INTEGRITY','CONFIDENTIALITY','PRIVACY');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "ControlStatus" AS ENUM ('COMPLIANT','PARTIALLY_COMPLIANT','NON_COMPLIANT','NOT_ASSESSED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "MonitoringMethod" AS ENUM ('AUTOMATED','MANUAL','HYBRID');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "IssueSeverity" AS ENUM ('CRITICAL','HIGH','MEDIUM','LOW');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "IssueStatus" AS ENUM ('OPEN','IN_PROGRESS','IMPLEMENTED','VERIFIED','CLOSED','ACCEPTED_RISK');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "EvidenceType" AS ENUM ('AUTOMATED_LOG','CONFIG_SNAPSHOT','POLICY_DOCUMENT','MANUAL_UPLOAD','TEST_RESULT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "MilestoneStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETE');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    // ─── Client Notes ───
    `CREATE TABLE IF NOT EXISTS "client_notes" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "caseId" TEXT NOT NULL,
      "authorId" TEXT NOT NULL,
      "noteType" "NoteType" NOT NULL DEFAULT 'GENERAL',
      "title" TEXT,
      "content" TEXT NOT NULL,
      "taxYears" INTEGER[] DEFAULT '{}',
      "relatedFeature" "FeatureArea",
      "pinned" BOOLEAN NOT NULL DEFAULT false,
      "visibility" "NoteVisibility" NOT NULL DEFAULT 'ALL_PRACTITIONERS',
      "isDeleted" BOOLEAN NOT NULL DEFAULT false,
      "isPrivileged" BOOLEAN NOT NULL DEFAULT false,
      "callDate" TIMESTAMP(3),
      "callDuration" INTEGER,
      "callParticipants" TEXT,
      "callType" TEXT,
      "callDisposition" TEXT,
      "irsEmployeeName" TEXT,
      "irsEmployeeId" TEXT,
      "irsDepartment" TEXT,
      "irsContactMethod" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "client_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE,
      CONSTRAINT "client_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "client_notes_caseId_createdAt_idx" ON "client_notes"("caseId","createdAt")`,
    `CREATE INDEX IF NOT EXISTS "client_notes_authorId_idx" ON "client_notes"("authorId")`,
    `CREATE INDEX IF NOT EXISTS "client_notes_noteType_idx" ON "client_notes"("noteType")`,
    `CREATE INDEX IF NOT EXISTS "client_notes_caseId_pinned_idx" ON "client_notes"("caseId","pinned")`,

    // ─── Note Attachments ───
    `CREATE TABLE IF NOT EXISTS "note_attachments" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "noteId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "fileUrl" TEXT NOT NULL,
      "fileType" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "note_attachments_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "note_attachments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "client_notes"("id") ON DELETE CASCADE
    )`,

    // ─── Conversations ───
    `CREATE TABLE IF NOT EXISTS "conversations" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "caseId" TEXT NOT NULL,
      "startedById" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
      "priority" "ConversationPriority" NOT NULL DEFAULT 'NORMAL',
      "relatedTaxYears" INTEGER[] DEFAULT '{}',
      "relatedFeature" "FeatureArea",
      "participants" TEXT[] DEFAULT '{}',
      "resolvedAt" TIMESTAMP(3),
      "resolvedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "conversations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE,
      CONSTRAINT "conversations_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id"),
      CONSTRAINT "conversations_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "conversations_caseId_status_idx" ON "conversations"("caseId","status")`,
    `CREATE INDEX IF NOT EXISTS "conversations_startedById_idx" ON "conversations"("startedById")`,

    // ─── Conversation Messages ───
    `CREATE TABLE IF NOT EXISTS "conversation_messages" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "conversationId" TEXT NOT NULL,
      "authorId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "isEdited" BOOLEAN NOT NULL DEFAULT false,
      "isDeleted" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
      CONSTRAINT "conversation_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId","createdAt")`,

    // ─── Conversation Message Attachments ───
    `CREATE TABLE IF NOT EXISTS "conversation_msg_attachments" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "messageId" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "fileUrl" TEXT NOT NULL,
      "fileType" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "conversation_msg_attachments_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "conversation_msg_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "conversation_messages"("id") ON DELETE CASCADE
    )`,

    // ─── Compliance Controls ───
    `CREATE TABLE IF NOT EXISTS "compliance_controls" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "controlId" TEXT NOT NULL,
      "tsc" "TSC" NOT NULL,
      "controlFamily" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "monitoringMethod" "MonitoringMethod" NOT NULL DEFAULT 'MANUAL',
      "status" "ControlStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
      "whatSoc2Requires" TEXT NOT NULL,
      "howClearedMeetsIt" TEXT NOT NULL,
      "whyItMatters" TEXT NOT NULL,
      "ownerId" TEXT,
      "lastEvidenceCollected" TIMESTAMP(3),
      "nextReviewDate" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "compliance_controls_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "compliance_controls_controlId_key" UNIQUE ("controlId")
    )`,
    `CREATE INDEX IF NOT EXISTS "compliance_controls_tsc_idx" ON "compliance_controls"("tsc")`,
    `CREATE INDEX IF NOT EXISTS "compliance_controls_controlFamily_idx" ON "compliance_controls"("controlFamily")`,
    `CREATE INDEX IF NOT EXISTS "compliance_controls_status_idx" ON "compliance_controls"("status")`,

    // ─── Health Checks ───
    `CREATE TABLE IF NOT EXISTS "health_checks" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "controlId" TEXT NOT NULL,
      "checkType" TEXT NOT NULL,
      "interval" TEXT NOT NULL,
      "lastRun" TIMESTAMP(3),
      "lastResult" TEXT,
      "nextRun" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "health_checks_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "compliance_controls"("id") ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "health_checks_controlId_idx" ON "health_checks"("controlId")`,

    // ─── Health Check Results ───
    `CREATE TABLE IF NOT EXISTS "health_check_results" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "healthCheckId" TEXT NOT NULL,
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL,
      "details" JSONB,
      "evidenceSnapshot" JSONB,
      CONSTRAINT "health_check_results_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "health_check_results_healthCheckId_fkey" FOREIGN KEY ("healthCheckId") REFERENCES "health_checks"("id") ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "health_check_results_healthCheckId_timestamp_idx" ON "health_check_results"("healthCheckId","timestamp")`,

    // ─── Compliance Issues ───
    `CREATE TABLE IF NOT EXISTS "compliance_issues" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "controlId" TEXT NOT NULL,
      "severity" "IssueSeverity" NOT NULL,
      "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
      "description" TEXT NOT NULL,
      "remediationPlan" TEXT,
      "ownerId" TEXT,
      "slaDeadline" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolvedAt" TIMESTAMP(3),
      CONSTRAINT "compliance_issues_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "compliance_issues_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "compliance_controls"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "compliance_issues_controlId_idx" ON "compliance_issues"("controlId")`,
    `CREATE INDEX IF NOT EXISTS "compliance_issues_severity_status_idx" ON "compliance_issues"("severity","status")`,

    // ─── Evidence Items ───
    `CREATE TABLE IF NOT EXISTS "evidence_items" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "controlId" TEXT NOT NULL,
      "evidenceType" "EvidenceType" NOT NULL,
      "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "contentOrPath" TEXT NOT NULL,
      "collector" TEXT NOT NULL,
      "validUntil" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "evidence_items_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "compliance_controls"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "evidence_items_controlId_idx" ON "evidence_items"("controlId")`,

    // ─── Audit Milestones ───
    `CREATE TABLE IF NOT EXISTS "audit_milestones" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "targetDate" TIMESTAMP(3) NOT NULL,
      "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "audit_milestones_pkey" PRIMARY KEY ("id")
    )`,
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
