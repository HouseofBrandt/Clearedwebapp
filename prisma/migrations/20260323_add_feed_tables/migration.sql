-- Create FeedPost table
CREATE TABLE IF NOT EXISTS "feed_posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "authorType" TEXT NOT NULL DEFAULT 'user',
    "postType" TEXT NOT NULL,
    "content" TEXT,
    "caseId" TEXT,
    "taskTitle" TEXT,
    "taskAssigneeId" TEXT,
    "taskDueDate" TIMESTAMP(3),
    "taskCompleted" BOOLEAN NOT NULL DEFAULT false,
    "taskCompletedAt" TIMESTAMP(3),
    "taskCompletedById" TEXT,
    "attachments" JSONB,
    "eventType" TEXT,
    "eventData" JSONB,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "mentions" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id")
);

-- Create FeedReply table
CREATE TABLE IF NOT EXISTS "feed_replies" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorType" TEXT NOT NULL DEFAULT 'user',
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_replies_pkey" PRIMARY KEY ("id")
);

-- Create FeedLike table
CREATE TABLE IF NOT EXISTS "feed_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_likes_pkey" PRIMARY KEY ("id")
);

-- Indexes for FeedPost
CREATE INDEX IF NOT EXISTS "feed_posts_createdAt_idx" ON "feed_posts"("createdAt");
CREATE INDEX IF NOT EXISTS "feed_posts_caseId_idx" ON "feed_posts"("caseId");
CREATE INDEX IF NOT EXISTS "feed_posts_authorId_idx" ON "feed_posts"("authorId");
CREATE INDEX IF NOT EXISTS "feed_posts_postType_idx" ON "feed_posts"("postType");
CREATE INDEX IF NOT EXISTS "feed_posts_taskAssigneeId_taskCompleted_idx" ON "feed_posts"("taskAssigneeId", "taskCompleted");

-- Indexes for FeedReply
CREATE INDEX IF NOT EXISTS "feed_replies_postId_createdAt_idx" ON "feed_replies"("postId", "createdAt");

-- Unique constraint for FeedLike (one like per user per post)
CREATE UNIQUE INDEX IF NOT EXISTS "feed_likes_postId_userId_key" ON "feed_likes"("postId", "userId");

-- Foreign keys for FeedPost
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_taskAssigneeId_fkey" FOREIGN KEY ("taskAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys for FeedReply
ALTER TABLE "feed_replies" ADD CONSTRAINT "feed_replies_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_replies" ADD CONSTRAINT "feed_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys for FeedLike
ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
