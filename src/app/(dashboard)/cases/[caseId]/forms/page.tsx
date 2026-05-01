import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { canAccessCase } from "@/lib/auth/case-access"
import { notFound } from "next/navigation"
import {
  generateFormPackage,
  RESOLUTION_PATHS,
  deriveCaseCharacteristics,
} from "@/lib/forms/resolution-engine"
import { getAvailableForms, FORM_BUILDER_V2_ENABLED } from "@/lib/forms/registry"
import { CaseFormsPackage } from "@/components/forms/case-forms-package"

export const dynamic = "force-dynamic"

/**
 * Case-first form hub.
 *
 * Shows the full resolution package for a case — required + recommended
 * + if-applicable forms — with progress indicators, reason-for-inclusion,
 * and actions (open wizard, download merged package).
 *
 * Controlled by FORM_BUILDER_V2_ENABLED. When the flag is off, users see
 * the legacy generic form hub at /forms.
 */
export default async function CaseFormsPage({
  params,
}: {
  params: { caseId: string }
}) {
  const session = await requireAuth()
  const userId = (session.user as any).id

  const hasAccess = await canAccessCase(userId, params.caseId)
  if (!hasAccess) notFound()

  if (!FORM_BUILDER_V2_ENABLED) {
    // Flag off — redirect to legacy hub. Using notFound() here is the safe default
    // so a URL typo during rollout doesn't expose an empty shell.
    notFound()
  }

  const [caseData, intel, instances, derived] = await Promise.all([
    prisma.case.findUnique({
      where: { id: params.caseId },
      select: {
        id: true,
        clientName: true,
        tabsNumber: true,
        caseType: true,
        totalLiability: true,
        filingStatus: true,
      },
    }),
    prisma.caseIntelligence.findUnique({
      where: { caseId: params.caseId },
      select: {
        resolutionType: true,
        recommendedPath: true,
        pathRecommendationReason: true,
        pathRecommendationAt: true,
      },
    }),
    prisma.formInstance.findMany({
      where: { caseId: params.caseId },
      select: {
        id: true,
        formNumber: true,
        status: true,
        values: true,
        completedSections: true,
        revision: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    deriveCaseCharacteristics(params.caseId),
  ])

  if (!caseData) notFound()

  // Resolution path: prefer the practitioner's explicit choice, then the
  // cached AI recommendation, then a heuristic from caseType.
  const pathId = inferPathId(
    intel?.resolutionType,
    intel?.recommendedPath,
    caseData.caseType
  )

  const packageItems = generateFormPackage(pathId, derived.characteristics)

  const instancesByForm = new Map<string, typeof instances[number][]>()
  for (const inst of instances) {
    const arr = instancesByForm.get(inst.formNumber) || []
    arr.push(inst)
    instancesByForm.set(inst.formNumber, arr)
  }

  const availableForms = getAvailableForms()

  return (
    <CaseFormsPackage
      caseId={params.caseId}
      caseNumber={caseData.tabsNumber}
      clientName={caseData.clientName}
      resolutionPathId={pathId}
      resolutionPathName={RESOLUTION_PATHS.find((p) => p.id === pathId)?.name || "Resolution Package"}
      allPaths={RESOLUTION_PATHS.map((p) => ({ id: p.id, name: p.name, description: p.description }))}
      packageItems={packageItems}
      detectedCharacteristics={derived.detected}
      characteristicOverrides={derived.overrides}
      effectiveCharacteristics={derived.characteristics}
      recommendation={
        intel?.recommendedPath
          ? {
              path: intel.recommendedPath,
              reasoning: intel.pathRecommendationReason || "",
              recommendedAt: intel.pathRecommendationAt?.toISOString() || null,
            }
          : null
      }
      instances={instances.map((i) => ({
        id: i.id,
        formNumber: i.formNumber,
        status: i.status,
        updatedAt: i.updatedAt.toISOString(),
        completionPercent: computeCompletionPercent(i.values as Record<string, any>, i.formNumber),
      }))}
      availableForms={availableForms}
    />
  )
}

function inferPathId(
  resolutionPath: string | null | undefined,
  recommendedPath: string | null | undefined,
  caseType: string
): string {
  // 1. Practitioner's explicit choice (CaseIntelligence.resolutionType).
  if (resolutionPath && typeof resolutionPath === "string") {
    const normalized = resolutionPath.toLowerCase()
    if (RESOLUTION_PATHS.find((p) => p.id === normalized)) return normalized
  }
  // 2. Cached AI recommendation.
  if (recommendedPath && typeof recommendedPath === "string") {
    if (RESOLUTION_PATHS.find((p) => p.id === recommendedPath)) return recommendedPath
  }
  // 3. Heuristic from caseType enum.
  switch (caseType) {
    case "OIC":             return "oic"
    case "IA":              return "ia"
    case "CNC":             return "cnc"
    case "CDP":             return "cdp"
    case "PENALTY":         return "penalty"
    case "INNOCENT_SPOUSE": return "innocent_spouse"
    case "TFRP":            return "ia" // TFRP doesn't have its own path in v1; use IA as the closest starting point.
    default:                return "ia"
  }
}

function computeCompletionPercent(values: Record<string, any> | null, formNumber: string): number {
  if (!values) return 0
  const totalKeys = Object.keys(values).length
  if (totalKeys === 0) return 0
  const filled = Object.values(values).filter((v) => {
    if (v === null || v === undefined || v === "") return false
    if (Array.isArray(v) && v.length === 0) return false
    return true
  }).length
  return Math.round((filled / totalKeys) * 100)
}
