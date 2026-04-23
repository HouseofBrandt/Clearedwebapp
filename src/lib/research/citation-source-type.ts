/**
 * Maps a parsed citation's `kind` to the `ResearchSourceType` enum used by
 * the `research_sources` table. Kept in its own file because both the
 * launch route (runtime) and the eval harness (test) need it, and pulling
 * it through web-research.ts would force test-time imports of the full
 * Anthropic client.
 */

import type { CitationKind } from "./citation-normalizer"

export type ResearchSourceTypeLiteral =
  | "KB_INTERNAL"
  | "IRC_STATUTE"
  | "TREASURY_REGULATION"
  | "IRM_SECTION"
  | "REVENUE_PROCEDURE"
  | "REVENUE_RULING"
  | "TAX_COURT"
  | "CIRCUIT_COURT"
  | "SUPREME_COURT"
  | "PLR_CCA"
  | "IRS_PUBLICATION"
  | "TREATISE"
  | "WEB_GENERAL"
  | "FIRM_WORK_PRODUCT"

export function citationKindToSourceType(
  kind: CitationKind,
  courtOrAgency?: string
): ResearchSourceTypeLiteral {
  switch (kind) {
    case "irc":        return "IRC_STATUTE"
    case "treas_reg":  return "TREASURY_REGULATION"
    case "irm":        return "IRM_SECTION"
    case "rev_proc":   return "REVENUE_PROCEDURE"
    case "rev_rul":    return "REVENUE_RULING"
    case "notice":     return "REVENUE_PROCEDURE" // No distinct enum; Notices group with other IRB guidance.
    case "plr":        return "PLR_CCA"
    case "tc_regular":
    case "tc_memo":    return "TAX_COURT"
    case "federal_case": {
      const c = (courtOrAgency || "").toLowerCase()
      if (c.includes("supreme")) return "SUPREME_COURT"
      return "CIRCUIT_COURT"
    }
    case "unknown":
    default:           return "WEB_GENERAL"
  }
}
