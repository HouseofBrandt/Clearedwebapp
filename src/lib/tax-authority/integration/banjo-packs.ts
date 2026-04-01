/**
 * Banjo Packs — full pipeline integration for building evidence packs
 * from a task description and optional case context.
 *
 * Pipeline: classify -> policy -> retrieve -> rerank -> pack
 */

import { classifyIssue } from '../retrieval/classifier'
import { getSourcePolicy } from '../retrieval/source-policy'
import { hybridRetrieve } from '../retrieval/retriever'
import { rerankChunks } from '../retrieval/reranker'
import { buildEvidencePack } from '../retrieval/pack-builder'
import type { EvidencePack } from '../types'

/**
 * Build a complete evidence pack for a given task description.
 *
 * @param taskDescription — natural language description of the tax issue
 * @param caseContext — optional context about the case (jurisdiction, type)
 * @returns a fully assembled EvidencePack
 */
export async function buildBanjoPack(
  taskDescription: string,
  caseContext?: { jurisdiction?: string; caseType?: string }
): Promise<EvidencePack> {
  // Step 1: Classify the issue
  const issues = await classifyIssue(taskDescription)

  // Step 2: Get source policy (ordered tiers)
  const tiers = getSourcePolicy(issues)

  // Step 3: Retrieve candidate chunks
  const candidates = await hybridRetrieve({
    query: taskDescription,
    tiers,
    limit: 30,
    promotionLayers: ['CURATED', 'DISTILLED'],
  })

  // Step 4: Rerank with authority weights
  const ranked = rerankChunks(candidates, {
    jurisdiction: caseContext?.jurisdiction,
  })

  // Step 5: Assemble the evidence pack
  const pack = buildEvidencePack(ranked, issues)

  return pack
}
