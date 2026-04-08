-- Create work_product_overrides table if it doesn't exist
CREATE TABLE IF NOT EXISTS "work_product_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "toneDirective" TEXT,
    "structureDirective" TEXT,
    "lengthDirective" TEXT,
    "emphasisAreas" TEXT,
    "avoidances" TEXT,
    "customInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_product_overrides_pkey" PRIMARY KEY ("id")
);

-- Create work_product_examples table if it doesn't exist
CREATE TABLE IF NOT EXISTS "work_product_examples" (
    "id" TEXT NOT NULL,
    "overrideId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isGoodExample" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sourceFileName" TEXT,
    "sourceFileType" TEXT,
    "sourceFilePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_product_examples_pkey" PRIMARY KEY ("id")
);

-- Create unique index on userId + taskType
CREATE UNIQUE INDEX IF NOT EXISTS "work_product_overrides_userId_taskType_key" ON "work_product_overrides"("userId", "taskType");

-- Create indexes
CREATE INDEX IF NOT EXISTS "work_product_overrides_userId_idx" ON "work_product_overrides"("userId");
CREATE INDEX IF NOT EXISTS "work_product_examples_overrideId_idx" ON "work_product_examples"("overrideId");

-- Add foreign keys (only if not already present)
DO $$ BEGIN
  ALTER TABLE "work_product_examples" ADD CONSTRAINT "work_product_examples_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "work_product_overrides"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add file metadata columns if table already existed without them
ALTER TABLE "work_product_examples" ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT;
ALTER TABLE "work_product_examples" ADD COLUMN IF NOT EXISTS "sourceFileType" TEXT;
ALTER TABLE "work_product_examples" ADD COLUMN IF NOT EXISTS "sourceFilePath" TEXT;
