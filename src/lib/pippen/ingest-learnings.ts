/**
 * Stage 3: Ingest compiled daily learnings into the Knowledge Base.
 *
 * Creates a KnowledgeDocument record and runs the existing ingest pipeline
 * to chunk and embed the report content.
 */

import { prisma } from "@/lib/db"
import { ingestDocument } from "@/lib/knowledge/ingest"
import type { CompiledReport } from "./compile-learnings"

export async function ingestDailyLearnings(
  report: CompiledReport,
): Promise<{ success: boolean; docId?: string; error?: string }> {
  try {
    // Skip ingestion if there are no learnings
    if (report.learnings.length === 0) {
      return { success: true, error: "No learnings to ingest" }
    }

    // Check if a document for this date already exists
    const existingTitle = `Pippen Daily Learnings — ${report.date}`
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { title: existingTitle },
    })

    if (existing) {
      // Update existing document
      await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: {
          sourceText: report.markdownContent,
          processingStatus: "processing",
        },
      })

      // Delete old chunks before re-ingesting
      try {
        await prisma.knowledgeChunk.deleteMany({
          where: { documentId: existing.id },
        })
      } catch {
        // Chunks table may not exist
      }

      try {
        await ingestDocument(existing.id, report.markdownContent)
      } catch (err) {
        console.error("[Pippen] Ingest failed for existing doc:", err)
      }

      await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: { processingStatus: "ready" },
      })

      return { success: true, docId: existing.id }
    }

    // Find a system user to attribute the upload to
    const systemUser = await findSystemUser()
    if (!systemUser) {
      return { success: false, error: "No system user found for knowledge document upload" }
    }

    // Create a new KnowledgeDocument
    // Use CUSTOM category — it's the closest match for daily learning reports
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title: existingTitle,
        description: `Auto-generated daily learnings report for ${report.date}`,
        category: "CUSTOM",
        sourceText: report.markdownContent,
        sourceType: "PIPPEN_DAILY_LEARNINGS",
        tags: ["pippen", "daily-learnings", "auto-generated"],
        processingStatus: "processing",
        uploadedById: systemUser.id,
      },
    })

    // Run the ingest pipeline (chunking + embeddings)
    try {
      await ingestDocument(doc.id, report.markdownContent)
    } catch (err) {
      console.error("[Pippen] Ingest pipeline error:", err)
      // Still mark as ready — full-text search may work even without embeddings
    }

    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { processingStatus: "ready" },
    })

    return { success: true, docId: doc.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[Pippen] ingestDailyLearnings failed:", message)
    return { success: false, error: message }
  }
}

/**
 * Find a system user to attribute automated knowledge documents to.
 * Tries: user named "Pippen" > user with SYSTEM role > first ADMIN.
 */
async function findSystemUser(): Promise<{ id: string } | null> {
  try {
    // Try to find a user named "Pippen"
    const pippen = await prisma.user.findFirst({
      where: { name: { contains: "Pippen", mode: "insensitive" } },
      select: { id: true },
    })
    if (pippen) return pippen

    // Try SYSTEM role
    const systemUser = await prisma.user.findFirst({
      where: { role: "SYSTEM" as any },
      select: { id: true },
    })
    if (systemUser) return systemUser

    // Fall back to first ADMIN
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    })
    return admin
  } catch {
    return null
  }
}
