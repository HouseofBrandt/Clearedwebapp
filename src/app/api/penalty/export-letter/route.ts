import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
} from "docx"

/**
 * POST /api/penalty/export-letter
 *
 * Generates a penalty abatement letter as .docx from the generated letter text.
 * Font: Times New Roman throughout per document export standard.
 */

interface ExportLetterPayload {
  letterText: string
  letterType: "fta" | "reasonable-cause"
  taxpayerName?: string
  taxYears?: number[]
}

const FONT = "Times New Roman"
const FONT_SIZE = 24 // half-points (12pt)
const HEADING_SIZE = 28 // 14pt

/**
 * Parse the markdown-ish letter text into docx paragraphs.
 * Handles: ### headings, **bold**, --- horizontal rules, bullet lists, blank lines.
 */
function parseLetterToParagraphs(text: string): Paragraph[] {
  const lines = text.split("\n")
  const paragraphs: Paragraph[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Blank line -> empty paragraph
    if (trimmed === "") {
      paragraphs.push(new Paragraph({ spacing: { after: 120 } }))
      continue
    }

    // Horizontal rule
    if (trimmed === "---") {
      paragraphs.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
          },
          spacing: { after: 200 },
        })
      )
      continue
    }

    // Section markers (skip them in export)
    if (
      trimmed === "[AUTO-GENERATED]" ||
      trimmed === "[/AUTO-GENERATED]" ||
      trimmed === "[PRACTITIONER INPUT]" ||
      trimmed === "[/PRACTITIONER INPUT]"
    ) {
      continue
    }

    // Heading ###
    if (trimmed.startsWith("### ")) {
      const headingText = trimmed.replace(/^###\s+/, "")
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: headingText,
              font: FONT,
              size: HEADING_SIZE,
              bold: true,
            }),
          ],
        })
      )
      continue
    }

    // Bullet list item
    if (trimmed.startsWith("- ")) {
      const bulletText = trimmed.slice(2)
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: parseInlineFormatting(bulletText),
        })
      )
      continue
    }

    // Numbered list item
    const numberedMatch = trimmed.match(/^\d+\.\s+/)
    if (numberedMatch) {
      const itemText = trimmed.slice(numberedMatch[0].length)
      paragraphs.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: trimmed.slice(0, numberedMatch[0].length),
              font: FONT,
              size: FONT_SIZE,
              bold: true,
            }),
            ...parseInlineFormatting(itemText),
          ],
        })
      )
      continue
    }

    // Regular paragraph (may contain **bold** markers)
    paragraphs.push(
      new Paragraph({
        spacing: { after: 120 },
        children: parseInlineFormatting(trimmed),
      })
    )
  }

  return paragraphs
}

/**
 * Parse inline **bold** markers into TextRun arrays.
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/)

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          font: FONT,
          size: FONT_SIZE,
          bold: true,
        })
      )
    } else if (part) {
      runs.push(
        new TextRun({
          text: part,
          font: FONT,
          size: FONT_SIZE,
        })
      )
    }
  }

  return runs
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const payload: ExportLetterPayload = await request.json()
    const { letterText, letterType } = payload

    if (!letterText) {
      return NextResponse.json(
        { error: "letterText is required" },
        { status: 400 }
      )
    }

    // Build the document
    const doc = new Document({
      creator: "Cleared Platform",
      description: `Penalty Abatement Letter (${letterType})`,
      styles: {
        default: {
          document: {
            run: {
              font: FONT,
              size: FONT_SIZE,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,    // 1 inch
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: parseLetterToParagraphs(letterText),
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)

    const typeLabel = letterType === "fta" ? "FTA" : "Reasonable_Cause"
    const dateStr = new Date().toISOString().split("T")[0]
    const filename = `Penalty_Abatement_${typeLabel}_${dateStr}.docx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error("Penalty letter export error:", error)
    return NextResponse.json(
      { error: `Failed to generate letter: ${error.message}` },
      { status: 500 }
    )
  }
}
