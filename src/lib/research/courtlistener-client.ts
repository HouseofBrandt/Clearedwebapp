/**
 * Thin client for the CourtListener REST API (https://www.courtlistener.com).
 *
 * Free tier is public — no auth required for basic queries — with a soft
 * rate limit. Optional `COURTLISTENER_TOKEN` env var bumps the limit if
 * the firm wants to self-identify; the client attaches it when present.
 *
 * Scope: we only need two capabilities for verify_citation:
 *   1. Given a case citation ("136 T.C. 137"), find the opinion and
 *      return the canonical case name + year + court + a short
 *      disposition summary.
 *   2. Surface up to one best match. If CourtListener returns multiple
 *      hits, we pick the top one by relevance.
 *
 * This is INTENTIONALLY narrow. A full case-database client is out of
 * scope — the firm should subscribe to a paid provider (Westlaw, vLex)
 * for that.
 *
 * Failure modes (all handled — never throw to callers):
 *   - Network timeout → returns null
 *   - Non-2xx → returns null
 *   - Unparseable JSON → returns null
 *   - Zero results → returns null
 */

export interface CourtListenerOpinion {
  caseName: string
  year: number | null
  court: string
  absoluteUrl: string
  /** Short disposition / syllabus / first-paragraph excerpt. */
  summary: string
}

const BASE_URL = "https://www.courtlistener.com/api/rest/v3"
const REQUEST_TIMEOUT_MS = 8000

function getHeaders(): HeadersInit {
  const token = process.env.COURTLISTENER_TOKEN
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "Cleared-Research/1.0 (tax-resolution platform)",
  }
  if (token) h.Authorization = `Token ${token}`
  return h
}

/**
 * Search by citation string. Uses the `citation` endpoint which resolves a
 * reporter-format citation like "136 T.C. 137" to its canonical opinion.
 *
 * NOTE: CourtListener's citation lookup returns a cluster — an umbrella
 * for multiple opinions on the same case. We take the cluster's top
 * opinion (usually the majority).
 */
export async function searchByCitation(
  citation: string
): Promise<CourtListenerOpinion | null> {
  try {
    const url = `${BASE_URL}/search/?type=o&citation=${encodeURIComponent(citation)}`
    const res = await fetchWithTimeout(url)
    if (!res.ok) {
      if (res.status !== 404) {
        console.warn("[CourtListener] search failed", { status: res.status, citation })
      }
      return null
    }
    const data: any = await res.json()
    const hit = data?.results?.[0]
    if (!hit) return null
    return mapToOpinion(hit)
  } catch (err: any) {
    console.warn("[CourtListener] search error", { error: err?.message, citation })
    return null
  }
}

/**
 * Search by party name ("Renkemeyer v. Commissioner") with a year hint.
 * Used as a fallback when citation-based lookup fails.
 */
export async function searchByName(
  partyName: string,
  yearHint?: number
): Promise<CourtListenerOpinion | null> {
  try {
    const q = yearHint ? `${partyName} ${yearHint}` : partyName
    const url = `${BASE_URL}/search/?type=o&q=${encodeURIComponent(q)}`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data: any = await res.json()
    const hit = data?.results?.[0]
    if (!hit) return null
    return mapToOpinion(hit)
  } catch {
    return null
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: getHeaders(), signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function mapToOpinion(hit: any): CourtListenerOpinion {
  const caseName: string = hit.caseName || hit.caseNameShort || hit.caseNameFull || ""
  let year: number | null = null
  if (hit.dateFiled) {
    const y = Number(String(hit.dateFiled).slice(0, 4))
    year = Number.isFinite(y) ? y : null
  }
  const court: string = hit.court || hit.court_id || "Unknown"
  const absoluteUrl: string = hit.absolute_url
    ? `https://www.courtlistener.com${hit.absolute_url}`
    : ""
  const summarySource: string =
    (typeof hit.syllabus === "string" && hit.syllabus) ||
    (typeof hit.plain_text === "string" && hit.plain_text.slice(0, 400)) ||
    (typeof hit.html === "string" && hit.html.replace(/<[^>]+>/g, " ").slice(0, 400)) ||
    ""
  return {
    caseName: caseName.trim(),
    year,
    court,
    absoluteUrl,
    summary: summarySource.replace(/\s+/g, " ").trim(),
  }
}
