/**
 * Structured memo types — the data shape produced by the draft pass of
 * the two-pass memo pipeline (spec §7.2) and consumed by the deterministic
 * docx renderer (spec §5).
 *
 * Rule of thumb: everything visual is the renderer's concern; everything
 * substantive is the model's concern. These types are the contract.
 *
 * Citations live as STRUCTURED OBJECTS, not free-form strings inside the
 * prose. That's what makes the verify pass tractable — we iterate over a
 * list of Citation objects, call verify_citation on each, and either keep
 * or excise. If we let the model write citations inline as text, we'd be
 * back to regex extraction and fuzzy matching.
 */

import type { VerificationStatus } from "@/lib/research/citation-verifier"

/** A single authority reference. These become footnotes in the rendered docx. */
export interface MemoCitation {
  /** Stable ID the prose refers to via CitationRef. Generated during the draft pass. */
  id: string
  /**
   * The canonical form of the citation as it should appear in the
   * footnote. Follows the forms table in spec §4.2.
   *
   * Examples:
   *   "IRC § 704(b)"
   *   "Treas. Reg. § 1.704-1(b)(2)(ii)(d)"
   *   "Rev. Rul. 69-184, 1969-1 C.B. 256"
   *   "Renkemeyer, Campbell & Weaver, LLP v. Comm'r, 136 T.C. 137 (2011)"
   */
  fullCitation: string
  /**
   * Short name used when the same authority is referenced a second time.
   * Example: "Renkemeyer" or "Rev. Rul. 69-184". Optional — the renderer
   * will fall back to fullCitation when this is missing.
   */
  shortName?: string
  /** Short parenthetical explaining the holding or providing context. */
  parenthetical?: string
  /**
   * Introductory signal, if any. Spec §4.5. Omitted means "directly
   * supports." Lowercase — the renderer adds italics.
   */
  signal?: "see" | "see also" | "see, e.g." | "cf." | "but see" | "see generally"
  /**
   * Pinpoint citation (page, paragraph, section). Only set when verified.
   * Spec §4.4 — never fake pinpoints.
   */
  pinpoint?: string
  /**
   * Verification status — populated by the verify pass. When absent, the
   * citation has not been run through verify_citation yet.
   */
  verification?: {
    status: VerificationStatus
    sourceUrl?: string
    verifiedTitle?: string
    note?: string
  }
}

/** Inline reference to a citation by ID. Renderer resolves to footnote number. */
export interface CitationRef {
  citationId: string
  /** If true, the ref shows a pinpoint (e.g., "at 1018") after the number. */
  withPinpoint?: boolean
}

/**
 * A body paragraph can interleave text and citation references. We use a
 * discriminated-union run model so the renderer can insert docx
 * FootnoteReferenceRuns at the right offsets without trying to parse text
 * for citation markers.
 */
export type ParagraphRun =
  | { kind: "text"; text: string }
  | { kind: "citation"; ref: CitationRef }
  | { kind: "emphasis"; text: string }        // italic
  | { kind: "strong"; text: string }          // bold
  | { kind: "quote"; text: string }           // quoted term ("Individual")

export interface MemoParagraph {
  runs: ParagraphRun[]
  /**
   * If true, the renderer suppresses the first-line indent (used for the
   * first paragraph after a section heading per §5.2 convention, though
   * this is optional).
   */
  noFirstLineIndent?: boolean
}

/** Questions Presented / Short Answer numbered items. Spec §2 + §5.7. */
export interface NumberedItem {
  /** 1-indexed. */
  number: number
  runs: ParagraphRun[]
}

/** Discussion subsection with italic roman-numeral heading. Spec §5.5. */
export interface DiscussionSubsection {
  /** 1-indexed; renderer converts to lower-case roman numeral. */
  number: number
  title: string
  paragraphs: MemoParagraph[]
}

/** The full structured memo. Every field is what the renderer needs — no style. */
export interface MemoDraft {
  /** Header block per §5.3. Unknown fields get bracketed placeholders in the docx. */
  header: {
    to?: string
    from?: string
    cc?: string
    re: string
    /** Date in "Month D, YYYY" form. Renderer does not reformat. */
    date: string
    /** Optional letterhead line(s). Omitted if absent. */
    letterhead?: string
  }

  /** Facts section — prose paragraphs, no bullets per §3.4. */
  facts: MemoParagraph[]

  /** Questions Presented — numbered, "Whether [party] ..." form per §2. */
  questionsPresented: NumberedItem[]

  /** Short Answer — 1:1 with questions per §2. */
  shortAnswer: NumberedItem[]

  /**
   * Discussion — either a flat list of paragraphs or structured
   * subsections per §5.5. When `subsections` is present, `paragraphs` is
   * ignored.
   */
  discussion: {
    paragraphs?: MemoParagraph[]
    subsections?: DiscussionSubsection[]
  }

  /** Conclusion — 2-4 short paragraphs, no new authority per §2. */
  conclusion: MemoParagraph[]

  /** Full citation list — referenced by id from prose. */
  citations: MemoCitation[]

  /**
   * "body of law" phrase for the closing disclaimer (§5.6). Example:
   * "federal tax law", "Delaware corporate law". Renderer substitutes
   * into the template disclaimer text.
   */
  bodyOfLaw: string
}
