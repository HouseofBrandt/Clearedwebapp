import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
} from "docx"

/**
 * Generate a Word document from AI-generated text output.
 * Parses markdown-like formatting (headers, bullets, bold) into proper docx elements.
 */
export async function generateDocx(
  content: string,
  caseNumber: string,
  clientName: string,
  taskType: string
): Promise<Buffer> {
  const paragraphs: Paragraph[] = []

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: taskType.replace(/_/g, " "),
          bold: true,
          size: 32,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  )

  // Case info
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Case: ${caseNumber}`, size: 24, font: "Calibri" }),
      ],
      alignment: AlignmentType.CENTER,
    })
  )
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Client: ${clientName}`, size: 24, font: "Calibri" }),
      ],
      alignment: AlignmentType.CENTER,
    })
  )
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleDateString()}`,
          size: 20,
          color: "666666",
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  )

  // Draft warning
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "DRAFT \u2014 Requires practitioner review and approval",
          bold: true,
          color: "CC0000",
          size: 24,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      },
    })
  )

  // Parse content lines
  const lines = content.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }))
      continue
    }

    // Section headers (lines in ALL CAPS or starting with ##)
    if (trimmed.match(/^#{1,3}\s+/) || (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.match(/[A-Z]/))) {
      const headerText = trimmed.replace(/^#{1,3}\s+/, "")
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: headerText,
              bold: true,
              size: 26,
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
        })
      )
      continue
    }

    // Numbered section headers (e.g., "1. TAXPAYER INFORMATION")
    const numberedHeader = trimmed.match(/^(\d+)\.\s+([A-Z][A-Z\s&()]+)$/)
    if (numberedHeader) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: 24,
              font: "Calibri",
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
        })
      )
      continue
    }

    // Highlight [VERIFY] and [PRACTITIONER JUDGMENT] flags
    if (trimmed.includes("[VERIFY]") || trimmed.includes("[PRACTITIONER JUDGMENT]")) {
      const parts: TextRun[] = []
      let remaining = trimmed

      while (remaining.length > 0) {
        const verifyIdx = remaining.indexOf("[VERIFY]")
        const judgmentIdx = remaining.indexOf("[PRACTITIONER JUDGMENT]")

        let nextFlag = -1
        let flagText = ""
        if (verifyIdx >= 0 && (judgmentIdx < 0 || verifyIdx < judgmentIdx)) {
          nextFlag = verifyIdx
          flagText = "[VERIFY]"
        } else if (judgmentIdx >= 0) {
          nextFlag = judgmentIdx
          flagText = "[PRACTITIONER JUDGMENT]"
        }

        if (nextFlag < 0) {
          parts.push(new TextRun({ text: remaining, size: 22, font: "Calibri" }))
          break
        }

        if (nextFlag > 0) {
          parts.push(new TextRun({ text: remaining.substring(0, nextFlag), size: 22, font: "Calibri" }))
        }
        parts.push(
          new TextRun({
            text: flagText,
            bold: true,
            color: flagText === "[VERIFY]" ? "CC8800" : "0066CC",
            size: 22,
            font: "Calibri",
          })
        )
        remaining = remaining.substring(nextFlag + flagText.length)
      }

      paragraphs.push(new Paragraph({ children: parts, spacing: { after: 80 } }))
      continue
    }

    // Bullet points
    if (trimmed.match(/^[-•*]\s+/)) {
      const bulletText = trimmed.replace(/^[-•*]\s+/, "")
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: bulletText, size: 22, font: "Calibri" })],
          bullet: { level: 0 },
          spacing: { after: 40 },
        })
      )
      continue
    }

    // Sub-bullets
    if (trimmed.match(/^\s+[-•*]\s+/)) {
      const bulletText = trimmed.replace(/^\s+[-•*]\s+/, "")
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: bulletText, size: 22, font: "Calibri" })],
          bullet: { level: 1 },
          spacing: { after: 40 },
        })
      )
      continue
    }

    // Regular text
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: trimmed, size: 22, font: "Calibri" })],
        spacing: { after: 80 },
      })
    )
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
