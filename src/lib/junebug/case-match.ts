import { prisma } from "@/lib/db"
import { decryptField } from "@/lib/encryption"

/**
 * Heuristic case detection from a free-text user message (Full Fetch mode).
 *
 * Tries, in order:
 *   1. An exact TABS-number match (`12345.6789`).
 *   2. Any significant (length ≥ 4) token from the decrypted client name
 *      appearing in the message.
 *   3. The full decrypted client name appearing verbatim.
 *
 * Returns the first match, or null. Bounded to the 100 most-recently-active
 * non-CLOSED cases to keep the scan cheap.
 *
 * Duplicated from /api/ai/chat/route.ts into a shared lib so the Junebug
 * threads route can use it too (Full Fetch is no longer a chat-only feature).
 * When the chat route is retired, it can be deleted from there; this is the
 * canonical home.
 */
export async function findCaseByName(
  userMessage: string
): Promise<{ id: string; name: string; tabsNumber: string } | null> {
  const cases = await prisma.case.findMany({
    where: { status: { not: "CLOSED" } },
    select: { id: true, clientName: true, tabsNumber: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })

  const messageLower = userMessage.toLowerCase()

  // TABS number exact match first.
  const tabsMatch = messageLower.match(/\d{4,5}\.\d{4}/)
  if (tabsMatch) {
    const found = cases.find((c) => c.tabsNumber?.includes(tabsMatch[0]))
    if (found) {
      try {
        const name = decryptField(found.clientName)
        return { id: found.id, name, tabsNumber: found.tabsNumber || "" }
      } catch {
        return { id: found.id, name: found.tabsNumber || "Unknown", tabsNumber: found.tabsNumber || "" }
      }
    }
  }

  // Name match.
  for (const c of cases) {
    try {
      const decryptedName = decryptField(c.clientName)
      if (!decryptedName) continue

      const nameLower = decryptedName.toLowerCase()
      const nameParts = nameLower.split(/\s+/).filter((p) => p.length > 2)

      for (const part of nameParts) {
        if (part.length >= 4 && messageLower.includes(part)) {
          return { id: c.id, name: decryptedName, tabsNumber: c.tabsNumber || "" }
        }
      }

      if (messageLower.includes(nameLower)) {
        return { id: c.id, name: decryptedName, tabsNumber: c.tabsNumber || "" }
      }
    } catch {
      // Decryption failed for this row — skip.
      continue
    }
  }

  return null
}
