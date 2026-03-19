/**
 * Scrub PII from AI output before adding to knowledge base.
 * The output is stored as generic reference material, not case record.
 */
export function scrubForKnowledgeBase(
  text: string,
  clientName: string,
  caseNumber: string
): string {
  let scrubbed = text

  // Replace client names with generic labels
  const names = clientName.split(/\s*[&,]\s*/).map((n) => n.trim())
  for (const name of names) {
    if (name.length < 2) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    scrubbed = scrubbed.replace(new RegExp(escaped, "gi"), "[CLIENT]")
    // Also replace individual first/last names
    const parts = name.split(/\s+/)
    for (const part of parts) {
      if (part.length >= 3) {
        scrubbed = scrubbed.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[CLIENT]")
      }
    }
  }

  // Replace case number
  scrubbed = scrubbed.replace(new RegExp(caseNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[CASE-REF]")

  // Safety net: SSNs, EINs, account numbers
  scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
  scrubbed = scrubbed.replace(/\b\d{2}-\d{7}\b/g, "[EIN]")
  scrubbed = scrubbed.replace(/\*{2,}\d{4}/g, "[ACCT]")

  return scrubbed
}
