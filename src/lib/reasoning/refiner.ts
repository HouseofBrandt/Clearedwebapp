/**
 * Reasoning Layer — Refiner
 *
 * Builds the revision prompt when a draft fails evaluation
 * but is safe to auto-revise.
 */

import type { GenerationOutput, EvaluationResult } from "./types"

export function buildRevisionPrompt(
  original: GenerationOutput,
  evaluation: EvaluationResult
): string {
  return `You are revising a draft that did not pass quality review.

ORIGINAL REQUEST:
${original.originalRequest}

SOURCE MATERIAL:
${original.sourceContext}

DRAFT THAT FAILED REVIEW:
${original.draft}

EVALUATOR FEEDBACK:
Decision: ${evaluation.decision}
Score: ${evaluation.overall_score}/100
Issues: ${evaluation.issues.join("; ")}

SPECIFIC REVISION INSTRUCTIONS:
${evaluation.revision_instructions}

---

Produce a revised version that addresses every issue listed above. Rules:
1. Do NOT add information that is not in the source material.
2. Do NOT include formatting artifacts (HTML, markdown, raw codes).
3. Answer the SPECIFIC question asked, not a broader or related question.
4. Include only information that materially matters to a practitioner acting on this.
5. Write in clean professional prose unless the task type requires structured format.
6. If you cannot fix an issue without fabricating information, note it clearly rather than making something up.

Return ONLY the revised text. No preamble, no explanation, no meta-commentary.`
}
