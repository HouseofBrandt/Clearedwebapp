/**
 * IRS Freeze Code Reference Library
 *
 * Comprehensive freeze code definitions with triggers, releases,
 * and practitioner action guidance. Used by the transcript decoder
 * to surface account freeze conditions.
 */

export interface FreezeCode {
  code: string           // e.g., "-V", "-W"
  name: string           // e.g., "Levy/Lien Freeze"
  description: string    // Plain English explanation
  triggers: string[]     // What causes this freeze
  releases: string[]     // What actions release it
  imfOnly: boolean       // Individual Master File only
  bmfOnly: boolean       // Business Master File only
  practitionerAction: string  // What the practitioner should do
}

export const FREEZE_CODES: Record<string, FreezeCode> = {
  "-A": {
    code: "-A",
    name: "Amended Return Freeze",
    description: "An amended return (1040-X) has been filed and is pending processing.",
    triggers: ["Filing of Form 1040-X", "TC 977 posted"],
    releases: ["IRS processes the amended return", "TC 571 posted"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Monitor processing. If delayed >16 weeks, contact IRS or file Form 911."
  },
  "-C": {
    code: "-C",
    name: "Combat Zone Freeze",
    description: "Taxpayer is serving in a designated combat zone. Suspends collection and assessment.",
    triggers: ["Military deployment to combat zone", "TC 500 with combat zone indicator"],
    releases: ["Return from combat zone + 180 days", "TC 501"],
    imfOnly: true, bmfOnly: false,
    practitionerAction: "Verify deployment dates. Collection and filing deadlines tolled during service."
  },
  "-D": {
    code: "-D",
    name: "Duplicate Return Freeze",
    description: "A duplicate return was filed for the same tax period.",
    triggers: ["Two returns filed for same period", "TC 976"],
    releases: ["IRS resolves which return is valid", "Manual release by IRS"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Determine if duplicate was filed in error. Contact IRS to resolve."
  },
  "-I": {
    code: "-I",
    name: "IRS Initiated Freeze",
    description: "IRS has initiated an action that requires account review before further processing.",
    triggers: ["Various IRS-initiated actions"],
    releases: ["Completion of IRS review"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Request account transcript to determine specific reason for freeze."
  },
  "-J": {
    code: "-J",
    name: "Jeopardy Assessment Freeze",
    description: "IRS determined that collection is in jeopardy and assessed tax immediately.",
    triggers: ["TC 430 (jeopardy assessment)", "Taxpayer flight risk or asset dissipation"],
    releases: ["Bond posted", "Court order", "TC 431"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Urgent: taxpayer may face immediate levy action. Consider requesting Administrative Hearing."
  },
  "-L": {
    code: "-L",
    name: "Litigation Freeze",
    description: "Case is in litigation (Tax Court, District Court, or Court of Federal Claims).",
    triggers: ["TC 520 posted", "Petition filed in Tax Court", "Refund suit filed"],
    releases: ["Court decision entered", "TC 521 posted", "Case settled"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Monitor litigation status. CSED is tolled during litigation. No collection action while pending."
  },
  "-O": {
    code: "-O",
    name: "Offer in Compromise Freeze",
    description: "An Offer in Compromise (OIC) has been submitted and is under review.",
    triggers: ["TC 480 posted", "Form 656 submitted"],
    releases: ["OIC accepted (TC 481)", "OIC rejected (TC 482)", "OIC returned (TC 483)"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Collection suspended during OIC review + 30 days. Monitor OIC status. CSED tolled."
  },
  "-P": {
    code: "-P",
    name: "Penalty Freeze",
    description: "Penalty assessment or abatement action is pending processing.",
    triggers: ["Penalty computation pending", "Abatement request filed"],
    releases: ["Penalty posted or abated", "Manual IRS release"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "If abatement was requested, follow up if processing exceeds 60 days."
  },
  "-R": {
    code: "-R",
    name: "Refund Freeze",
    description: "A refund has been computed but is being held for review before issuance.",
    triggers: ["Refund flagged for review", "Math error on return", "Offset pending", "Identity verification needed"],
    releases: ["Review completed", "Identity verified (TC 571)", "Refund issued (TC 846)"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "If refund delayed >8 weeks, check for identity verification (Letter 5071C) or math error notice."
  },
  "-S": {
    code: "-S",
    name: "Statute Freeze",
    description: "The assessment or collection statute is about to expire. IRS must act quickly or lose authority.",
    triggers: ["ASED within 90 days of expiration", "CSED approaching"],
    releases: ["Assessment made or statute expires", "Form 872 consent filed"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "CRITICAL: If CSED is approaching, do not agree to extensions without strategic analysis. Statute expiration may benefit the taxpayer."
  },
  "-V": {
    code: "-V",
    name: "Bankruptcy/Innocent Spouse Freeze",
    description: "Taxpayer has filed bankruptcy or an innocent spouse claim (IRC \u00A7 6015).",
    triggers: ["TC 520 with bankruptcy indicator", "Form 8857 filed (innocent spouse)", "Bankruptcy petition filed"],
    releases: ["Bankruptcy discharge/dismissal + 6 months", "Innocent spouse determination", "TC 521"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Verify bankruptcy dates for CSED tolling. If innocent spouse, monitor Form 8857 processing."
  },
  "-W": {
    code: "-W",
    name: "Collection Due Process (CDP) Freeze",
    description: "Taxpayer has requested a CDP hearing under IRC \u00A7 6330. Collection activity suspended.",
    triggers: ["TC 520 with CDP indicator", "Request for CDP hearing within 30 days of levy notice"],
    releases: ["CDP determination issued", "Appeals decision", "Tax Court petition deadline passes", "TC 521"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Collection suspended during CDP. CSED tolled. Prepare for hearing \u2014 gather all financial docs."
  },
  "-X": {
    code: "-X",
    name: "Installment Agreement Freeze",
    description: "Taxpayer has an installment agreement (IA) in place or a request is pending.",
    triggers: ["TC 971 AC 063 (IA request)", "TC 520 with IA indicator", "Form 9465 filed"],
    releases: ["IA defaulted (TC 971 AC 064)", "IA paid in full", "Balance satisfied", "TC 521"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "Ensure all IA terms are met. If modifying, file Form 9465 or call ACS. CSED tolled during IA request."
  },
  "-Y": {
    code: "-Y",
    name: "Criminal Investigation Freeze",
    description: "Case referred to Criminal Investigation (CI) division.",
    triggers: ["TC 914 posted", "Criminal referral from examination"],
    releases: ["CI declines prosecution", "Case returned to civil", "TC 916/TC 918"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "CRITICAL: Stop all communications with IRS. Engage criminal tax attorney immediately. Do not provide documents."
  },
  "-Z": {
    code: "-Z",
    name: "Currently Not Collectible (CNC) Freeze",
    description: "Account placed in Currently Not Collectible status due to financial hardship.",
    triggers: ["TC 530 posted", "Financial hardship determination", "Unable to locate taxpayer"],
    releases: ["Financial review shows ability to pay", "Taxpayer contacts IRS", "Periodic review triggers reactivation"],
    imfOnly: false, bmfOnly: false,
    practitionerAction: "CNC suspends collection but CSED continues to run. Monitor for periodic financial reviews (usually annually). Consider if CSED expiration is strategic."
  }
}

export function decodeFreezeCode(code: string): FreezeCode | null {
  return FREEZE_CODES[code] || FREEZE_CODES[code.toUpperCase()] || null
}

export function detectFreezeCodesInTranscript(
  transactions: { code: string; description: string }[]
): { freezeCode: string; details: FreezeCode; triggeredBy: string }[] {
  // Map TC codes to their associated freeze codes
  const tcToFreeze: Record<string, string> = {
    "480": "-O", "481": "-O", "482": "-O", "483": "-O",  // OIC
    "520": "-L",  // Could be -L, -V, -W depending on reason
    "530": "-Z",  // CNC
    "914": "-Y",  // Criminal
    "971": "-X",  // Could be IA (AC 063)
    "977": "-A",  // Amended return
  }

  const detected: { freezeCode: string; details: FreezeCode; triggeredBy: string }[] = []
  const seen = new Set<string>()

  for (const t of transactions) {
    const freezeCode = tcToFreeze[t.code]
    if (freezeCode && !seen.has(freezeCode)) {
      const details = FREEZE_CODES[freezeCode]
      if (details) {
        seen.add(freezeCode)
        detected.push({ freezeCode, details, triggeredBy: `TC ${t.code}: ${t.description}` })
      }
    }
  }

  return detected
}
