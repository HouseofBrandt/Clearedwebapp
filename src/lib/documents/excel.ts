import ExcelJS from "exceljs"

const FONT = "Times New Roman"
const HEADER_BG = "FF1B2A4A"
const TABLE_BORDER_COLOR = "FFB0C4D8"
const ALT_ROW_BG = "FFF5F5F5"
const VERIFY_BG = "FFFFF3CD"
const JUDGMENT_BG = "FFCCE5FF"
const MISSING_BG = "FFFFE0E0"

const thinBorder: ExcelJS.Border = { style: "thin", color: { argb: TABLE_BORDER_COLOR } }
const allBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
}

interface SpreadsheetTab {
  name: string
  columns: string[]
  rows: string[][]
}

/**
 * Generate an OIC Working Paper Excel workbook from structured data.
 * All text uses Times New Roman (firm-wide standard).
 */
export async function generateOICWorkbook(
  tabs: SpreadsheetTab[],
  caseNumber: string,
  clientName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "CLEARED Tax Resolution Platform"
  workbook.created = new Date()

  // Cover sheet
  const cover = workbook.addWorksheet("Cover")
  cover.headerFooter.oddHeader = `&L&"${FONT}"&8CLEARED \u2014 ${caseNumber}`
  cover.headerFooter.oddFooter = `&C&"${FONT}"&8Confidential`

  cover.getCell("A1").value = "CLEARED"
  cover.getCell("A1").font = { name: FONT, bold: true, size: 20, color: { argb: "FF1B2A4A" } }
  cover.getCell("A2").value = "Offer in Compromise Working Papers"
  cover.getCell("A2").font = { name: FONT, bold: true, size: 14, color: { argb: "FF2E75B6" } }
  cover.getCell("A4").value = `Case: ${caseNumber}`
  cover.getCell("A4").font = { name: FONT, size: 12 }
  cover.getCell("A5").value = `Client: ${clientName}`
  cover.getCell("A5").font = { name: FONT, size: 12 }
  cover.getCell("A6").value = `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
  cover.getCell("A6").font = { name: FONT, size: 11, color: { argb: "FF666666" } }
  cover.getCell("A8").value = "DRAFT \u2014 Requires Practitioner Review and Approval"
  cover.getCell("A8").font = { name: FONT, bold: true, color: { argb: "FFCC0000" }, size: 12 }
  cover.getColumn(1).width = 55

  // Data tabs
  for (const tab of tabs) {
    const sheet = workbook.addWorksheet(tab.name)

    // Sheet header/footer
    sheet.headerFooter.oddHeader = `&L&"${FONT}"&8CLEARED \u2014 ${caseNumber}`
    sheet.headerFooter.oddFooter = `&C&"${FONT}"&8Confidential`

    if (tab.columns.length === 0) continue

    // Header row
    const headerRow = sheet.addRow(tab.columns)
    headerRow.eachCell((cell) => {
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } }
      cell.alignment = { horizontal: "center", vertical: "middle" }
      cell.border = allBorders
    })

    // Data rows
    for (let i = 0; i < tab.rows.length; i++) {
      const rowData = tab.rows[i]
      const row = sheet.addRow(rowData)
      const rowText = rowData.join(" ")

      // Determine row highlight
      let rowBg: string | undefined
      if (rowText.includes("[MISSING]")) {
        rowBg = MISSING_BG
      } else if (rowText.includes("[VERIFY]")) {
        rowBg = VERIFY_BG
      } else if (rowText.includes("[PRACTITIONER JUDGMENT]")) {
        rowBg = JUDGMENT_BG
      } else if (i % 2 === 1) {
        rowBg = ALT_ROW_BG
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: FONT, size: 10 }
        cell.border = allBorders

        if (rowBg) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } }
        }

        // Apply currency format to cells that look like dollar amounts
        const val = rowData[colNumber - 1]
        if (val && /^\$?[\d,]+\.\d{2}$/.test(val.replace(/,/g, "").replace("$", ""))) {
          const numVal = parseFloat(val.replace(/[$,]/g, ""))
          if (!isNaN(numVal)) {
            cell.value = numVal
            cell.numFmt = '$#,##0.00'
          }
        }
      })
    }

    // Auto-fit columns
    sheet.columns.forEach((col) => {
      let maxLen = 10
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0
        if (len > maxLen) maxLen = Math.min(len, 50)
      })
      col.width = maxLen + 2
    })
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
