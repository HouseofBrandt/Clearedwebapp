-- V2 Feed Migration: Task, FeedReaction, FeedPostCase, FeedMention, FeedAttachment
-- Run this in Neon SQL Editor: https://console.neon.tech
-- Or via the admin endpoint: POST /api/admin/migrate-v2-feed

-- Add new columns to feed_posts (if not already present)
ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

-- Create index on taskId
CREATE INDEX IF NOT EXISTS "feed_posts_taskId_idx" ON "feed_posts"("taskId");

-- CreateTable: tasks
CREATE TABLE IF NOT EXISTS "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "caseId" TEXT,
    "deadlineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tasks_assigneeId_status_idx" ON "tasks"("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "tasks_caseId_idx" ON "tasks"("caseId");
CREATE INDEX IF NOT EXISTS "tasks_dueDate_idx" ON "tasks"("dueDate");

-- AddForeignKey: tasks
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: feed_posts.taskId
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: feed_reactions
CREATE TABLE IF NOT EXISTS "feed_reactions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feed_reactions_postId_userId_type_key" ON "feed_reactions"("postId", "userId", "type");

ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_reactions" ADD CONSTRAINT "feed_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: feed_post_cases
CREATE TABLE IF NOT EXISTS "feed_post_cases" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    CONSTRAINT "feed_post_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feed_post_cases_postId_caseId_key" ON "feed_post_cases"("postId", "caseId");
CREATE INDEX IF NOT EXISTS "feed_post_cases_caseId_idx" ON "feed_post_cases"("caseId");

ALTER TABLE "feed_post_cases" ADD CONSTRAINT "feed_post_cases_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_post_cases" ADD CONSTRAINT "feed_post_cases_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: feed_mentions
CREATE TABLE IF NOT EXISTS "feed_mentions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mentionType" TEXT NOT NULL,
    "userId" TEXT,
    "display" TEXT NOT NULL,
    CONSTRAINT "feed_mentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "feed_mentions_userId_idx" ON "feed_mentions"("userId");
CREATE INDEX IF NOT EXISTS "feed_mentions_postId_idx" ON "feed_mentions"("postId");

ALTER TABLE "feed_mentions" ADD CONSTRAINT "feed_mentions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_mentions" ADD CONSTRAINT "feed_mentions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: feed_attachments
CREATE TABLE IF NOT EXISTS "feed_attachments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "feed_attachments" ADD CONSTRAINT "feed_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
