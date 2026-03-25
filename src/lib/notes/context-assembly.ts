import { prisma } from "@/lib/db"

// ─── Types ─────────────────────────────────────────────────

export interface NoteContextItem {
  id: string
  type: string // noteType or "conversation"
  title: string
  author: string
  date: string
  content: string
  reason: string // why included: "pinned", "strategy", "feature-relevant", etc.
}

export interface NoteContextResult {
  contextText: string  // formatted text for AI prompt injection
  usedItems: NoteContextItem[]  // for transparency panel
}

// ─── Priority tiers for note inclusion ─────────────────────

const ALWAYS_INCLUDE_TYPES = new Set([
  "STRATEGY_NOTE",
  "CLIENT_INTERACTION",
])

const IRS_RELEVANT_TYPES = new Set([
  "IRS_CONTACT",
])

const DEPRIORITIZED_TYPES = new Set([
  "GENERAL",
])

// ─── Main assembly function ────────────────────────────────

export async function assembleNoteContext(
  caseId: string,
  options?: {
    featureArea?: string
    taxYears?: number[]
    maxChars?: number
  }
): Promise<NoteContextResult> {
  const maxChars = options?.maxChars || 8000
  const featureArea = options?.featureArea || null
  const taxYears = options?.taxYears || []

  // 1. Query all non-deleted notes for the case
  const notes = await prisma.clientNote.findMany({
    where: {
      caseId,
      isDeleted: false,
      // Exclude PRIVATE notes from AI context (only author should see)
      visibility: { not: "PRIVATE" },
    },
    include: {
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // 2. Query open + recently resolved conversations (90 days)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const conversations = await prisma.conversation.findMany({
    where: {
      caseId,
      OR: [
        { status: "OPEN" },
        { status: "RESOLVED", resolvedAt: { gte: ninetyDaysAgo } },
      ],
    },
    include: {
      startedBy: { select: { name: true } },
      messages: {
        where: { isDeleted: false },
        include: {
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  // 2b. Query audio documents with transcripts for this case
  const audioDocuments = await prisma.document.findMany({
    where: {
      caseId,
      fileType: "AUDIO",
      extractedText: { not: null },
    },
    include: {
      uploadedBy: { select: { name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  })

  // 3. Score and prioritize items
  const scoredItems: Array<{
    item: NoteContextItem
    score: number
  }> = []

  // Score notes
  for (const note of notes) {
    let score = 0
    let reason = ""

    // Pinned notes: highest priority
    if (note.pinned) {
      score += 100
      reason = "pinned"
    }

    // Strategy notes and client interaction: always include
    if (ALWAYS_INCLUDE_TYPES.has(note.noteType)) {
      score += 80
      if (!reason) reason = note.noteType === "STRATEGY_NOTE" ? "strategy" : "client-interaction"
    }

    // IRS contact notes
    if (IRS_RELEVANT_TYPES.has(note.noteType)) {
      score += 70
      if (!reason) reason = "irs-contact"
    }

    // Feature-relevant
    if (featureArea && note.relatedFeature === featureArea) {
      score += 60
      if (!reason) reason = "feature-relevant"
    }

    // Tax-year-relevant
    if (taxYears.length > 0 && note.taxYears.some(y => taxYears.includes(y))) {
      score += 50
      if (!reason) reason = "tax-year-relevant"
    }

    // Call logs and research
    if (note.noteType === "CALL_LOG") {
      score += 40
      if (!reason) reason = "call-log"
    }
    if (note.noteType === "RESEARCH") {
      score += 35
      if (!reason) reason = "research"
    }

    // Journal entries
    if (note.noteType === "JOURNAL_ENTRY") {
      score += 30
      if (!reason) reason = "journal"
    }

    // Deprioritized
    if (DEPRIORITIZED_TYPES.has(note.noteType)) {
      score += 10
      if (!reason) reason = "general"
    }

    // Recency boost (within 30 days)
    const daysSinceCreation = (Date.now() - note.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceCreation < 7) score += 15
    else if (daysSinceCreation < 30) score += 5

    // Privileged notes should be included for AI context (they are work product)
    if (note.isPrivileged) {
      score += 10
    }

    if (score === 0) {
      score = 5  // baseline so everything has a chance
      reason = "general"
    }

    scoredItems.push({
      item: {
        id: note.id,
        type: note.noteType,
        title: note.title || `${note.noteType.replace(/_/g, " ")} note`,
        author: note.author.name || "Unknown",
        date: note.createdAt.toISOString().split("T")[0],
        content: note.content,
        reason,
      },
      score,
    })
  }

  // Score conversations
  for (const conv of conversations) {
    let score = 0
    let reason = ""

    // Open conversations are more relevant
    if (conv.status === "OPEN") {
      score += 55
      reason = "open-conversation"
    } else {
      score += 25
      reason = "recently-resolved-conversation"
    }

    // Feature-relevant
    if (featureArea && conv.relatedFeature === featureArea) {
      score += 30
      if (reason === "open-conversation" || reason === "recently-resolved-conversation") {
        reason += "+feature-relevant"
      }
    }

    // Tax-year-relevant
    if (taxYears.length > 0 && conv.relatedTaxYears.some(y => taxYears.includes(y))) {
      score += 20
    }

    // Urgent conversations
    if (conv.priority === "URGENT") {
      score += 20
    }

    // Recency boost
    const daysSinceUpdate = (Date.now() - conv.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate < 7) score += 15
    else if (daysSinceUpdate < 30) score += 5

    // Build conversation content from messages
    const msgContent = conv.messages
      .map(m => `[${m.author.name}]: ${m.content}`)
      .join("\n")

    scoredItems.push({
      item: {
        id: conv.id,
        type: "conversation",
        title: conv.subject,
        author: conv.startedBy.name || "Unknown",
        date: conv.createdAt.toISOString().split("T")[0],
        content: msgContent || "(no messages)",
        reason,
      },
      score,
    })
  }

  // Score audio transcripts
  for (const doc of audioDocuments) {
    let score = 40 // base score, same as CALL_LOG
    let reason = "Audio transcript"

    // Recency boost (within 7 days)
    const daysSinceUpload = (Date.now() - doc.uploadedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceUpload < 7) score += 15
    else if (daysSinceUpload < 30) score += 5

    const categoryLabel = doc.documentCategory.replace(/_/g, " ").toLowerCase()
    const dateStr = doc.uploadedAt.toISOString().split("T")[0]

    scoredItems.push({
      item: {
        id: doc.id,
        type: "AUDIO_TRANSCRIPT",
        title: doc.fileName,
        author: doc.uploadedBy.name || "Unknown",
        date: dateStr,
        content: doc.extractedText || "",
        reason,
      },
      score,
    })
  }

  // 4. Sort by score descending
  scoredItems.sort((a, b) => b.score - a.score)

  // 5. Build context text respecting maxChars
  const usedItems: NoteContextItem[] = []
  let totalChars = 0
  const contextParts: string[] = []

  for (const { item } of scoredItems) {
    // Estimate the size of this item's formatted text
    const formatted = formatContextItem(item)
    const itemChars = formatted.length

    if (totalChars + itemChars > maxChars && usedItems.length > 0) {
      // Try a truncated version
      const remaining = maxChars - totalChars
      if (remaining > 200) {
        const truncatedContent = item.content.slice(0, remaining - 100) + "..."
        const truncatedItem = { ...item, content: truncatedContent }
        const truncatedFormatted = formatContextItem(truncatedItem)
        contextParts.push(truncatedFormatted)
        usedItems.push(truncatedItem)
      }
      break
    }

    contextParts.push(formatted)
    usedItems.push(item)
    totalChars += itemChars
  }

  const contextText = usedItems.length > 0
    ? `PRACTITIONER NOTES & CONVERSATIONS:\n${contextParts.join("\n\n")}`
    : ""

  return { contextText, usedItems }
}

// ─── Format a single context item ──────────────────────────

function formatContextItem(item: NoteContextItem): string {
  const typeLabel = item.type === "conversation"
    ? "CONVERSATION"
    : item.type === "AUDIO_TRANSCRIPT"
    ? "AUDIO_TRANSCRIPT"
    : item.type.replace(/_/g, " ")

  let text = `[${typeLabel}] "${item.title}" (${item.date}, by ${item.author})\n`
  text += item.content

  return text
}
