/**
 * Thin client for the CourtListener REST API (https://www.courtlistener.com).
 *
 * IMPORTANT SEMANTICS — READ BEFORE TOUCHING.
 *
 * The caller distinguishes THREE outcomes from us:
 *
 *   { kind: "hit", opinion }   The citation resolved to a case. Trust it.
 *   { kind: "no_hit" }         The API responded but returned no results
 *                              for this citation. Safe to say "not found."
 *   { kind: "unreachable", reason }
 *                              We couldn't reach the API (auth failure,
 *                              rate limit, network, 5xx). DO NOT conclude
 *                              the citation is fabricated — we have no
 *                              information. Upstream marks these as
 *                              "unverifiable" so Claude flags them rather
 *                              than silently dropping real authority.
 *
 * This distinction matters because "not_found" drives the research
 * pipeline to DROP citations — when 403s collapsed into not_found, real
 * Supreme Court / Tax Court cases were being erased from memos.
 *
 * Auth: CourtListener's v4 API requires a token for many endpoints. The
 * v3 endpoints return 403 for unauthenticated clients in several cases.
 * Set COURTLISTENER_TOKEN (free — https://www.courtlistener.com/api/)
 * to avoid that failure mode entirely.
 */

export interface CourtListenerOpinion {
  caseName: string
  year: number | null
  court: string
  absoluteUrl: string
  /** Short disposition / syllabus / first-paragraph excerpt. */
  summary: string
}

export type CourtListenerResult =
  | { kind: "hit"; opinion: CourtListenerOpinion }
  | { kind: "no_hit" }
  | { kind: "unreachable"; reason: string; status?: number }

// v4 is the current stable API. v3 still responds but increasingly
// returns 403 for unauthenticated queries. We target v4 and note the
// v3 fallback so the failure mode is clearly documented.
const BASE_URL_V4 = "https://www.courtlistener.com/api/rest/v4"
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
 * Search by citation string. Uses the `search` endpoint with
 * `type=o` (opinions) + `citation=...`. Returns a discriminated result
 * so callers can distinguish "this isn't in the database" from "we
 * couldn't check."
 */
export async function searchByCitation(
  citation: string
): Promise<CourtListenerResult> {
  const url = `${BASE_URL_V4}/search/?type=o&citation=${encodeURIComponent(citation)}`
  return performSearch(url, citation)
}

/**
 * Search by party name ("Renkemeyer v. Commissioner") with an optional
 * year hint. Used as a fallback when citation-based lookup fails.
 */
export async function searchByName(
  partyName: string,
  yearHint?: number
): Promise<CourtListenerResult> {
  const q = yearHint ? `${partyName} ${yearHint}` : partyName
  const url = `${BASE_URL_V4}/search/?type=o&q=${encodeURIComponent(q)}`
  return performSearch(url, q)
}

async function performSearch(url: string, query: string): Promise<CourtListenerResult> {
  let res: Response
  try {
    res = await fetchWithTimeout(url)
  } catch (err: any) {
    console.warn("[CourtListener] network error", { error: err?.message, query })
    return { kind: "unreachable", reason: err?.message || "network_error" }
  }

  if (!res.ok) {
    // 404 = known "no match." Everything else (401, 403, 429, 5xx) is
    // ambiguous — the citation may be real; we just couldn't check.
    if (res.status === 404) {
      return { kind: "no_hit" }
    }
    const hasToken = !!process.env.COURTLISTENER_TOKEN
    console.warn("[CourtListener] search failed", {
      status: res.status,
      query,
      hasToken,
      note: res.status === 403 && !hasToken
        ? "Set COURTLISTENER_TOKEN env var to avoid 403 on CourtListener. Free token at https://www.courtlistener.com/api/"
        : undefined,
    })
    return {
      kind: "unreachable",
      reason: res.status === 403 || res.status === 401
        ? "auth_required"
        : res.status === 429
          ? "rate_limited"
          : `http_${res.status}`,
      status: res.status,
    }
  }

  let data: any
  try {
    data = await res.json()
  } catch (err: any) {
    return { kind: "unreachable", reason: "invalid_json" }
  }

  const hit = data?.results?.[0]
  if (!hit) return { kind: "no_hit" }
  return { kind: "hit", opinion: mapToOpinion(hit) }
}

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
