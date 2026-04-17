import { getAvailableForms, isFormRegistered } from "./registry"

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
