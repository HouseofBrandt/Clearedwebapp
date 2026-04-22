/**
 * Full Fetch context loader — "Jarvis mode" for Junebug.
 *
 * When a practitioner flips Full Fetch on, this module assembles the
 * comprehensive live-case packet that gets spliced into the system
 * prompt. Ported from the legacy `/api/ai/chat/route.ts` (the old FAB
 * widget's Full Fetch branch) which was orphaned after chat-panel.tsx
 * was deleted — rewritten here as a Junebug-owned helper so the
 * thread workspace can consume it without resurrecting the old route.
 *
 * What it returns:
 *   - A formatted text block with documents (with extracted content),
 *     liability periods, deadlines, case intelligence, client notes,
 *     AI work products, and the case notes field — in that order.
 *   - The set of client names we inferred, handed back for the
 *     tokenizer so PII transmitted to Anthropic gets swapped for
 *     deterministic tokens (spec §3 tokenization discipline).
 *
 * What it does NOT do:
 *   - Rate-limit spending. The caller decides whether to charge a
 *     Full Fetch turn against a separate budget.
 *   - Tokenize. Upstream `runJunebugCompletion()` already tokenizes
 *     every string it ships to Claude; we just collect the name
 *     hints.
 *   - Network / Sentry logs. Those come from Vercel-diagnostics
 *     helpers (separate module).
 *
 * Safety:
 *   - Each section is wrapped in its own try/catch so one failed sub-
 *     query (e.g. a stale Prisma client schema mismatch) doesn't take
 *     down the whole packet. The worst case is a block that reads
 *     "Error loading X" and the practitioner sees partial context.
 *   - Document content is capped at 3000 chars per doc — plenty of
 *     runway for Claude to search, without flooding prompt tokens on
 *     giant scanned PDFs.
 */

import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"

const DOC_CONTENT_PREVIEW_CHARS = 3000
const CLIENT_NOTE_LIMIT = 20
const CLIENT_NOTE_PREVIEW_CHARS = 500
const AI_TASK_LIMIT = 5
const AI_TASK_PREVIEW_CHARS = 800
const DEADLINE_LIMIT = 10

export interface FullFetchResult {
  /** Text block to concat onto the system prompt. Null if the case
   *  couldn't be loaded at all (e.g. deleted mid-request). */
  data: string | null
  /** Client names detected — tokenizer hints. */
  knownNames: string[]
}

/**
 * Load the comprehensive packet for a single case. Returns { data: null }
 * when the case row can't be fetched; returns the best partial packet
 * otherwise.
 */
export async function loadFullFetchCaseData(
  caseId: string
): Promise<FullFetchResult> {
  const caseData = await prisma.case
    .findUnique({
      where: { id: caseId },
      include: {
        assignedPractitioner: { select: { name: true } },
      },
    })
    .catch(() => null)

  if (!caseData) return { data: null, knownNames: [] }

  let clientName: string
  try {
    clientName = decryptField(caseData.clientName)
  } catch {
    clientName = caseData.tabsNumber || "Unknown Client"
  }

  const knownNames: string[] = [clientName]

  let ctx = `\n\n=== FULL FETCH: LIVE CASE DATA FOR ${clientName} (${caseData.tabsNumber}) ===\n`
  ctx += `Case Type: ${caseData.caseType} | Status: ${caseData.status}`
  if (caseData.filingStatus) ctx += ` | Filing: ${caseData.filingStatus}`
  if (caseData.totalLiability) {
    ctx += ` | Total Liability: $${Number(caseData.totalLiability).toLocaleString()}`
  }
  ctx += ` | Assigned: ${caseData.assignedPractitioner?.name || "Unassigned"}\n`

  // Documents — separate query so one bad row (e.g. a corrupt
  // extractedText blob) doesn't take down the whole packet.
  try {
    const documents = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        fileName: true,
        documentCategory: true,
        extractedText: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: "desc" },
    })
    ctx += `\nDOCUMENTS ON FILE (${documents.length}):\n`
    for (const doc of documents) {
      ctx += `- ${doc.fileName} [${doc.documentCategory}] (${doc.uploadedAt.toLocaleDateString()})\n`
      if (doc.extractedText) {
        const preview = doc.extractedText.slice(0, DOC_CONTENT_PREVIEW_CHARS)
        ctx += `  CONTENT:\n${preview}\n`
        if (doc.extractedText.length > DOC_CONTENT_PREVIEW_CHARS) {
          ctx += `  ...(${doc.extractedText.length - DOC_CONTENT_PREVIEW_CHARS} more chars)\n`
        }
      }
    }
  } catch (e: any) {
    console.error("[FullFetch] documents query failed:", e?.message)
    ctx += `\nDOCUMENTS: Error loading documents\n`
  }

  // Liability periods — exact dollar amounts + CSEDs so Junebug can
  // reason about time-critical OIC / IA decisions.
  try {
    const liabilityPeriods = await prisma.liabilityPeriod.findMany({
      where: { caseId },
      orderBy: { taxYear: "asc" },
    })
    if (liabilityPeriods.length > 0) {
      const totalLiability = liabilityPeriods.reduce(
        (sum, lp) => sum + Number(lp.totalBalance || 0),
        0
      )
      ctx += `\nLIABILITY PERIODS (${liabilityPeriods.length} periods, TOTAL: $${totalLiability.toLocaleString()}):\n`
      for (const lp of liabilityPeriods) {
        ctx += `  TY ${lp.taxYear} | Form ${lp.formType} | Assessment: $${Number(
          lp.originalAssessment || 0
        ).toLocaleString()} | Penalties: $${Number(
          lp.penalties || 0
        ).toLocaleString()} | Interest: $${Number(
          lp.interest || 0
        ).toLocaleString()} | TOTAL DUE: $${Number(
          lp.totalBalance || 0
        ).toLocaleString()} | Status: ${lp.status || "N/A"}`
        if (lp.assessmentDate)
          ctx += ` | Assessed: ${lp.assessmentDate.toLocaleDateString()}`
        if (lp.csedDate) ctx += ` | CSED: ${lp.csedDate.toLocaleDateString()}`
        ctx += `\n`
      }
    }
  } catch (e: any) {
    console.error("[FullFetch] liability periods query failed:", e?.message)
  }

  // Deadlines
  try {
    const deadlines = await prisma.deadline.findMany({
      where: { caseId, status: { not: "COMPLETED" } },
      orderBy: { dueDate: "asc" },
      take: DEADLINE_LIMIT,
    })
    if (deadlines.length > 0) {
      ctx += `\nACTIVE DEADLINES:\n`
      for (const d of deadlines) {
        const daysRemaining = Math.ceil(
          (d.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        ctx += `- ${d.title}: ${d.dueDate.toLocaleDateString()} (${
          daysRemaining <= 0 ? "OVERDUE" : `${daysRemaining} days`
        }, ${d.priority})\n`
      }
    }
  } catch (e: any) {
    console.error("[FullFetch] deadlines query failed:", e?.message)
  }

  // Case intelligence digest + next steps
  try {
    const intelligence = await prisma.caseIntelligence.findUnique({
      where: { caseId },
    })
    if (intelligence) {
      ctx += `\nCASE INTELLIGENCE:\n`
      if (intelligence.digest) ctx += `Digest: ${intelligence.digest}\n`
      if (intelligence.nextSteps) {
        const steps = intelligence.nextSteps as any[]
        if (Array.isArray(steps) && steps.length > 0) {
          ctx += `Next Steps:\n`
          for (const s of steps.slice(0, 5)) {
            ctx += `  - [${String(s.priority || "NORMAL").toUpperCase()}] ${
              s.action
            }${s.reason ? ` — ${s.reason}` : ""}\n`
          }
        }
      }
      if (intelligence.irsLastAction)
        ctx += `IRS Last Action: ${intelligence.irsLastAction}\n`
      if (intelligence.irsAssignedUnit)
        ctx += `IRS Assigned Unit: ${intelligence.irsAssignedUnit}\n`
    }
  } catch (e: any) {
    console.error("[FullFetch] intelligence query failed:", e?.message)
  }

  // Client notes
  try {
    const clientNotes = await prisma.clientNote.findMany({
      where: { caseId, isDeleted: false },
      select: {
        content: true,
        noteType: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: CLIENT_NOTE_LIMIT,
    })
    if (clientNotes.length > 0) {
      ctx += `\nCLIENT NOTES (${clientNotes.length}):\n`
      for (const note of clientNotes) {
        ctx += `- [${note.noteType}] ${note.title || "(no title)"} (${note.createdAt.toLocaleDateString()}):\n`
        ctx += `  ${note.content.slice(0, CLIENT_NOTE_PREVIEW_CHARS)}\n`
      }
    }
  } catch (e: any) {
    console.error("[FullFetch] client notes query failed:", e?.message)
  }

  // AI work products — approved or awaiting review. Practitioners
  // often ask "what did the last memo say?" and Full Fetch should
  // surface that without a second retrieval round-trip.
  try {
    const aiTasks = await prisma.aITask.findMany({
      where: { caseId, status: { in: ["READY_FOR_REVIEW", "APPROVED"] } },
      select: {
        taskType: true,
        status: true,
        detokenizedOutput: true,
        createdAt: true,
        banjoStepLabel: true,
      },
      orderBy: { createdAt: "desc" },
      take: AI_TASK_LIMIT,
    })
    if (aiTasks.length > 0) {
      ctx += `\nAI WORK PRODUCTS:\n`
      for (const task of aiTasks) {
        ctx += `- ${task.banjoStepLabel || task.taskType} (${task.status}, ${task.createdAt.toLocaleDateString()})\n`
        if (task.detokenizedOutput) {
          try {
            const output = decryptField(task.detokenizedOutput)
            ctx += `  Preview: ${output.slice(0, AI_TASK_PREVIEW_CHARS)}\n`
          } catch {
            /* decryption failed — skip */
          }
        }
      }
    }
  } catch (e: any) {
    console.error("[FullFetch] AI tasks query failed:", e?.message)
  }

  if (caseData.notes) {
    ctx += `\nCASE NOTES (legacy field):\n${caseData.notes.slice(0, 500)}\n`
  }

  ctx += `\n=== END FULL FETCH DATA ===\n`

  return { data: ctx, knownNames }
}

/**
 * Response-standards block for the system prompt when Full Fetch is
 * active. Tells the model that the data is live, forbids the "I don't
 * have access" hedge, and asks for practitioner-grade output. Kept
 * short because the model will also see the TREAT-BASED RETROSPECTIVE
 * block + the FIRM KNOWLEDGE BASE block on the same turn.
 */
export const FULL_FETCH_RESPONSE_RULES = `

=== FULL FETCH MODE — RESPONSE STANDARDS ===

You have LIVE CASE DATA loaded above between the === FULL FETCH === markers.
This is not retrieval augmentation — it's the actual case, straight from
Postgres, as of this turn. Treat it as authoritative and use it.

RESPONSE RULES:
1. LEAD WITH DATA, NOT FILENAMES. Answer the question; cite the document
   only when specificity helps the practitioner verify.
2. BE SPECIFIC AND CITE NUMBERS. Tax years, liability amounts, CSEDs,
   assessment dates — quote them. Never paraphrase a figure you could
   transcribe.
3. FORMAT FOR PRACTITIONERS. Bulleted, scan-first. Skip the pleasantries.
4. NEVER SAY "I don't have access" WHEN THE DATA IS LOADED ABOVE. If
   the packet has it, you have it. If the practitioner asks about
   something that genuinely isn't in the packet, say so specifically
   ("the packet includes documents and liability periods but no IRS
   transcripts — upload the transcript to confirm").
5. PROACTIVE INSIGHTS. If you spot a conflict (stale deadline, missing
   form, collection-statute risk, numeric discrepancy between
   liability periods and total), surface it even if the practitioner
   didn't ask.
6. KEEP IT CONCISE. Full Fetch buys you context, not word count.

=== END FULL FETCH RESPONSE STANDARDS ===`

/**
 * Best-effort case detection from a user's free-text message. Lets
 * Full Fetch load case context even on a general (un-scoped) thread
 * when the practitioner drops a TABS number or a client name in their
 * question. Adapted from the legacy /api/ai/chat route — same logic,
 * just lives next to its only remaining caller now.
 *
 * Returns null when no match is confident enough; returns the case id
 * + decrypted name when matched. Never throws.
 */
export async function findCaseByNameOrTabs(
  userMessage: string
): Promise<{ id: string; name: string; tabsNumber: string } | null> {
  try {
    const cases = await prisma.case.findMany({
      where: { status: { not: "CLOSED" } },
      select: {
        id: true,
        clientName: true,
        tabsNumber: true,
      },
      take: 100,
    })

    const messageLower = userMessage.toLowerCase()

    // TABS pattern: NNNN.NNNN or NNNNN.NNNN — exact match wins.
    const tabsMatch = messageLower.match(/\d{4,5}\.\d{4}/)
    if (tabsMatch) {
      const found = cases.find((c) => c.tabsNumber?.includes(tabsMatch[0]))
      if (found) {
        let name: string
        try {
          name = decryptField(found.clientName)
        } catch {
          name = found.tabsNumber || "Unknown"
        }
        return { id: found.id, name, tabsNumber: found.tabsNumber || "" }
      }
    }

    // Fuzzy name match — any decrypted name-part of 4+ chars that
    // appears in the message. Skips short parts (Jr, II) to avoid
    // false positives.
    for (const c of cases) {
      try {
        const decryptedName = decryptField(c.clientName)
        if (!decryptedName) continue
        const nameLower = decryptedName.toLowerCase()

        if (messageLower.includes(nameLower)) {
          return {
            id: c.id,
            name: decryptedName,
            tabsNumber: c.tabsNumber || "",
          }
        }

        const nameParts = nameLower.split(/\s+/).filter((p) => p.length >= 4)
        for (const part of nameParts) {
          if (messageLower.includes(part)) {
            return {
              id: c.id,
              name: decryptedName,
              tabsNumber: c.tabsNumber || "",
            }
          }
        }
      } catch {
        continue
      }
    }

    return null
  } catch {
    return null
  }
}
