-- Add SUPPORT_STAFF to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPORT_STAFF';

-- Add flagsAcknowledged to review_actions
ALTER TABLE "review_actions" ADD COLUMN IF NOT EXISTS "flagsAcknowledged" BOOLEAN NOT NULL DEFAULT false;

-- Create LiabilityPeriod table
CREATE TABLE IF NOT EXISTS "liability_periods" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "formType" TEXT NOT NULL,
    "originalAssessment" DECIMAL(65,30),
    "penalties" DECIMAL(65,30),
    "interest" DECIMAL(65,30),
    "totalBalance" DECIMAL(65,30),
    "assessmentDate" TIMESTAMP(3),
    "csedDate" TIMESTAMP(3),
    "status" TEXT,

    CONSTRAINT "liability_periods_pkey" PRIMARY KEY ("id")
);

-- Add foreign key for liability_periods
ALTER TABLE "liability_periods" ADD CONSTRAINT "liability_periods_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
