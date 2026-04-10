import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  TableLayoutType,
  LevelFormat,
  PageBreak,
  FootnoteReferenceRun,
  convertInchesToTwip,
} from "docx"
import { marked, type Token, type Tokens } from "marked"
import { formatDate } from "@/lib/date-utils"

// Any run type that can be a child of a Paragraph (text or a footnote ref).
type ParagraphRun = TextRun | FootnoteReferenceRun

// ── Brand constants ─────────────────────────────────────────
const FONT = "Times New Roman"
const NAVY = "1B2A4A"
const BLUE_ACCENT = "2E75B6"
const DARK_GRAY = "333333"
const BODY_COLOR = "333333"
const HEADER_GRAY = "888888"
const LIGHT_BLUE_BG = "E8F0F8"
const YELLOW_HIGHLIGHT = "FFFF00"
const ORANGE_HIGHLIGHT = "FFE0B2"
const RED_HIGHLIGHT = "FFE0E0"
const TABLE_HEADER_BG = "1B2A4A"
const TABLE_ALT_BG = "F5F5F5"
const TABLE_BORDER = "B0C4D8"

// ── Size constants (half-points) ────────────────────────────
const H1_SIZE = 32  // 16pt
const H2_SIZE = 26  // 13pt
const H3_SIZE = 22  // 11pt
const BODY_SIZE = 22  // 11pt (also 12pt max — body follows Bluebook "readable")
const TABLE_SIZE = 20  // 10pt
const FOOTNOTE_SIZE = 20  // 10pt — matches Bluebook footnote convention
const SMALL_SIZE = 16  // 8pt
const COVER_TITLE_SIZE = 56  // 28pt
const COVER_SUBTITLE_SIZE = 28  // 14pt

// ── Types ───────────────────────────────────────────────────
type DocChild = Paragraph | Table

// ── Shared table cell padding ───────────────────────────────
const CELL_MARGINS = {
  top: 80,
  bottom: 80,
  left: 120,
  right: 120,
}

// ── Footnote extraction (Bluebook legal citations) ─────────

/**
 * Result of pulling footnote definitions out of a markdown document.
 *
 * `body` is the markdown with:
 *   - Footnote definitions (`[^label]: content` lines) removed
 *   - Inline references (`[^label]`) rewritten to numeric IDs (`[^1]`, `[^2]`, ...)
 *
 * `footnotes` maps the numeric ID to the plain-text footnote content. The IDs
 * are assigned in order of *first reference* in the body — matching Bluebook
 * and Word's expected footnote ordering.
 */
export interface FootnoteExtraction {
  body: string
  footnotes: Map<number, string>
}

/**
 * Extract markdown-style footnotes from research deliverables.
 *
 * Input format (standard markdown footnote extension):
 *
 *   The taxpayer qualifies for first-time abate.[^fta]
 *
 *   [^fta]: Rev. Proc. 2003-71, 2003-2 C.B. 517.
 *
 * Labels can be alphanumeric (`[^fta]`, `[^1]`, `[^smith2004]`) or numeric.
 * The label only controls matching; output is always sequentially numbered
 * starting at 1 so Word footnotes stay clean.
 */
export function extractFootnotes(markdown: string): FootnoteExtraction {
  // 1. Grab every definition line: `[^label]: content` possibly continuing on
  //    indented lines. We keep it simple: single-line definitions only, which
  //    is what the AI prompt instructs. Multi-line footnotes are rare in tax
  //    citations (they're legal authorities, not explanatory notes).
  const defRegex = /^\[\^([^\]]+)\]:\s*(.+)$/gm
  const rawDefs = new Map<string, string>()
  let match: RegExpExecArray | null
  while ((match = defRegex.exec(markdown)) !== null) {
    const label = match[1].trim()
    const content = match[2].trim()
    if (!rawDefs.has(label)) {
      rawDefs.set(label, content)
    }
  }

  // If no footnotes, short-circuit.
  if (rawDefs.size === 0) {
    return { body: markdown, footnotes: new Map() }
  }

  // 2. Strip definition lines from the body.
  let body = markdown.replace(defRegex, "").replace(/\n{3,}/g, "\n\n")

  // 3. Assign sequential numeric IDs in order of first inline reference.
  const refRegex = /\[\^([^\]]+)\]/g
  const labelToId = new Map<string, number>()
  let nextId = 1

  // First pass: scan body in order and assign IDs.
  const seen = new Set<string>()
  let scanMatch: RegExpExecArray | null
  refRegex.lastIndex = 0
  while ((scanMatch = refRegex.exec(body)) !== null) {
    const label = scanMatch[1].trim()
    if (!rawDefs.has(label)) continue // orphan ref — leave as-is
    if (!seen.has(label)) {
      seen.add(label)
      labelToId.set(label, nextId++)
    }
  }

  // 4. Rewrite inline references to use numeric IDs.
  body = body.replace(refRegex, (full, rawLabel) => {
    const label = String(rawLabel).trim()
    const id = labelToId.get(label)
    return id != null ? `[^${id}]` : full
  })

  // 5. Build final footnotes map keyed by numeric ID.
  const footnotes = new Map<number, string>()
  for (const [label, id] of labelToId.entries()) {
    const content = rawDefs.get(label)
    if (content) footnotes.set(id, content)
  }

  return { body: body.trim(), footnotes }
}

// ── Inline text parsing ─────────────────────────────────────

interface InlineSegment {
  text: string
  bold?: boolean
  italics?: boolean
  code?: boolean
  highlight?: "yellow" | "orange" | "red"
  color?: string
  footnoteId?: number // if set, this segment is a footnote reference marker
}

function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  // Order matters: put the more specific patterns first. `[^N]` (footnote ref)
  // is handled before the generic bracketed markup.
  const pattern = /\[\^(\d+)\]|\[PRACTITIONER JUDGMENT\]|\[VERIFY\]|\[MISSING\]|\[[ x]\]|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }

    const full = match[0]
    // match[1] is the footnote numeric ID (if matched)
    if (match[1] !== undefined) {
      const id = parseInt(match[1], 10)
      if (!Number.isNaN(id) && id > 0) {
        segments.push({ text: "", footnoteId: id })
      }
    } else if (full === "[VERIFY]") {
      segments.push({ text: "[VERIFY]", bold: true, highlight: "yellow", color: "CC0000" })
    } else if (full === "[PRACTITIONER JUDGMENT]") {
      segments.push({ text: "[PRACTITIONER JUDGMENT]", bold: true, highlight: "orange", color: "E65100" })
    } else if (full === "[MISSING]") {
      segments.push({ text: "[MISSING]", bold: true, highlight: "red", color: "CC0000" })
    } else if (full === "[ ]") {
      segments.push({ text: "\u2610 " })  // ☐
    } else if (full === "[x]") {
      segments.push({ text: "\u2611 " })  // ☑
    } else if (match[2] !== undefined) {
      segments.push({ text: match[2], bold: true })
    } else if (match[3] !== undefined) {
      segments.push({ text: match[3], italics: true })
    } else if (match[4] !== undefined) {
      segments.push({ text: match[4], code: true })
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ text }]
}

function segmentsToRuns(segments: InlineSegment[], size?: number): ParagraphRun[] {
  const sz = size ?? BODY_SIZE
  return segments.map((seg): ParagraphRun => {
    if (seg.footnoteId != null) {
      return new FootnoteReferenceRun(seg.footnoteId)
    }
    const shading = seg.highlight
      ? {
          type: ShadingType.CLEAR,
          fill: seg.highlight === "yellow" ? YELLOW_HIGHLIGHT
            : seg.highlight === "orange" ? ORANGE_HIGHLIGHT
            : RED_HIGHLIGHT,
        }
      : undefined

    return new TextRun({
      text: seg.text,
      font: FONT,
      size: sz,
      bold: seg.bold,
      italics: seg.italics,
      color: seg.color ?? (seg.code ? "6A1B9A" : undefined),
      shading,
    })
  })
}

function inlineRuns(text: string, size?: number): ParagraphRun[] {
  return segmentsToRuns(parseInlineSegments(text), size)
}

// ── Markdown AST → docx elements ────────────────────────────

function renderTokens(tokens: Token[]): DocChild[] {
  const children: DocChild[] = []

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        children.push(renderHeading(token as Tokens.Heading))
        break
      case "paragraph":
        children.push(renderParagraph(token as Tokens.Paragraph))
        break
      case "list":
        children.push(...renderList(token as Tokens.List))
        break
      case "table":
        children.push(renderTable(token as Tokens.Table))
        break
      case "blockquote":
        children.push(...renderBlockquote(token as Tokens.Blockquote))
        break
      case "hr":
        children.push(renderHorizontalRule())
        break
      case "code":
        children.push(renderCodeBlock(token as Tokens.Code))
        break
      case "space":
        break
      default:
        if ("text" in token && typeof (token as any).text === "string") {
          children.push(
            new Paragraph({
              children: inlineRuns((token as any).text),
              spacing: { after: 120, line: 276 },
            })
          )
        }
        break
    }
  }

  return children
}

function renderHeading(token: Tokens.Heading): Paragraph {
  const text = token.text
  const depth = token.depth

  if (depth === 1) {
    return new Paragraph({
      children: [
        new TextRun({ text, font: FONT, size: H1_SIZE, bold: true, color: NAVY }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: BLUE_ACCENT },
      },
    })
  }
  if (depth === 2) {
    return new Paragraph({
      children: [
        new TextRun({ text, font: FONT, size: H2_SIZE, bold: true, color: BLUE_ACCENT }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 160 },
    })
  }
  return new Paragraph({
    children: [
      new TextRun({ text, font: FONT, size: H3_SIZE, bold: true, color: DARK_GRAY }),
    ],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
  })
}

function renderParagraph(token: Tokens.Paragraph): Paragraph {
  return new Paragraph({
    children: inlineRuns(token.text),
    spacing: { after: 120, line: 276 },
  })
}

function renderList(token: Tokens.List, level = 0): Paragraph[] {
  const items: Paragraph[] = []
  for (const item of token.items) {
    const text = item.text.split("\n")[0]
    if (token.ordered) {
      items.push(
        new Paragraph({
          children: inlineRuns(text),
          numbering: { reference: "cleared-numbering", level },
          spacing: { after: 60, line: 276 },
        })
      )
    } else {
      items.push(
        new Paragraph({
          children: inlineRuns(text),
          bullet: { level },
          spacing: { after: 60, line: 276 },
        })
      )
    }

    if (item.tokens) {
      for (const subToken of item.tokens) {
        if (subToken.type === "list") {
          items.push(...renderList(subToken as Tokens.List, level + 1))
        }
      }
    }
  }
  return items
}

function renderTable(token: Tokens.Table): Table {
  const colCount = token.header.length
  const colWidthPct = Math.floor(100 / colCount)

  const headerRow = new TableRow({
    tableHeader: true,
    children: token.header.map(
      (cell) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cell.text,
                  font: FONT,
                  size: TABLE_SIZE,
                  bold: true,
                  color: "FFFFFF",
                }),
              ],
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
          width: { size: colWidthPct, type: WidthType.PERCENTAGE },
          margins: CELL_MARGINS,
        })
    ),
  })

  const dataRows = token.rows.map(
    (row, rowIdx) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineRuns(cell.text, TABLE_SIZE),
                }),
              ],
              shading:
                rowIdx % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG }
                  : undefined,
              width: { size: colWidthPct, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
            })
        ),
      })
  )

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      left: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      right: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
    },
  })
}

function renderBlockquote(token: Tokens.Blockquote): DocChild[] {
  const textParts: string[] = []
  for (const subToken of token.tokens) {
    if (subToken.type === "paragraph") {
      textParts.push((subToken as Tokens.Paragraph).text)
    }
  }
  const text = textParts.join("\n")

  // Use a single-cell table to get proper callout box with background + left border
  return [
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineRuns(text),
                  spacing: { before: 60, after: 60 },
                }),
              ],
              shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE_BG },
              margins: { top: 120, bottom: 120, left: 200, right: 200 },
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0 },
        bottom: { style: BorderStyle.NONE, size: 0 },
        right: { style: BorderStyle.NONE, size: 0 },
        left: { style: BorderStyle.SINGLE, size: 6, color: BLUE_ACCENT },
        insideHorizontal: { style: BorderStyle.NONE, size: 0 },
        insideVertical: { style: BorderStyle.NONE, size: 0 },
      },
    }),
  ]
}

function renderHorizontalRule(): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BLUE_ACCENT },
    },
  })
}

function renderCodeBlock(token: Tokens.Code): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: token.text,
        font: FONT,
        size: BODY_SIZE - 2,
        color: DARK_GRAY,
      }),
    ],
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
    indent: { left: convertInchesToTwip(0.3), right: convertInchesToTwip(0.3) },
  })
}

// ── Cover block ─────────────────────────────────────────────

function buildCoverBlock(
  tabsNumber: string,
  clientName: string,
  taskType: string
): DocChild[] {
  const taskLabel = taskType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return [
    new Paragraph({ spacing: { before: 1200 } }),

    // CLEARED
    new Paragraph({
      children: [
        new TextRun({
          text: "CLEARED",
          font: FONT,
          size: COVER_TITLE_SIZE,
          bold: true,
          color: NAVY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),

    // Subtitle
    new Paragraph({
      children: [
        new TextRun({
          text: "AI-Powered Tax Resolution",
          font: FONT,
          size: COVER_SUBTITLE_SIZE,
          color: BLUE_ACCENT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // Blue accent line
    new Paragraph({
      spacing: { after: 300 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 3, color: BLUE_ACCENT },
      },
    }),

    // Document type
    new Paragraph({
      children: [
        new TextRun({
          text: taskLabel,
          font: FONT,
          size: 28,
          color: NAVY,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // Case number
    new Paragraph({
      children: [
        new TextRun({ text: "Case: ", font: FONT, size: 24, color: DARK_GRAY }),
        new TextRun({ text: tabsNumber, font: FONT, size: 24, bold: true, color: NAVY }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),

    // Client name
    new Paragraph({
      children: [
        new TextRun({ text: "Client: ", font: FONT, size: 24, color: DARK_GRAY }),
        new TextRun({ text: clientName, font: FONT, size: 24, bold: true, color: NAVY }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),

    // Date
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${formatDate(new Date(), { year: "numeric", month: "long", day: "numeric" })}`,
          font: FONT,
          size: 24,
          color: DARK_GRAY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),

    // DRAFT stamp
    new Paragraph({
      children: [
        new TextRun({
          text: "DRAFT \u2014 Requires Practitioner Review and Approval",
          font: FONT,
          size: 24,
          bold: true,
          color: "CC0000",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      shading: { type: ShadingType.CLEAR, fill: "FFF0F0" },
      border: {
        top: { style: BorderStyle.SINGLE, size: 2, color: "CC0000" },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "CC0000" },
        left: { style: BorderStyle.SINGLE, size: 2, color: "CC0000" },
        right: { style: BorderStyle.SINGLE, size: 2, color: "CC0000" },
      },
    }),

    // Page break after cover
    new Paragraph({
      children: [new PageBreak()],
    }),
  ]
}

// ── Header / Footer ─────────────────────────────────────────

function buildHeader(tabsNumber: string): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `Cleared \u2014 ${tabsNumber}`,
            font: FONT,
            size: SMALL_SIZE,
            color: HEADER_GRAY,
            italics: true,
          }),
        ],
        alignment: AlignmentType.LEFT,
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: BLUE_ACCENT },
        },
        spacing: { after: 100 },
      }),
    ],
  })
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: "Confidential \u2014 Page ",
            font: FONT,
            size: SMALL_SIZE,
            color: HEADER_GRAY,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT,
            size: SMALL_SIZE,
            color: HEADER_GRAY,
          }),
        ],
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: BLUE_ACCENT },
        },
        spacing: { before: 100 },
      }),
    ],
  })
}

// ── Shared document builder ─────────────────────────────────

/**
 * Convert our footnote map (numeric ID → plain-text citation) into the
 * shape the docx library expects: `{ [id]: { children: Paragraph[] } }`.
 *
 * Each footnote paragraph uses Times New Roman 10pt to match professional
 * legal/tax document conventions. Italics handling for case names is left to
 * the AI: if a citation contains markdown `*...*`, we still go through the
 * inline parser so it gets italicized in the footnote too.
 */
function buildFootnotesMap(
  footnotes: Map<number, string>
): { [id: number]: { children: Paragraph[] } } | undefined {
  if (footnotes.size === 0) return undefined
  const out: { [id: number]: { children: Paragraph[] } } = {}
  for (const [id, content] of footnotes.entries()) {
    out[id] = {
      children: [
        new Paragraph({
          children: inlineRuns(content, FOOTNOTE_SIZE), // 10pt Times New Roman
          spacing: { line: 240 },
        }),
      ],
    }
  }
  return out
}

function buildDocument(
  coverBlock: DocChild[],
  bodyElements: DocChild[],
  tabsNumber: string,
  footnotes?: Map<number, string>
): Document {
  const footnotesMap = footnotes ? buildFootnotesMap(footnotes) : undefined

  return new Document({
    ...(footnotesMap ? { footnotes: footnotesMap } : {}),
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE, color: BODY_COLOR },
          paragraph: { spacing: { line: 276 } },  // 1.15 line spacing
        },
        heading1: {
          run: { font: FONT, size: H1_SIZE, bold: true, color: NAVY },
          paragraph: { spacing: { before: 360, after: 200 } },
        },
        heading2: {
          run: { font: FONT, size: H2_SIZE, bold: true, color: BLUE_ACCENT },
          paragraph: { spacing: { before: 280, after: 160 } },
        },
        heading3: {
          run: { font: FONT, size: H3_SIZE, bold: true, color: DARK_GRAY },
          paragraph: { spacing: { before: 200, after: 120 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "cleared-numbering",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { run: { font: FONT, size: BODY_SIZE } },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: "%2.",
              alignment: AlignmentType.LEFT,
              style: { run: { font: FONT, size: BODY_SIZE } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        headers: { default: buildHeader(tabsNumber) },
        footers: { default: buildFooter() },
        children: [...coverBlock, ...bodyElements],
      },
    ],
  })
}

// ── Main export: markdown → docx ────────────────────────────

/**
 * Generate a professional Word document from AI markdown output.
 *
 * Pipeline:
 * 1. Extract Bluebook footnote definitions (if any) from the markdown
 * 2. Parse markdown to AST using `marked`
 * 3. Walk AST and render each node as proper Word elements
 * 4. Build Word footnotes from the extracted definitions
 * 5. Wrap in professional template with cover block, headers, footers
 *
 * All text uses Times New Roman (firm-wide standard). Footnotes render at 10pt
 * with real Word `FootnoteReferenceRun` entries — not fake superscript text —
 * so practitioners can edit them in Word before filing.
 */
export async function generateDocx(
  content: string,
  tabsNumber: string,
  clientName: string,
  taskType: string
): Promise<Buffer> {
  // 1. Pull footnote definitions out and normalize IDs to sequential integers.
  const { body, footnotes } = extractFootnotes(content)
  // 2. Parse the footnote-stripped body as markdown.
  const tokens = marked.lexer(body)
  const coverBlock = buildCoverBlock(tabsNumber, clientName, taskType)
  const bodyElements = renderTokens(tokens)
  const doc = buildDocument(coverBlock, bodyElements, tabsNumber, footnotes)
  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}

// ── Template-based export: MergeResult → docx ───────────────

interface MergeResultField {
  key: string
  label: string
  value: any
  type: string
  flag?: string
}

interface MergeResultSection {
  title: string
  fields: MergeResultField[]
}

interface MergeResultTab {
  name: string
  sections: MergeResultSection[]
}

interface MergeResultSummary {
  totalLiability: number
  totalAssetEquity: number
  monthlyNetIncome: number
  rcpLump: number
  rcpPeriodic: number
}

interface MergeResult {
  tabs: MergeResultTab[]
  summary?: MergeResultSummary
  validationIssues?: Array<{ severity: string; label: string; issue: string }>
  extractedArrays?: {
    tax_liability: Array<Record<string, any>>
    [key: string]: any
  }
}

function formatFieldValue(field: MergeResultField): string {
  if (field.value == null) return "N/A"
  if (field.type === "currency" && typeof field.value === "number") {
    return `$${field.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
  }
  if (field.type === "percent" && typeof field.value === "number") {
    return `${field.value}%`
  }
  if (field.type === "boolean") {
    return field.value ? "Yes" : "No"
  }
  return String(field.value)
}

function flagShading(flag: string | undefined): { type: typeof ShadingType.CLEAR; fill: string } | undefined {
  if (!flag) return undefined
  if (flag === "VERIFY" || flag.includes("VERIFY")) {
    return { type: ShadingType.CLEAR, fill: YELLOW_HIGHLIGHT }
  }
  if (flag === "PRACTITIONER_JUDGMENT" || flag.includes("JUDGMENT")) {
    return { type: ShadingType.CLEAR, fill: ORANGE_HIGHLIGHT }
  }
  if (flag === "MISSING" || flag.includes("MISSING")) {
    return { type: ShadingType.CLEAR, fill: RED_HIGHLIGHT }
  }
  return undefined
}

function renderSectionTable(section: MergeResultSection): DocChild[] {
  const elements: DocChild[] = []

  // Section title
  elements.push(
    new Paragraph({
      children: [
        new TextRun({ text: section.title, font: FONT, size: H3_SIZE, bold: true, color: DARK_GRAY }),
      ],
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 120 },
    })
  )

  if (section.fields.length === 0) return elements

  // Render fields as a Label | Value | Notes table
  const headerRow = new TableRow({
    tableHeader: true,
    children: ["Field", "Value", "Notes"].map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text, font: FONT, size: TABLE_SIZE, bold: true, color: "FFFFFF" }),
              ],
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
          margins: CELL_MARGINS,
        })
    ),
  })

  const dataRows = section.fields.map((field, idx) => {
    const altShading = idx % 2 === 1 ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG } : undefined
    const shading = flagShading(field.flag) ?? altShading
    const flagNote = field.flag
      ? field.flag.replace(/_/g, " ")
      : ""

    return new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: field.label, font: FONT, size: TABLE_SIZE })],
            }),
          ],
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading,
          margins: CELL_MARGINS,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: formatFieldValue(field),
                  font: FONT,
                  size: TABLE_SIZE,
                  bold: field.type === "currency" || field.type === "formula",
                }),
              ],
            }),
          ],
          width: { size: 40, type: WidthType.PERCENTAGE },
          shading,
          margins: CELL_MARGINS,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: flagNote
                ? inlineRuns(`[${flagNote}]`, TABLE_SIZE)
                : [new TextRun({ text: "", font: FONT, size: TABLE_SIZE })],
            }),
          ],
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading,
          margins: CELL_MARGINS,
        }),
      ],
    })
  })

  elements.push(
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        left: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        right: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      },
    })
  )

  return elements
}

function renderSummarySection(summary: MergeResultSummary): DocChild[] {
  const elements: DocChild[] = []

  elements.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Offer Summary & RCP Calculation", font: FONT, size: H2_SIZE, bold: true, color: BLUE_ACCENT }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 160 },
    })
  )

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
  const rows = [
    ["Total Tax Liability", fmt(summary.totalLiability)],
    ["Total Asset Equity", fmt(summary.totalAssetEquity)],
    ["Monthly Net Income", fmt(summary.monthlyNetIncome)],
    ["RCP (Lump Sum — 5 month)", fmt(summary.rcpLump)],
    ["RCP (Periodic — 24 month)", fmt(summary.rcpPeriodic)],
  ]

  const headerRow = new TableRow({
    tableHeader: true,
    children: ["Metric", "Amount"].map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text, font: FONT, size: TABLE_SIZE, bold: true, color: "FFFFFF" }),
              ],
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
          margins: CELL_MARGINS,
        })
    ),
  })

  const dataRows = rows.map(
    ([label, value], idx) =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: label, font: FONT, size: TABLE_SIZE, bold: true })],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: idx % 2 === 1 ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG } : undefined,
            margins: CELL_MARGINS,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: value, font: FONT, size: TABLE_SIZE, bold: true })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: idx % 2 === 1 ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG } : undefined,
            margins: CELL_MARGINS,
          }),
        ],
      })
  )

  elements.push(
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        left: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        right: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      },
    })
  )

  return elements
}

function renderLiabilityTable(taxLiability: Array<Record<string, any>>): DocChild[] {
  if (!taxLiability || taxLiability.length === 0) return []

  const elements: DocChild[] = []

  elements.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Tax Liability Detail", font: FONT, size: H2_SIZE, bold: true, color: BLUE_ACCENT }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 160 },
    })
  )

  const cols = ["Year", "Form", "Assessed", "Penalties", "Interest", "Total", "CSED"]
  const headerRow = new TableRow({
    tableHeader: true,
    children: cols.map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text, font: FONT, size: TABLE_SIZE, bold: true, color: "FFFFFF" })],
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
          margins: CELL_MARGINS,
        })
    ),
  })

  const fmt = (v: any) => typeof v === "number" ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : String(v ?? "N/A")

  const dataRows = taxLiability.map(
    (row, idx) =>
      new TableRow({
        children: [
          row.year ?? "",
          row.form ?? "",
          fmt(row.assessed),
          fmt(row.penalties),
          fmt(row.interest),
          fmt(row.total),
          row.csed ?? "N/A",
        ].map(
          (text) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: String(text), font: FONT, size: TABLE_SIZE })],
                }),
              ],
              shading: idx % 2 === 1 ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG } : undefined,
              margins: CELL_MARGINS,
            })
        ),
      })
  )

  elements.push(
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        left: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        right: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
      },
    })
  )

  return elements
}

/**
 * Generate a Word document from a structured MergeResult (OIC working papers).
 *
 * Instead of converting back to markdown text, this renders the structured
 * data directly as Word tables — one section per tab, with field tables
 * showing Label / Value / Notes columns, flag highlighting, and a
 * prominent RCP summary section.
 */
export async function generateTemplateDocx(
  merged: MergeResult,
  tabsNumber: string,
  clientName: string
): Promise<Buffer> {
  const coverBlock = buildCoverBlock(tabsNumber, clientName, "WORKING_PAPERS")
  const bodyElements: DocChild[] = []

  // Summary section first (most important)
  if (merged.summary) {
    bodyElements.push(...renderSummarySection(merged.summary))
  }

  // Liability table
  if (merged.extractedArrays?.tax_liability) {
    bodyElements.push(...renderLiabilityTable(merged.extractedArrays.tax_liability))
  }

  // Each tab as a section
  for (const tab of merged.tabs) {
    bodyElements.push(
      new Paragraph({
        children: [
          new TextRun({ text: tab.name, font: FONT, size: H1_SIZE, bold: true, color: NAVY }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 200 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 2, color: BLUE_ACCENT },
        },
      })
    )

    for (const section of tab.sections) {
      bodyElements.push(...renderSectionTable(section))
    }
  }

  // Validation issues
  if (merged.validationIssues && merged.validationIssues.length > 0) {
    bodyElements.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Validation Issues", font: FONT, size: H2_SIZE, bold: true, color: BLUE_ACCENT }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 160 },
      })
    )

    for (const issue of merged.validationIssues) {
      const highlight = issue.severity === "error" ? "red" : "yellow"
      bodyElements.push(
        new Paragraph({
          children: [
            ...segmentsToRuns([{ text: `[${issue.severity.toUpperCase()}] `, bold: true, highlight, color: issue.severity === "error" ? "CC0000" : "CC8800" }]),
            new TextRun({ text: `${issue.label}: ${issue.issue}`, font: FONT, size: BODY_SIZE }),
          ],
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      )
    }
  }

  const doc = buildDocument(coverBlock, bodyElements, tabsNumber)
  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
