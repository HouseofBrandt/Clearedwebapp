/**
 * Issue Classifier — classifies a natural-language query into one or more
 * IssueCategory values using keyword matching.
 */

import type { IssueCategory } from '../types'

// ─── Keyword → category mapping ─────────────────────────────────────────────

const KEYWORD_MAP: Array<{ keywords: string[]; category: IssueCategory }> = [
  {
    keywords: [
      'oic', 'offer in compromise', 'offer-in-compromise', '7122',
      'doubt as to collectibility', 'doubt as to liability',
      'effective tax administration', 'eta', 'rcp',
      'reasonable collection potential', 'form 656',
    ],
    category: 'oic',
  },
  {
    keywords: [
      'penalty', 'penalties', '6651', '6662', '6663', '6672',
      'abatement', 'abate', 'reasonable cause', 'first time abate',
      'fta', 'failure to file', 'failure to pay', 'accuracy-related',
      'fraud penalty', 'negligence penalty', 'form 843',
    ],
    category: 'penalty_abatement',
  },
  {
    keywords: [
      'lien', 'levy', 'levies', '6331', '6321', '6323',
      'csed', '6502', 'collection statute', 'statute of limitations',
      'collection due process', 'cdp', 'seizure', 'garnishment',
      'wage garnishment', 'bank levy', 'release of lien',
      'withdrawal of lien', 'subordination', 'discharge',
      'collection alternatives', '668',
    ],
    category: 'collection',
  },
  {
    keywords: [
      'unfiled', 'non-filer', 'nonfiler', 'delinquent return',
      'substitute for return', 'sfr', 'filing compliance',
      'compliance', 'asfr', 'automated substitute',
    ],
    category: 'filing_compliance',
  },
  {
    keywords: [
      'procedure', 'procedural', 'due process', 'taxpayer rights',
      'taxpayer bill of rights', 'tbor', 'advocate', 'form 911',
      'taxpayer advocate', 'tas',
    ],
    category: 'procedure',
  },
  {
    keywords: [
      'appeals', 'appeal', 'protest', 'fast track',
      'post-appeals mediation', 'pam', 'form 12153',
      'cdp hearing', 'equivalent hearing', 'cab', 'collection appeals',
    ],
    category: 'appeals',
  },
  {
    keywords: [
      'innocent spouse', '6015', 'injured spouse',
      'equitable relief', 'form 8857', 'separation of liability',
      'traditional relief', 'streamlined innocent spouse',
    ],
    category: 'innocent_spouse',
  },
  {
    keywords: [
      'payroll', 'employment tax', '941', 'trust fund',
      'tfrp', 'responsible person', '6672', 'form 4180',
      'trust fund recovery', 'withholding', 'fica',
    ],
    category: 'payroll',
  },
  {
    keywords: [
      'litigation', 'tax court', 'petition', 'trial',
      'docket', 'stipulation', 'motion', 'deficiency',
      'notice of deficiency', '6213', 'prepetition',
    ],
    category: 'litigation',
  },
  {
    keywords: [
      'installment', 'installment agreement', 'ia', 'payment plan',
      'form 9465', 'form 433-d', 'streamlined installment',
      'partial pay installment', 'ppia', '6159',
      'currently not collectible', 'cnc',
    ],
    category: 'installment',
  },
]

/**
 * Classify a query string into one or more IssueCategory values.
 *
 * Uses keyword matching against the query (case-insensitive). If no
 * keywords match, returns ['mixed']. If multiple categories match,
 * returns all of them. For ambiguous queries that hit 4+ categories,
 * returns ['mixed'].
 */
export async function classifyIssue(query: string): Promise<IssueCategory[]> {
  const lowerQuery = query.toLowerCase()
  const matched = new Set<IssueCategory>()

  for (const entry of KEYWORD_MAP) {
    for (const keyword of entry.keywords) {
      if (lowerQuery.includes(keyword)) {
        matched.add(entry.category)
        break
      }
    }
  }

  if (matched.size === 0) {
    return ['mixed']
  }

  // If too many categories match, the query is ambiguous
  if (matched.size >= 4) {
    return ['mixed']
  }

  return Array.from(matched)
}
