import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/db"
import { canAccessCase } from "@/lib/auth/case-access"
import { callClaude } from "@/lib/ai/client"
import {
  RESOLUTION_PATHS,
  deriveCaseCharacteristics,
} from "@/lib/forms/resolution-engine"

/**
 * POST /api/cases/[caseId]/recommend-resolution
 *
 * Asks Claude to analyze the case and recommend a resolution path with
 * reasoning. Caches the answer on CaseIntelligence so subsequent page
 * loads don't re-call the model. Re-running this endpoint always
 * recomputes (the practitioner explicitly clicked "Get AI recommendation").
 *
 * Response shape:
 *   {
 *     recommendedPath: string,           // RESOLUTION_PATHS[].id
 *     reasoning: string,                 // 2-4 sentence rationale
 *     alternativePaths?: string[],       // ordered fallback paths
 *     confidence: "high" | "medium" | "low"
 *   }
 *
 * The endpoint never throws on an empty / malformed model response — it
 * falls back to a heuristic recommendation derived from the case data so
 * the UI always has something to display.
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = (session.user as any).id
  const allowed = await canAccessCase(userId, params.caseId)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Pull the data we need to feed Claude. Most of it comes from
  // deriveCaseCharacteristics + the intelligence row.
  const [caseRow, intel, derived] = await Promise.all([
    prisma.case.findUnique({
      where: { id: params.caseId },
      select: {
        clientName: true,
        tabsNumber: true,
        caseType: true,
        filingStatus: true,
        totalLiability: true,
      },
    }),
    prisma.caseIntelligence.findUnique({
      where: { caseId: params.caseId },
      select: {
        rpcEstimate: true,
        offerAmount: true,
        allReturnsFiled: true,
        levyThreatActive: true,
        liensFiledActive: true,
        csedEarliest: true,
        digest: true,
      },
    }),
    deriveCaseCharacteristics(params.caseId),
  ])

  if (!caseRow) return NextResponse.json({ error: "Case not found" }, { status: 404 })

  // Heuristic fallback — used if the AI call fails OR if the model returns
  // garbage. Order: explicit overrides > characteristic-driven > IA default.
  const heuristic = pickHeuristicPath(derived.characteristics, intel)

  const systemPrompt = `You are a tax-resolution strategist for a licensed practitioner. Your job is to recommend the best IRS resolution path for a single case based on the provided data.

Resolution paths you can choose from (use exactly one of these ids):
${RESOLUTION_PATHS.map((p) => `  - "${p.id}": ${p.name} — ${p.description}`).join("\n")}

Respond with a single JSON object, nothing else:
{
  "recommendedPath": "<id>",
  "reasoning": "<2-4 sentence rationale grounded in the case data — cite specific numbers and facts>",
  "alternativePaths": ["<id>", ...],
  "confidence": "high" | "medium" | "low"
}

Decision rules:
- OIC requires RCP < liability and the taxpayer to be in compliance. Don't recommend OIC if RCP estimate ≥ total liability or all-returns-filed is false.
- IA is the safe default for liabilities < $50K when the taxpayer can pay over time.
- CNC fits when monthly remaining income is at or near zero and the taxpayer has minimal asset equity.
- CDP is a deadline-driven response to a levy / lien notice — only recommend if the case shows active levy or lien activity.
- Penalty Abatement targets specific tax-year penalties; mention which year qualifies.
- Innocent Spouse requires MFJ filing status and a fact pattern of one spouse's misconduct.
- TAS / Taxpayer Advocate is for systemic IRS dysfunction or hardship; not a primary path.
- Lien Discharge / Withdrawal is supplementary, not a primary resolution.

Be specific. Use the numbers in your reasoning.`

  const userMessage = buildCasePrompt(caseRow, intel, derived.characteristics)

  let result: {
    recommendedPath: string
    reasoning: string
    alternativePaths?: string[]
    confidence: "high" | "medium" | "low"
  } | null = null

  try {
    const response = await callClaude({
      systemPrompt,
      userMessage,
      model: "claude-sonnet-4-6",
      temperature: 0.2,
      maxTokens: 1500,
    })
    const parsed = parseRecommendation(response.content)
    if (parsed && RESOLUTION_PATHS.some((p) => p.id === parsed.recommendedPath)) {
      result = parsed
    }
  } catch (err: any) {
    console.warn("[recommend-resolution] Claude call failed", { caseId: params.caseId, error: err?.message })
  }

  if (!result) {
    // Fallback to heuristic — still useful, no AI fingerprint required.
    result = {
      recommendedPath: heuristic.path,
      reasoning: heuristic.reasoning,
      confidence: "low",
    }
  }

  // Cache. Upsert because not every case has an intel row yet.
  await prisma.caseIntelligence.upsert({
    where: { caseId: params.caseId },
    update: {
      recommendedPath: result.recommendedPath,
      pathRecommendationReason: result.reasoning,
      pathRecommendationAt: new Date(),
    },
    create: {
      caseId: params.caseId,
      recommendedPath: result.recommendedPath,
      pathRecommendationReason: result.reasoning,
      pathRecommendationAt: new Date(),
    },
  })

  return NextResponse.json(result)
}

function buildCasePrompt(
  caseRow: { clientName: string; tabsNumber: string; caseType: string; filingStatus: string | null; totalLiability: any },
  intel: any,
  c: any
): string {
  const lines: string[] = []
  lines.push(`Case: ${caseRow.tabsNumber} — ${caseRow.clientName}`)
  lines.push(`Current case type: ${caseRow.caseType}`)
  lines.push(`Filing status: ${caseRow.filingStatus || "unknown"}`)
  lines.push(`Total liability: $${Number(caseRow.totalLiability || 0).toLocaleString()}`)
  if (intel?.rpcEstimate) lines.push(`Reasonable Collection Potential (RCP) estimate: $${Number(intel.rpcEstimate).toLocaleString()}`)
  if (intel?.offerAmount) lines.push(`Existing offer amount: $${Number(intel.offerAmount).toLocaleString()}`)
  lines.push(`All returns filed: ${intel?.allReturnsFiled ? "yes" : "no"}`)
  lines.push(`Active levy: ${intel?.levyThreatActive ? "yes" : "no"}`)
  lines.push(`Active lien: ${intel?.liensFiledActive ? "yes" : "no"}`)
  if (intel?.csedEarliest) lines.push(`Earliest CSED: ${new Date(intel.csedEarliest).toISOString().slice(0, 10)}`)
  if (intel?.digest) lines.push(`Case digest: ${String(intel.digest).slice(0, 800)}`)
  lines.push("")
  lines.push("Detected characteristics:")
  lines.push(`  - hasBusiness: ${c.hasBusiness}`)
  lines.push(`  - isSelfEmployed: ${c.isSelfEmployed}`)
  lines.push(`  - isMarriedJoint: ${c.isMarriedJoint}`)
  lines.push(`  - hasIdentityTheft: ${c.hasIdentityTheft}`)
  lines.push(`  - needsAmendedReturn: ${c.needsAmendedReturn}`)
  lines.push(`  - needsTranscripts: ${c.needsTranscripts}`)
  lines.push(`  - collectionActionType: ${c.collectionActionType}`)
  lines.push(`  - taxPeriodsCount: ${c.taxPeriodsCount}`)
  return lines.join("\n")
}

function parseRecommendation(text: string): {
  recommendedPath: string
  reasoning: string
  alternativePaths?: string[]
  confidence: "high" | "medium" | "low"
} | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim()
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  if (
    parsed &&
    typeof parsed.recommendedPath === "string" &&
    typeof parsed.reasoning === "string" &&
    ["high", "medium", "low"].includes(parsed.confidence)
  ) {
    return {
      recommendedPath: parsed.recommendedPath,
      reasoning: parsed.reasoning,
      alternativePaths: Array.isArray(parsed.alternativePaths) ? parsed.alternativePaths : undefined,
      confidence: parsed.confidence,
    }
  }
  return null
}

function pickHeuristicPath(
  c: any,
  intel: any
): { path: string; reasoning: string } {
  const balance = Number(c.totalBalance || 0)
  const rpc = Number(intel?.rpcEstimate || 0)

  if (rpc > 0 && balance > 0 && rpc < balance * 0.5 && intel?.allReturnsFiled) {
    return {
      path: "oic",
      reasoning: `RCP ($${rpc.toLocaleString()}) is well under half the liability ($${balance.toLocaleString()}) and the taxpayer is current on filings — OIC is the highest-leverage path.`,
    }
  }
  if (c.collectionActionType === "levy" || c.collectionActionType === "both") {
    return {
      path: "cdp",
      reasoning: `An active levy is in play — CDP / equivalent hearing is time-sensitive and pauses collection while the appeal is pending.`,
    }
  }
  if (balance < 50_000) {
    return {
      path: "ia",
      reasoning: `Liability is under $50K — a streamlined installment agreement is usually the cleanest exit, especially if cash flow can support a payment plan.`,
    }
  }
  if (c.collectionActionType === "lien") {
    return {
      path: "lien_relief",
      reasoning: `A federal tax lien is filed — withdrawal under § 6323(j)(1)(B) is available once an installment agreement is in place.`,
    }
  }
  return {
    path: "ia",
    reasoning: `Defaulting to installment agreement — the data isn't conclusive enough for a more aggressive path.`,
  }
}
