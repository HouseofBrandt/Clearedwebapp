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
  convertInchesToTwip,
} from "docx"
import { marked, type Token, type Tokens } from "marked"

// ── Brand constants ─────────────────────────────────────────
const FONT = "Times New Roman"
const NAVY = "1B2A4A"
const BLUE_ACCENT = "2E75B6"
const DARK_GRAY = "444444"
const BODY_COLOR = "333333"
const LIGHT_BLUE_BG = "E8F0FE"
const BLUE_BORDER = "2E75B6"
const YELLOW_BG = "FFF3CD"
const ORANGE_BG = "FFE0B2"
const RED_BG = "FFCDD2"
const TABLE_HEADER_BG = "1B2A4A"
const TABLE_ALT_BG = "F5F7FA"
const TABLE_BORDER = "B0BEC5"

// ── Size constants (half-points) ────────────────────────────
const H1_SIZE = 32  // 16pt
const H2_SIZE = 26  // 13pt
const H3_SIZE = 22  // 11pt
const BODY_SIZE = 22  // 11pt
const SMALL_SIZE = 18  // 9pt
const COVER_TITLE_SIZE = 52  // 26pt
const COVER_SUBTITLE_SIZE = 28  // 14pt

// ── Types ───────────────────────────────────────────────────
type DocChild = Paragraph | Table

// ── Inline text parsing ─────────────────────────────────────
// Handles **bold**, *italic*, `code`, [VERIFY], [PRACTITIONER JUDGMENT], [MISSING], and [ ] checkboxes

interface InlineSegment {
  text: string
  bold?: boolean
  italics?: boolean
  code?: boolean
  highlight?: "yellow" | "orange" | "red"
  highlightColor?: string
  color?: string
  checkbox?: boolean
}

function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  // Order matters: longest flags first, then bold, italic, code
  const pattern = /\[PRACTITIONER JUDGMENT\]|\[VERIFY\]|\[MISSING\]|\[[ x]\]|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }

    const full = match[0]
    if (full === "[VERIFY]") {
      segments.push({ text: "[VERIFY]", bold: true, highlight: "yellow", color: "CC0000" })
    } else if (full === "[PRACTITIONER JUDGMENT]") {
      segments.push({ text: "[PRACTITIONER JUDGMENT]", bold: true, highlight: "orange", color: "7B3F00" })
    } else if (full === "[MISSING]") {
      segments.push({ text: "[MISSING]", bold: true, highlight: "red", color: "B71C1C" })
    } else if (full === "[ ]") {
      segments.push({ text: "\u2610 ", checkbox: true })  // ☐
    } else if (full === "[x]") {
      segments.push({ text: "\u2611 ", checkbox: true })  // ☑
    } else if (match[1] !== undefined) {
      // **bold**
      segments.push({ text: match[1], bold: true })
    } else if (match[2] !== undefined) {
      // *italic*
      segments.push({ text: match[2], italics: true })
    } else if (match[3] !== undefined) {
      // `code`
      segments.push({ text: match[3], code: true })
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ text }]
}

function segmentsToRuns(segments: InlineSegment[], baseSizePts?: number): TextRun[] {
  const size = baseSizePts ?? BODY_SIZE
  return segments.map((seg) => {
    const shading = seg.highlight
      ? {
          type: ShadingType.CLEAR,
          fill: seg.highlight === "yellow" ? YELLOW_BG : seg.highlight === "orange" ? ORANGE_BG : RED_BG,
        }
      : undefined

    return new TextRun({
      text: seg.text,
      font: FONT,
      size,
      bold: seg.bold,
      italics: seg.italics,
      color: seg.color ?? (seg.code ? "6A1B9A" : undefined),
      shading,
    })
  })
}

function inlineRuns(text: string, size?: number): TextRun[] {
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
        // Skip pure whitespace tokens
        break
      default:
        // Fallback: render raw text if present
        if ("text" in token && typeof (token as any).text === "string") {
          children.push(
            new Paragraph({
              children: inlineRuns((token as any).text),
              spacing: { after: 120 },
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
      spacing: { before: 360, after: 160 },
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
      spacing: { before: 300, after: 120 },
    })
  }
  // depth 3+
  return new Paragraph({
    children: [
      new TextRun({ text, font: FONT, size: H3_SIZE, bold: true, color: DARK_GRAY }),
    ],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 100 },
  })
}

function renderParagraph(token: Tokens.Paragraph): Paragraph {
  return new Paragraph({
    children: inlineRuns(token.text),
    spacing: { after: 120, line: 276 },  // 1.15 line spacing
  })
}

function renderList(token: Tokens.List, level = 0): Paragraph[] {
  const items: Paragraph[] = []
  for (const item of token.items) {
    // Item text (may contain inline formatting)
    const text = item.text.split("\n")[0]  // First line is the item text
    if (token.ordered) {
      items.push(
        new Paragraph({
          children: inlineRuns(text),
          numbering: { reference: "cleared-numbering", level },
          spacing: { after: 60 },
        })
      )
    } else {
      items.push(
        new Paragraph({
          children: inlineRuns(text),
          bullet: { level },
          spacing: { after: 60 },
        })
      )
    }

    // Nested list tokens from the item
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
  // Even column widths as percentage
  const colWidthPct = Math.floor(100 / colCount)

  // Header row
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
                  size: BODY_SIZE,
                  bold: true,
                  color: "FFFFFF",
                }),
              ],
              spacing: { before: 40, after: 40 },
            }),
          ],
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
          width: { size: colWidthPct, type: WidthType.PERCENTAGE },
        })
    ),
  })

  // Data rows
  const dataRows = token.rows.map(
    (row, rowIdx) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineRuns(cell.text),
                  spacing: { before: 30, after: 30 },
                }),
              ],
              shading:
                rowIdx % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: TABLE_ALT_BG }
                  : undefined,
              width: { size: colWidthPct, type: WidthType.PERCENTAGE },
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
  const children: DocChild[] = []

  // Extract text from blockquote tokens
  const textParts: string[] = []
  for (const subToken of token.tokens) {
    if (subToken.type === "paragraph") {
      textParts.push((subToken as Tokens.Paragraph).text)
    }
  }
  const text = textParts.join("\n")

  children.push(
    new Paragraph({
      children: inlineRuns(text),
      spacing: { before: 120, after: 120 },
      indent: { left: convertInchesToTwip(0.3) },
      shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE_BG },
      border: {
        left: { style: BorderStyle.SINGLE, size: 6, color: BLUE_ACCENT },
      },
    })
  )

  return children
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
        color: "333333",
      }),
    ],
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
    indent: { left: convertInchesToTwip(0.3), right: convertInchesToTwip(0.3) },
  })
}

// ── Cover block ─────────────────────────────────────────────

function buildCoverBlock(
  caseNumber: string,
  clientName: string,
  taskType: string
): DocChild[] {
  const taskLabel = taskType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return [
    // Spacer
    new Paragraph({ spacing: { before: 600 } }),

    // CLEARED header
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
      spacing: { after: 80 },
    }),

    // Blue accent line
    new Paragraph({
      alignment: AlignmentType.CENTER,
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
          size: COVER_SUBTITLE_SIZE,
          color: BLUE_ACCENT,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // Case number
    new Paragraph({
      children: [
        new TextRun({ text: "Case: ", font: FONT, size: 24, color: DARK_GRAY }),
        new TextRun({ text: caseNumber, font: FONT, size: 24, bold: true, color: NAVY }),
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
          text: `Generated: ${new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`,
          font: FONT,
          size: 22,
          color: DARK_GRAY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),

    // DRAFT stamp
    new Paragraph({
      children: [
        new TextRun({
          text: "DRAFT \u2014 Requires Practitioner Review",
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

    // Divider after cover
    new Paragraph({
      spacing: { before: 400, after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: BLUE_ACCENT },
      },
    }),
  ]
}

// ── Header / Footer ─────────────────────────────────────────

function buildHeader(caseNumber: string): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `Cleared \u2014 ${caseNumber}`,
            font: FONT,
            size: SMALL_SIZE,
            color: DARK_GRAY,
            italics: true,
          }),
        ],
        alignment: AlignmentType.RIGHT,
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
            color: DARK_GRAY,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT,
            size: SMALL_SIZE,
            color: DARK_GRAY,
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

// ── Main export ─────────────────────────────────────────────

/**
 * Generate a professional Word document from AI markdown output.
 *
 * Pipeline:
 * 1. Parse markdown to AST using `marked`
 * 2. Walk AST and render each node as proper Word elements
 * 3. Wrap in professional template with cover block, headers, footers
 *
 * All text uses Times New Roman (firm-wide standard).
 */
export async function generateDocx(
  content: string,
  caseNumber: string,
  clientName: string,
  taskType: string
): Promise<Buffer> {
  // Parse markdown to token AST
  const tokens = marked.lexer(content)

  // Build document sections
  const coverBlock = buildCoverBlock(caseNumber, clientName, taskType)
  const bodyElements = renderTokens(tokens)

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE, color: BODY_COLOR },
        },
        heading1: {
          run: { font: FONT, size: H1_SIZE, bold: true, color: NAVY },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading2: {
          run: { font: FONT, size: H2_SIZE, bold: true, color: BLUE_ACCENT },
          paragraph: { spacing: { before: 300, after: 120 } },
        },
        heading3: {
          run: { font: FONT, size: H3_SIZE, bold: true, color: DARK_GRAY },
          paragraph: { spacing: { before: 240, after: 100 } },
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
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        headers: { default: buildHeader(caseNumber) },
        footers: { default: buildFooter() },
        children: [...coverBlock, ...bodyElements],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
