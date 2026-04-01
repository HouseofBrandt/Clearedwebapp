/**
 * Research Center — provides a simple interface for running ad-hoc
 * tax authority research queries through the retrieval pipeline.
 */

import { classifyIssue } from '../retrieval/classifier'
import { hybridRetrieve } from '../retrieval/retriever'
import { rerankChunks } from '../retrieval/reranker'
import type { RankedChunk, IssueCategory } from '../types'

/**
 * Execute a research query against the tax authority knowledge base.
 *
 * @param question — natural language research question
 * @param options — optional constraints (jurisdiction, max results)
 * @returns classified issues and ranked authority results
 */
export async function researchQuery(
  question: string,
  options?: { jurisdiction?: string; maxResults?: number }
): Promise<{ issues: IssueCategory[]; results: RankedChunk[] }> {
  // Classify the question into issue categories
  const issues = await classifyIssue(question)

  // Retrieve candidate chunks
  const candidates = await hybridRetrieve({
    query: question,
    limit: options?.maxResults ?? 30,
  })

  // Rerank with authority weights and optional jurisdiction context
  const results = rerankChunks(candidates, {
    jurisdiction: options?.jurisdiction,
  })

  // If maxResults is specified, trim to that limit
  const trimmed = options?.maxResults
    ? results.slice(0, options.maxResults)
    : results

  return { issues, results: trimmed }
}
