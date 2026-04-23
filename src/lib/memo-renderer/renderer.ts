/**
 * Deterministic docx renderer for formal research memoranda.
 * Implements spec §5 end-to-end. No Claude involvement here — the model
 * produces a MemoDraft; this file produces the .docx Buffer.
 *
 * Style knobs in ONE place. Changing a margin, a size, or a spacing
 * constant below will affect every memo uniformly.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Footer,
  PageNumber,
  FootnoteReferenceRun,
  TabStopType,
  convertInchesToTwip,
} from "docx"
import type {
  MemoDraft,
  MemoCitation,
  MemoParagraph,
  ParagraphRun,
  NumberedItem,
  DiscussionSubsection,
} from "./types"

// ── Style constants (spec §5.1–§5.2) ────────────────────────────────

const FONT = "Times New Roman"

/** docx uses half-points for `size`. 12pt = 24 half-points. */
const BODY_HALF_POINTS = 24
const FOOTNOTE_HALF_POINTS = 20 // 10pt

/** docx uses 1/20 of a point for `line` (twentieths). */
const DOUBLE_SPACING_TWIPS = 480

/** 0.5" in twentieths. */
const HALF_INCH = convertInchesToTwip(0.5)
/** 0.25" in twentieths. */
const QUARTER_INCH = convertInchesToTwip(0.25)
/** 1" in twentieths. */
const ONE_INCH = convertInchesToTwip(1)

/** 12pt before/after in twentieths (= 240). */
const HEADING_SPACING = 240

// ── Romanization ────────────────────────────────────────────────────

/** 1→i, 2→ii, etc. Caps at iv since real memos don't go deeper. */
function toRomanLower(n: number): string {
  const table = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]
  if (n >= 0 && n < table.length) return table[n] ?? String(n)
  // Fallback — naive, good enough past x (shouldn't happen in practice).
  return String(n)
}

// ── Text run builders ───────────────────────────────────────────────

type TextRunOverrides = {
  bold?: boolean
  italics?: boolean
  underline?: Record<string, never> | { type?: string; color?: string }
  color?: string
}
function bodyTextRun(text: string, overrides: TextRunOverrides = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: BODY_HALF_POINTS,
    ...overrides,
  })
}

/**
 * Convert a MemoParagraph's runs into docx children. CitationRef runs
 * become FootnoteReferenceRuns keyed to footnote IDs (1-indexed). The
 * caller passes the id map so we resolve MemoCitation.id → footnote id.
 */
function runsToDocx(
  runs: ParagraphRun[],
  footnoteIdByCitationId: Map<string, number>
): (TextRun | FootnoteReferenceRun)[] {
  const out: (TextRun | FootnoteReferenceRun)[] = []
  for (const r of runs) {
    switch (r.kind) {
      case "text":
        out.push(bodyTextRun(r.text))
        break
      case "emphasis":
        out.push(bodyTextRun(r.text, { italics: true }))
        break
      case "strong":
        out.push(bodyTextRun(r.text, { bold: true }))
        break
      case "quote":
        // Curly quotes around the defined term, italic on first use per §3.2.
        out.push(bodyTextRun(`\u201C${r.text}\u201D`, { italics: true }))
        break
      case "citation": {
        const fnId = footnoteIdByCitationId.get(r.ref.citationId)
        if (fnId !== undefined) {
          out.push(new FootnoteReferenceRun(fnId))
        } else {
          // Unknown citation — surface as an inline bracket so the reviewer
          // sees the bug instead of a silently missing footnote.
          out.push(bodyTextRun(`[UNKNOWN CITATION: ${r.ref.citationId}]`))
        }
        break
      }
    }
  }
  return out
}

// ── Paragraph builders ──────────────────────────────────────────────

function bodyParagraph(
  p: MemoParagraph,
  footnoteIdByCitationId: Map<string, number>
): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: DOUBLE_SPACING_TWIPS },
    indent: p.noFirstLineIndent ? undefined : { firstLine: HALF_INCH },
    children: runsToDocx(p.runs, footnoteIdByCitationId),
  })
}

function sectionHeading(title: string): Paragraph {
  // §5.4: centered, bold, underlined, 12pt, colon, 12pt before/after.
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: HEADING_SPACING, after: HEADING_SPACING, line: DOUBLE_SPACING_TWIPS },
    children: [
      new TextRun({
        text: `${title}:`,
        font: FONT,
        size: BODY_HALF_POINTS,
        bold: true,
        underline: {},
      }),
    ],
  })
}

function subsectionHeading(sub: DiscussionSubsection): Paragraph {
  // §5.5: italic, 0.5" indent, "i)\t[Title]"
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: HEADING_SPACING, after: HEADING_SPACING / 2, line: DOUBLE_SPACING_TWIPS },
    indent: { left: HALF_INCH },
    children: [
      new TextRun({
        text: `${toRomanLower(sub.number)})\t${sub.title}`,
        font: FONT,
        size: BODY_HALF_POINTS,
        italics: true,
      }),
    ],
  })
}

function numberedItemParagraph(
  item: NumberedItem,
  footnoteIdByCitationId: Map<string, number>
): Paragraph {
  // §5.7: hanging indent, "1." at left margin, content at 0.5".
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: DOUBLE_SPACING_TWIPS, after: 120 },
    indent: { left: HALF_INCH, hanging: HALF_INCH },
    tabStops: [{ type: TabStopType.LEFT, position: HALF_INCH }],
    children: [
      bodyTextRun(`${item.number}.\t`),
      ...runsToDocx(item.runs, footnoteIdByCitationId),
    ],
  })
}

// ── Header block (§5.3) ─────────────────────────────────────────────

function letterheadParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [bodyTextRun(text)],
  })
}

function memorandumTitle(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 240, line: DOUBLE_SPACING_TWIPS },
    children: [
      new TextRun({
        text: "Memorandum",
        font: FONT,
        size: BODY_HALF_POINTS,
        bold: true,
      }),
    ],
  })
}

function headerLabelRow(label: string, value: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: DOUBLE_SPACING_TWIPS, after: 0 },
    tabStops: [{ type: TabStopType.LEFT, position: HALF_INCH }],
    children: [
      new TextRun({
        text: `${label}:`,
        font: FONT,
        size: BODY_HALF_POINTS,
        bold: true,
      }),
      bodyTextRun(`\t${value}`),
    ],
  })
}

function horizontalRuleParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 240 },
    border: {
      bottom: {
        color: "000000",
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    children: [bodyTextRun(" ")], // Word needs content to render the border.
  })
}

function buildHeaderBlock(draft: MemoDraft): Paragraph[] {
  const out: Paragraph[] = []
  if (draft.header.letterhead) {
    for (const line of draft.header.letterhead.split("\n")) {
      out.push(letterheadParagraph(line))
    }
  }
  out.push(memorandumTitle())
  // Placeholders when fields are missing per §8.3.
  out.push(headerLabelRow("To", draft.header.to || "[Client / File]"))
  out.push(headerLabelRow("From", draft.header.from || "[Attorney]"))
  if (draft.header.cc) {
    out.push(headerLabelRow("Cc", draft.header.cc))
  }
  out.push(headerLabelRow("Re", draft.header.re))
  out.push(headerLabelRow("Date", draft.header.date))
  out.push(horizontalRuleParagraph())
  return out
}

// ── Citation formatting (§4) ────────────────────────────────────────

function italicSignal(signal: string): TextRun {
  // Signals are italicized per §4.2/§4.5.
  return new TextRun({
    text: `${signal} `,
    font: FONT,
    size: FOOTNOTE_HALF_POINTS,
    italics: true,
  })
}

function footnoteRuns(c: MemoCitation): TextRun[] {
  const runs: TextRun[] = []
  if (c.signal) {
    // Title-case the first letter ("see" → "See") per Bluebook convention.
    const pretty = c.signal.charAt(0).toUpperCase() + c.signal.slice(1)
    runs.push(italicSignal(pretty))
  }
  // Case names are italicized. We italicize the whole fullCitation when it
  // looks like a case name (contains " v. "). For reg/IRC/ruling citations
  // we render plain — spec §4.2 treats those as non-italic.
  const looksLikeCase = / v\.\s/.test(c.fullCitation)
  runs.push(
    new TextRun({
      text: c.fullCitation,
      font: FONT,
      size: FOOTNOTE_HALF_POINTS,
      italics: looksLikeCase,
    })
  )
  if (c.pinpoint) {
    runs.push(
      new TextRun({
        text: `, at ${c.pinpoint}`,
        font: FONT,
        size: FOOTNOTE_HALF_POINTS,
      })
    )
  }
  if (c.parenthetical) {
    runs.push(
      new TextRun({
        text: ` (${c.parenthetical})`,
        font: FONT,
        size: FOOTNOTE_HALF_POINTS,
      })
    )
  }
  runs.push(
    new TextRun({
      text: ".",
      font: FONT,
      size: FOOTNOTE_HALF_POINTS,
    })
  )
  return runs
}

/**
 * Footnote definition shape expected by the `docx` library. The package
 * accepts `{ [id]: { children: Paragraph[] } }` on Document — see the
 * existing src/lib/documents/docx.ts for prior art.
 */
type FootnoteDef = { children: Paragraph[] }

function footnoteFromCitation(c: MemoCitation): FootnoteDef {
  return {
    children: [
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 240 }, // single-spaced per §5.2
        indent: { firstLine: QUARTER_INCH }, // 0.25" per §5.2
        children: footnoteRuns(c),
      }),
    ],
  }
}

// ── Closing disclaimer (§5.6) ───────────────────────────────────────

function closingDisclaimer(bodyOfLaw: string): Paragraph {
  const text =
    `This memorandum reflects ${bodyOfLaw} as of the date indicated. ` +
    `It addresses the specific questions presented and is not intended as ` +
    `comprehensive treatment. State tax treatment is not addressed unless ` +
    `separately noted. This memorandum does not constitute advice on any ` +
    `particular matter and is not a substitute for engagement-specific counsel.`
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 360, line: DOUBLE_SPACING_TWIPS },
    indent: { firstLine: HALF_INCH },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: BODY_HALF_POINTS,
        italics: true,
      }),
    ],
  })
}

// ── Entry point ─────────────────────────────────────────────────────

/**
 * Render a verified MemoDraft into a docx Buffer. Pure function: same
 * input → same bytes (modulo docx's own ID generation).
 *
 * Throws on invalid input (missing required fields). Never throws on
 * verification status — the caller is responsible for deciding whether
 * to ship a memo with unverified citations. This function just renders.
 */
export async function renderMemo(draft: MemoDraft): Promise<Buffer> {
  // Footnote IDs: docx requires 1-indexed, ordered by order of reference.
  // We build the id map in citation-array order; this assumes the draft
  // lists citations roughly in the order they're first referenced, which
  // the generator enforces. When a citation is referenced before its
  // predecessor in the array, Word will renumber automatically based on
  // actual reference order — the underlying ID stays stable.
  const footnoteIdByCitationId = new Map<string, number>()
  const footnotes: Record<number, FootnoteDef> = {}
  draft.citations.forEach((c, idx) => {
    const id = idx + 1
    footnoteIdByCitationId.set(c.id, id)
    footnotes[id] = footnoteFromCitation(c)
  })

  const children: Paragraph[] = []

  // Header block (§5.3)
  children.push(...buildHeaderBlock(draft))

  // Facts (§2.1)
  children.push(sectionHeading("Facts"))
  for (const p of draft.facts) {
    children.push(bodyParagraph(p, footnoteIdByCitationId))
  }

  // Questions Presented (§2.2)
  children.push(sectionHeading("Questions Presented"))
  for (const q of draft.questionsPresented) {
    children.push(numberedItemParagraph(q, footnoteIdByCitationId))
  }

  // Short Answer (§2.3)
  children.push(sectionHeading("Short Answer"))
  for (const a of draft.shortAnswer) {
    children.push(numberedItemParagraph(a, footnoteIdByCitationId))
  }

  // Discussion (§2.4)
  children.push(sectionHeading("Discussion"))
  if (draft.discussion.subsections && draft.discussion.subsections.length > 0) {
    for (const sub of draft.discussion.subsections) {
      children.push(subsectionHeading(sub))
      for (const p of sub.paragraphs) {
        children.push(bodyParagraph(p, footnoteIdByCitationId))
      }
    }
  } else if (draft.discussion.paragraphs) {
    for (const p of draft.discussion.paragraphs) {
      children.push(bodyParagraph(p, footnoteIdByCitationId))
    }
  }

  // Conclusion (§2.5)
  children.push(sectionHeading("Conclusion"))
  for (const p of draft.conclusion) {
    children.push(bodyParagraph(p, footnoteIdByCitationId))
  }

  // Closing disclaimer (§5.6)
  children.push(closingDisclaimer(draft.bodyOfLaw))

  const doc = new Document({
    creator: "Cleared",
    title: draft.header.re,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_HALF_POINTS },
        },
      },
    },
    footnotes,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: ONE_INCH,
              right: ONE_INCH,
              bottom: ONE_INCH,
              left: ONE_INCH,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    font: FONT,
                    size: BODY_HALF_POINTS,
                    children: [PageNumber.CURRENT],
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
