import { getAvailableForms, isFormRegistered } from "./registry"
import { prisma } from "@/lib/db"

export interface ResolutionPath {
  id: string
  name: string
  description: string
  baseForms: string[]
}

export const RESOLUTION_PATHS: ResolutionPath[] = [
  { id: "oic", name: "Offer in Compromise", description: "Settle for less than full balance", baseForms: ["2848", "433-A-OIC", "656", "4506-T"] },
  { id: "ia", name: "Installment Agreement", description: "Monthly payment plan", baseForms: ["2848", "9465", "433-A", "433-D", "4506-T"] },
  { id: "cnc", name: "Currently Not Collectible", description: "Temporary hardship suspension", baseForms: ["2848", "433-A", "4506-T"] },
  { id: "cdp", name: "CDP / Equivalent Hearing", description: "Appeal levy or lien action", baseForms: ["2848", "12153", "433-A", "4506-T"] },
  { id: "penalty", name: "Penalty Abatement", description: "FTA or reasonable cause relief", baseForms: ["2848", "843", "4506-T"] },
  { id: "innocent_spouse", name: "Innocent Spouse Relief", description: "Relief from joint liability", baseForms: ["2848", "8857", "433-A", "4506-T"] },
  { id: "advocate", name: "Taxpayer Advocate", description: "TAS assistance request", baseForms: ["2848", "911", "4506-T"] },
  { id: "lien_relief", name: "Lien Discharge/Withdrawal", description: "Release property or remove lien", baseForms: ["2848", "12277", "433-A", "4506-T"] },
]

export interface FormPackageItem {
  formNumber: string
  formTitle: string
  requirement: "required" | "recommended" | "if_applicable"
  reason: string
  available: boolean // Is this form's schema available in the system?
  status?: "not_started" | "in_progress" | "complete" | "submitted"
}

export interface CaseCharacteristics {
  hasBusiness: boolean
  isSelfEmployed: boolean
  isMarriedJoint: boolean
  hasIdentityTheft: boolean
  needsAmendedReturn: boolean
  hasNoITIN: boolean
  needsTranscripts: boolean
  collectionActionType?: "levy" | "lien" | "both" | "none"
  totalBalance: number
  taxPeriodsCount: number
}

export function generateFormPackage(pathId: string, characteristics: CaseCharacteristics): FormPackageItem[] {
  const path = RESOLUTION_PATHS.find(p => p.id === pathId)
  if (!path) return []

  const items: FormPackageItem[] = path.baseForms.map(formNumber => ({
    formNumber,
    formTitle: getFormTitle(formNumber),
    requirement: "required" as const,
    reason: `Required for ${path.name}`,
    available: isFormAvailable(formNumber),
  }))

  // Apply characteristic modifiers
  if (characteristics.hasBusiness && ["oic", "ia", "cnc"].includes(pathId)) {
    items.push({
      formNumber: pathId === "oic" ? "433-B-OIC" : "433-B",
      formTitle: "Collection Information Statement — Business",
      requirement: "required",
      reason: "Business liabilities present",
      available: false,
    })
  }

  if (characteristics.hasIdentityTheft) {
    items.push({
      formNumber: "14039",
      formTitle: "Identity Theft Affidavit",
      requirement: "required",
      reason: "Identity theft flagged on case",
      available: false,
    })
  }

  if (characteristics.needsAmendedReturn) {
    items.push({
      formNumber: "1040-X",
      formTitle: "Amended Individual Income Tax Return",
      requirement: "required",
      reason: "Liability discrepancy identified",
      available: false,
    })
  }

  if (characteristics.collectionActionType === "levy" && pathId !== "cdp") {
    items.push({
      formNumber: "12153",
      formTitle: "CDP/Equivalent Hearing Request",
      requirement: "recommended",
      reason: "Levy action identified — CDP hearing available",
      available: false,
    })
  }

  if (characteristics.totalBalance <= 50000 && pathId === "ia") {
    items.push({
      formNumber: "433-F",
      formTitle: "Collection Information Statement — Simplified",
      requirement: "recommended",
      reason: "Balance under $50K — streamlined IA may qualify with simplified form",
      available: false,
    })
  }

  return items
}

function getFormTitle(formNumber: string): string {
  // Sync — use the registry's metadata (no schema load required for the
  // title alone). getAvailableForms() is a tiny constant array.
  const meta = getAvailableForms().find((f) => f.formNumber === formNumber)
  if (meta) return meta.formTitle

  // Fallback titles for forms not yet in the registry
  const FALLBACK_TITLES: Record<string, string> = {
    "2848": "Power of Attorney and Declaration of Representative",
    "433-B": "Collection Information Statement (Business)",
    "433-B-OIC": "Collection Information Statement — Business (OIC)",
    "433-D": "Installment Agreement",
    "433-F": "Collection Information Statement — Simplified",
    "4506-T": "Request for Transcript of Tax Return",
    "8857": "Request for Innocent Spouse Relief",
    "12277": "Application for Withdrawal of Filed NFTL",
    "14039": "Identity Theft Affidavit",
    "1040-X": "Amended Individual Income Tax Return",
  }
  return FALLBACK_TITLES[formNumber] || formNumber
}

function isFormAvailable(formNumber: string): boolean {
  return isFormRegistered(formNumber)
}

// ─────────────────────────────────────────────────────────────────────────────
// Case-characteristic detection
//
// Replaces the old hardcoded `false` defaults with values derived from real
// case data. Practitioner overrides (stored as JSON on
// CaseIntelligence.caseCharacteristics) take precedence over the auto-detected
// values when explicitly set, so an over-caution default can be flipped on
// per case without changing detection logic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive case characteristics from the database.
 *
 * Order of precedence per field:
 *   1. CaseIntelligence.caseCharacteristics — explicit practitioner override
 *   2. Auto-detection from case + intelligence + liability + form-instance data
 *   3. Conservative default (false / 0 / "none")
 */
export async function deriveCaseCharacteristics(caseId: string): Promise<{
  characteristics: CaseCharacteristics
  detected: CaseCharacteristics
  overrides: Partial<CaseCharacteristics>
}> {
  const [caseRow, intel, liabilityPeriods, formInstances] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: { caseType: true, filingStatus: true, totalLiability: true },
    }),
    prisma.caseIntelligence.findUnique({
      where: { caseId },
      select: {
        caseCharacteristics: true,
        levyThreatActive: true,
        liensFiledActive: true,
        allReturnsFiled: true,
      },
    }),
    prisma.liabilityPeriod.findMany({
      where: { caseId },
      select: { formType: true },
    }),
    prisma.formInstance.findMany({
      where: { caseId },
      select: { formNumber: true },
    }),
  ])

  // Detect business activity. Tax form numbers that imply a business or
  // self-employment liability — 941/943/944 (employment), 940 (FUTA),
  // 1065 (partnership), 1120/1120-S (corporate), Schedule SE on 1040.
  const businessForms = new Set(["940", "941", "943", "944", "1065", "1120", "1120-S", "1120S"])
  const hasBusinessLiability = liabilityPeriods.some((p) =>
    p.formType ? businessForms.has(p.formType.replace(/\s+/g, "").toUpperCase()) : false
  )
  const hasBusinessFromCaseType = caseRow?.caseType === "TFRP" || caseRow?.caseType === "ERC"

  // Identity theft: if the case already has a 14039 instance, the
  // practitioner has flagged it. Also a useful check to prevent the modifier
  // from re-suggesting a form that's already in flight.
  const hasIdentityTheftForm = formInstances.some((i) => i.formNumber === "14039")
  const hasAmendedReturnForm = formInstances.some((i) => i.formNumber === "1040-X")

  // Collection action — preserved from existing intel mapping.
  const collectionActionType: CaseCharacteristics["collectionActionType"] =
    intel?.levyThreatActive && intel?.liensFiledActive
      ? "both"
      : intel?.levyThreatActive
      ? "levy"
      : intel?.liensFiledActive
      ? "lien"
      : "none"

  const detected: CaseCharacteristics = {
    hasBusiness: hasBusinessLiability || hasBusinessFromCaseType,
    isSelfEmployed: hasBusinessLiability,                // Conservative: any biz liability ≈ SE for v1
    isMarriedJoint: caseRow?.filingStatus === "MFJ",
    hasIdentityTheft: hasIdentityTheftForm,
    needsAmendedReturn: hasAmendedReturnForm,
    hasNoITIN: false,                                    // Not yet tracked
    needsTranscripts: !(intel?.allReturnsFiled ?? false),
    collectionActionType,
    totalBalance: Number(caseRow?.totalLiability || 0),
    taxPeriodsCount: liabilityPeriods.length,
  }

  // Apply practitioner overrides on top of detection. Only known keys, only
  // boolean / number / specific union values — defensive against bad JSON.
  const overrides: Partial<CaseCharacteristics> = {}
  const raw = (intel?.caseCharacteristics as Record<string, unknown> | null) || null
  if (raw && typeof raw === "object") {
    const boolKeys: (keyof CaseCharacteristics)[] = [
      "hasBusiness", "isSelfEmployed", "isMarriedJoint", "hasIdentityTheft",
      "needsAmendedReturn", "hasNoITIN", "needsTranscripts",
    ]
    for (const k of boolKeys) {
      if (typeof raw[k] === "boolean") (overrides as any)[k] = raw[k]
    }
    if (
      typeof raw.collectionActionType === "string" &&
      ["levy", "lien", "both", "none"].includes(raw.collectionActionType as string)
    ) {
      overrides.collectionActionType = raw.collectionActionType as CaseCharacteristics["collectionActionType"]
    }
    if (typeof raw.totalBalance === "number") overrides.totalBalance = raw.totalBalance
    if (typeof raw.taxPeriodsCount === "number") overrides.taxPeriodsCount = raw.taxPeriodsCount
  }

  return {
    detected,
    overrides,
    characteristics: { ...detected, ...overrides },
  }
}
