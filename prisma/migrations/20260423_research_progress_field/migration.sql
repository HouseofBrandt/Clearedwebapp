-- Add a live progress snapshot column to ResearchSession so the detail
-- page can render a Claude-style thinking display even when the client
-- reloads mid-flight. Written on each step of conductResearch.
ALTER TABLE "research_sessions" ADD COLUMN "progress" JSONB;
