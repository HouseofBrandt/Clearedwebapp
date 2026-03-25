/**
 * Penalty Abatement Letter Template Generator
 *
 * Generates deterministic, template-based penalty abatement letters.
 * This is NOT AI-generated — it is pure string interpolation using
 * practitioner-provided facts and the penalty reference library.
 *
 * Two letter types:
 * 1. FTA Letter — cites IRM 20.1.1.3.6.1 and the clean compliance history
 * 2. Reasonable Cause Letter — structured narrative with IRM citations
 */

import { PENALTY_TYPES, type PenaltyTypeCode, getReasonableCauseCategory } from "./penalty-reference"
import type { FTAResult } from "./fta-checker"

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PenaltyInfo {
  penaltyType: PenaltyTypeCode
  taxYear: number
  penaltyAmount: number
  formType?: string
}

export interface FTALetterInput {
  /** Client / taxpayer name */
  taxpayerName: string
  /** SSN or EIN (for identification section) */
  taxpayerTIN: string
  /** TIN type */
  tinType: "SSN" | "EIN"
  /** The penalties being requested for abatement */
  penalties: PenaltyInfo[]
  /** The FTA eligibility result */
  ftaResult: FTAResult
  /** Name of the requesting practitioner */
  practitionerName: string
  /** Practitioner's license designation */
  practitionerDesignation?: string
  /** Firm name */
  firmName?: string
  /** CAF number */
  cafNumber?: string
}

export interface ReasonableCauseLetterInput {
  /** Client / taxpayer name */
  taxpayerName: string
  /** SSN or EIN */
  taxpayerTIN: string
  /** TIN type */
  tinType: "SSN" | "EIN"
  /** The penalties being requested for abatement */
  penalties: PenaltyInfo[]
  /** The reasonable cause category ID */
  reasonableCauseId: string
  /** Practitioner-written factual narrative */
  factualNarrative: string
  /** Key dates relevant to the reasonable cause claim */
  supportingDates?: string
  /** Name of the requesting practitioner */
  practitionerName: string
  /** Practitioner's license designation */
  practitionerDesignation?: string
  /** Firm name */
  firmName?: string
  /** CAF number */
  cafNumber?: string
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function penaltyDescription(p: PenaltyInfo): string {
  const info = PENALTY_TYPES[p.penaltyType]
  const form = p.formType ? ` (Form ${p.formType})` : ""
  return `${info.name} penalty (${info.irc}) for tax year ${p.taxYear}${form}: $${formatCurrency(p.penaltyAmount)}`
}

function totalPenaltyAmount(penalties: PenaltyInfo[]): number {
  return penalties.reduce((sum, p) => sum + p.penaltyAmount, 0)
}

function sigBlock(input: { practitionerName: string; practitionerDesignation?: string; firmName?: string; cafNumber?: string }): string {
  const lines = ["Respectfully submitted,", "", ""]
  lines.push(`**${input.practitionerName}**`)
  if (input.practitionerDesignation) {
    lines.push(input.practitionerDesignation)
  }
  if (input.firmName) {
    lines.push(input.firmName)
  }
  if (input.cafNumber) {
    lines.push(`CAF No. ${input.cafNumber}`)
  }
  lines.push("Power of Attorney on file (Form 2848)")
  return lines.join("\n")
}

// ═══════════════════════════════════════════════════════════════
// FTA LETTER GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a First Time Abate penalty abatement request letter.
 * Returns markdown-formatted text.
 */
export function generateFTALetter(input: FTALetterInput): string {
  const total = totalPenaltyAmount(input.penalties)
  const tinLabel = input.tinType === "SSN" ? "Social Security Number" : "Employer Identification Number"
  const penaltyList = input.penalties.map((p) => `- ${penaltyDescription(p)}`).join("\n")

  return `${formatDate()}

Internal Revenue Service
[IRS Campus Address]
[City, State ZIP]

**Re: Request for First Time Abate (FTA) Penalty Relief**
**Taxpayer:** ${input.taxpayerName}
**${tinLabel}:** ${input.taxpayerTIN}
**Tax Year(s):** ${[...new Set(input.penalties.map((p) => p.taxYear))].sort().join(", ")}
**Total Penalty Amount:** $${formatCurrency(total)}

---

Dear Sir or Madam:

[AUTO-GENERATED]

On behalf of the above-referenced taxpayer, and pursuant to the authority granted under Form 2848 (Power of Attorney), I am writing to request abatement of the following penalty(ies) under the IRS First Time Abate (FTA) administrative waiver policy set forth in **IRM 20.1.1.3.6.1**.

### Penalties at Issue

${penaltyList}

**Total Abatement Requested: $${formatCurrency(total)}**

### Basis for Relief — First Time Abate (IRM 20.1.1.3.6.1)

The IRS's First Time Abate policy provides an administrative waiver for taxpayers who meet the following criteria:

1. **Clean penalty history.** The taxpayer has not been assessed any penalties for the three tax years prior to the penalty year. As confirmed in IRS records, no penalties were assessed for tax years ${input.penalties[0].taxYear - 3}, ${input.penalties[0].taxYear - 2}, or ${input.penalties[0].taxYear - 1}.

2. **Filing compliance.** All required tax returns have been filed, or valid extensions were obtained.

3. **Payment compliance.** Any tax due has been paid, or the taxpayer has entered into an approved payment arrangement with the IRS.

The taxpayer satisfies all three criteria for FTA relief. Per IRM 20.1.1.3.6.1, the Service should exercise its authority to abate the above-referenced penalty(ies) as a one-time administrative waiver.

### Applicable Authority

- **IRC ${PENALTY_TYPES[input.penalties[0].penaltyType].irc}** — Statutory basis for the penalty
- **IRM 20.1.1.3.6.1** — First Time Abate administrative waiver
- **IRM 20.1.1.3.2** — Penalty relief provisions

### Request

Based on the foregoing, we respectfully request that the Internal Revenue Service abate the penalty(ies) identified above, totaling **$${formatCurrency(total)}**, plus any associated interest attributable to the penalty(ies), pursuant to IRM 20.1.1.3.6.1.

Please contact the undersigned if additional information is needed.

[/AUTO-GENERATED]

${sigBlock(input)}
`
}

// ═══════════════════════════════════════════════════════════════
// REASONABLE CAUSE LETTER GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a reasonable cause penalty abatement request letter.
 * Returns markdown-formatted text.
 */
export function generateReasonableCauseLetter(input: ReasonableCauseLetterInput): string {
  const total = totalPenaltyAmount(input.penalties)
  const tinLabel = input.tinType === "SSN" ? "Social Security Number" : "Employer Identification Number"
  const penaltyList = input.penalties.map((p) => `- ${penaltyDescription(p)}`).join("\n")
  const causeCategory = getReasonableCauseCategory(input.reasonableCauseId)
  const causeName = causeCategory?.label ?? "Reasonable Cause"
  const causeIRM = causeCategory?.irmRef ?? "IRM 20.1.1.3.2"

  return `${formatDate()}

Internal Revenue Service
[IRS Campus Address]
[City, State ZIP]

**Re: Request for Penalty Abatement Based on Reasonable Cause**
**Taxpayer:** ${input.taxpayerName}
**${tinLabel}:** ${input.taxpayerTIN}
**Tax Year(s):** ${[...new Set(input.penalties.map((p) => p.taxYear))].sort().join(", ")}
**Total Penalty Amount:** $${formatCurrency(total)}

---

Dear Sir or Madam:

[AUTO-GENERATED]

On behalf of the above-referenced taxpayer, and pursuant to the authority granted under Form 2848 (Power of Attorney), I am writing to request abatement of the following penalty(ies) based on reasonable cause under **IRC \u00A7 6651(a)** and **${causeIRM}**.

### Penalties at Issue

${penaltyList}

**Total Abatement Requested: $${formatCurrency(total)}**

### Legal Standard — Reasonable Cause

Under IRC \u00A7 6651(a), a penalty shall not be imposed if the taxpayer establishes that the failure was due to **reasonable cause and not due to willful neglect**. The IRS Internal Revenue Manual at IRM 20.1.1.3.2 defines reasonable cause as arising when the taxpayer exercised **ordinary business care and prudence** in determining their tax obligations but was nevertheless unable to comply.

The determination of reasonable cause is based on all the facts and circumstances in each situation. Per IRM 20.1.1.3.2.1, the IRS must consider:

- What happened and when did it happen?
- What facts and circumstances prevented the taxpayer from filing or paying on time?
- How did the taxpayer handle the situation once the impediment was removed?
- Was the taxpayer's conduct consistent with ordinary business care and prudence?

### Reasonable Cause Category: ${causeName}

**Applicable IRM Reference:** ${causeIRM}

[/AUTO-GENERATED]

### Factual Narrative

[PRACTITIONER INPUT]

${input.factualNarrative}

${input.supportingDates ? `**Key Dates:** ${input.supportingDates}` : ""}

[/PRACTITIONER INPUT]

[AUTO-GENERATED]

### Ordinary Business Care and Prudence

The facts and circumstances described above demonstrate that the taxpayer exercised ordinary business care and prudence in attempting to meet their tax obligations. The failure to [file/pay] on time was the direct result of circumstances beyond the taxpayer's reasonable control, consistent with the reasonable cause standard set forth in IRM 20.1.1.3.2.

Upon resolution of the impediment, the taxpayer took prompt action to come into compliance, further demonstrating good faith and the exercise of ordinary business care and prudence.

### Request

Based on the foregoing facts and applicable authority, we respectfully request that the Internal Revenue Service abate the penalty(ies) identified above, totaling **$${formatCurrency(total)}**, plus any associated interest attributable to the penalty(ies), pursuant to IRC \u00A7 6651(a) and ${causeIRM}.

We have enclosed supporting documentation corroborating the reasonable cause claim. Please contact the undersigned if additional information is needed.

[/AUTO-GENERATED]

${sigBlock(input)}
`
}
