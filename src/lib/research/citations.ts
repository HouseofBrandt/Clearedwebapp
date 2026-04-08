/**
 * Research Output — Citation Detection & HTML Post-Processing
 *
 * Post-processes sanitized HTML to:
 * 1. Style legal citations (case names, IRC/IRM/Treas. Reg. refs)
 * 2. Elevate the Practitioner Notes section into a callout card
 * 3. Inject heading IDs for TOC scroll tracking
 */

export interface TOCItem {
  id: string
  text: string
}

// ── Safe replacement (skip <code>, <pre>, <a href> content) ──────

function safeReplace(html: string, pattern: RegExp, replacer: (match: string, ...args: any[]) => string): string {
  // Split on code/pre blocks, only apply regex to non-code segments
  const parts = html.split(/(<(?:code|pre)[^>]*>[\s\S]*?<\/(?:code|pre)>)/gi)
  return parts.map((part, i) => {
    // Odd indices are code/pre blocks — leave them alone
    if (i % 2 === 1) return part
    return part.replace(pattern, replacer)
  }).join("")
}

// ── Citation patterns ────────────────────────────────────────────

// Case citations: "Name v. Name, Volume Reporter Page (Year)"
const CASE_CITATION = /([A-Z][A-Za-z\s.']+(?:v\.|vs\.)\s+[A-Z][A-Za-z\s.']+(?:,?\s+(?:P\.A\.|Inc\.|LLC|Ltd\.))?),?\s+(\d+\s+[A-Z][A-Za-z.\s]+\d+)(?:\s*\(([^)]+)\))?/g

// IRM references: "IRM XX.XX.XX..."
const IRM_CITATION = /IRM\s+(\d+(?:\.\d+){1,5})/g

// IRC references: "IRC § XXXX" or "§ XXXX(a)(1)" or "Section XXXX"
const IRC_CITATION = /(?:IRC\s+)?§\s*(\d+[a-z]?(?:\([a-z0-9]+\))*)/g

// Treasury Regulation: "Treas. Reg. § XXX.XXXX-X(x)"
const TREAS_REG = /Treas\.\s*Reg\.\s*§\s*([\d.]+(?:-\d+)?(?:\([a-z]\)(?:\(\d+\))?)?)/g

// Revenue Procedure / Revenue Ruling: "Rev. Proc. YYYY-NN" or "Rev. Rul. YYYY-NN"
const REV_PROC_RUL = /Rev\.\s*(?:Proc|Rul)\.\s*\d{2,4}-\d+/g

// Tax Court case reporters: "T.C. Memo. YYYY-NN" or "NNN T.C. NNN"
const TC_REPORTER = /(?:\d+\s+T\.C\.\s+\d+|T\.C\.\s*Memo\.\s*\d{4}-\d+|T\.C\.\s*No\.\s*\d+)/g

// Federal reporters: "NNN F.3d NNN" or "NNN U.S. NNN" or "NNN F. Supp. 3d NNN"
const FED_REPORTER = /\d+\s+(?:F\.\d[dh]|U\.S\.|F\.\s*Supp\.\s*\d[dh]|F\.\s*App'x)\s+\d+/g

// ── Highlight citations ──────────────────────────────────────────

export function highlightCitations(html: string): string {
  let result = html

  // Case citations (most specific — do first)
  result = safeReplace(result, CASE_CITATION, (match, name, reporter, year) => {
    const full = year ? `${name}, ${reporter} (${year})` : `${name}, ${reporter}`
    return `<span class="citation-case">${full}</span>`
  })

  // IRM
  result = safeReplace(result, IRM_CITATION, (match) =>
    `<span class="citation-ref">${match}</span>`
  )

  // IRC sections
  result = safeReplace(result, IRC_CITATION, (match) =>
    `<span class="citation-ref">${match}</span>`
  )

  // Treasury Regulations
  result = safeReplace(result, TREAS_REG, (match) =>
    `<span class="citation-ref">${match}</span>`
  )

  // Rev. Proc. / Rev. Rul.
  result = safeReplace(result, REV_PROC_RUL, (match) =>
    `<span class="citation-ref">${match}</span>`
  )

  // T.C. reporters
  result = safeReplace(result, TC_REPORTER, (match) =>
    `<span class="citation-ref">${match}</span>`
  )

  // Federal reporters
  result = safeReplace(result, FED_REPORTER, (match) =>
    `<span class="citation-ref">${match}</span>`
  )

  return result
}

// ── Elevate Practitioner Notes ───────────────────────────────────

export function elevatePractitionerNotes(html: string): string {
  // Find the h2 containing "Practitioner Notes" or "Strategic" and wrap
  // everything from that heading to the next h2 (or end) in a callout div
  const pattern = /(<h2[^>]*>[\s\S]*?(?:Practitioner|Strategic|PRACTITIONER|STRATEGIC)[\s\S]*?<\/h2>)([\s\S]*?)(?=<h2|$)/i
  return html.replace(pattern, '<div class="research-practitioner-callout">$1$2</div>')
}

// ── Inject heading IDs for TOC ───────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")     // strip HTML tags
    .replace(/[^\w\s-]/g, "")    // remove non-word chars
    .replace(/\s+/g, "-")        // spaces to hyphens
    .replace(/-+/g, "-")         // collapse hyphens
    .trim()
}

export function injectHeadingIds(html: string): { html: string; headings: TOCItem[] } {
  const headings: TOCItem[] = []
  const seen = new Set<string>()

  const processed = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, content) => {
    // Skip if already has an id
    if (attrs.includes("id=")) return match

    const text = content.replace(/<[^>]+>/g, "").trim()
    let id = slugify(text)

    // Deduplicate
    if (seen.has(id)) {
      let n = 2
      while (seen.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    seen.add(id)

    headings.push({ id, text })
    return `<h2${attrs} id="${id}">${content}</h2>`
  })

  return { html: processed, headings }
}
