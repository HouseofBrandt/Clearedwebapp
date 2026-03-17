-- Cleared Database Schema Migration
-- Run this in Neon SQL Editor: https://console.neon.tech

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PRACTITIONER', 'SENIOR', 'ADMIN');
CREATE TYPE "LicenseType" AS ENUM ('EA', 'CPA', 'ATTORNEY');
CREATE TYPE "CaseStatus" AS ENUM ('INTAKE', 'ANALYSIS', 'REVIEW', 'ACTIVE', 'RESOLVED', 'CLOSED');
CREATE TYPE "CaseType" AS ENUM ('OIC', 'IA', 'PENALTY', 'INNOCENT_SPOUSE', 'CNC', 'TFRP', 'ERC', 'UNFILED', 'AUDIT', 'CDP', 'OTHER');
CREATE TYPE "FileType" AS ENUM ('PDF', 'IMAGE', 'DOCX', 'XLSX', 'TEXT');
CREATE TYPE "DocumentCategory" AS ENUM ('IRS_NOTICE', 'BANK_STATEMENT', 'TAX_RETURN', 'PAYROLL', 'MEDICAL', 'MEETING_NOTES', 'OTHER');
CREATE TYPE "AITaskType" AS ENUM ('WORKING_PAPERS', 'CASE_MEMO', 'PENALTY_LETTER', 'OIC_NARRATIVE', 'GENERAL_ANALYSIS');
CREATE TYPE "AITaskStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "ReviewActionType" AS ENUM ('APPROVE', 'EDIT_APPROVE', 'REJECT_REPROMPT', 'REJECT_MANUAL');

-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PRACTITIONER',
    "licenseType" "LicenseType",
    "licenseNumber" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cases
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientNameEncrypted" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'INTAKE',
    "caseType" "CaseType" NOT NULL DEFAULT 'OTHER',
    "assignedPractitionerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable: documents
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "documentCategory" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "extractedText" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ai_tasks
CREATE TABLE "ai_tasks" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "taskType" "AITaskType" NOT NULL,
    "status" "AITaskStatus" NOT NULL DEFAULT 'QUEUED',
    "tokenizedInput" TEXT,
    "tokenizedOutput" TEXT,
    "detokenizedOutput" TEXT,
    "modelUsed" TEXT,
    "temperature" DOUBLE PRECISION,
    "systemPromptVersion" TEXT,
    "verifyFlagCount" INTEGER NOT NULL DEFAULT 0,
    "judgmentFlagCount" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: review_actions
CREATE TABLE "review_actions" (
    "id" TEXT NOT NULL,
    "aiTaskId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "action" "ReviewActionType" NOT NULL,
    "editedOutput" TEXT,
    "reviewNotes" TEXT,
    "reviewStartedAt" TIMESTAMP(3) NOT NULL,
    "reviewCompletedAt" TIMESTAMP(3),
    CONSTRAINT "review_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "aiTaskId" TEXT,
    "practitionerId" TEXT,
    "caseId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: token_maps
CREATE TABLE "token_maps" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tokenMap" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "token_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");
CREATE UNIQUE INDEX "ai_tasks_requestId_key" ON "ai_tasks"("requestId");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedPractitionerId_fkey" FOREIGN KEY ("assignedPractitionerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_aiTaskId_fkey" FOREIGN KEY ("aiTaskId") REFERENCES "ai_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "token_maps" ADD CONSTRAINT "token_maps_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
