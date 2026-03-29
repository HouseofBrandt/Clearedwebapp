-- Add file metadata columns to work_product_examples
ALTER TABLE "work_product_examples" ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT;
ALTER TABLE "work_product_examples" ADD COLUMN IF NOT EXISTS "sourceFileType" TEXT;
ALTER TABLE "work_product_examples" ADD COLUMN IF NOT EXISTS "sourceFilePath" TEXT;
