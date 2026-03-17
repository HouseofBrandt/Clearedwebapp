import ExcelJS from "exceljs"

interface SpreadsheetTab {
  name: string
  columns: string[]
  rows: string[][]
}

/**
 * Generate an OIC Working Paper Excel workbook from structured data.
 * Returns a Buffer that can be sent as a download.
 */
export async function generateOICWorkbook(
  tabs: SpreadsheetTab[],
  caseNumber: string,
  clientName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "CLEARED Tax Resolution Platform"
  workbook.created = new Date()

  // Add a cover sheet
  const cover = workbook.addWorksheet("Cover")
  cover.getCell("A1").value = "Offer in Compromise Working Papers"
  cover.getCell("A1").font = { bold: true, size: 16 }
  cover.getCell("A3").value = `Case: ${caseNumber}`
  cover.getCell("A3").font = { size: 12 }
  cover.getCell("A4").value = `Client: ${clientName}`
  cover.getCell("A4").font = { size: 12 }
  cover.getCell("A5").value = `Generated: ${new Date().toLocaleDateString()}`
  cover.getCell("A5").font = { size: 11, color: { argb: "FF666666" } }
  cover.getCell("A7").value = "DRAFT — Requires practitioner review and approval"
  cover.getCell("A7").font = { bold: true, color: { argb: "FFCC0000" }, size: 12 }
  cover.getColumn(1).width = 50

  // Add each data tab
  for (const tab of tabs) {
    const sheet = workbook.addWorksheet(tab.name)

    if (tab.columns.length === 0) continue

    // Header row
    const headerRow = sheet.addRow(tab.columns)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E79" },
      }
      cell.alignment = { horizontal: "center" }
      cell.border = {
        bottom: { style: "thin" },
      }
    })

    // Data rows
    for (let i = 0; i < tab.rows.length; i++) {
      const row = sheet.addRow(tab.rows[i])

      // Highlight rows containing [VERIFY] or [PRACTITIONER JUDGMENT]
      const rowText = tab.rows[i].join(" ")
      if (rowText.includes("[VERIFY]")) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF3CD" }, // yellow highlight
          }
        })
      } else if (rowText.includes("[PRACTITIONER JUDGMENT]")) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFCCE5FF" }, // blue highlight
          }
        })
      }

      // Alternate row shading
      if (i % 2 === 0 && !rowText.includes("[VERIFY]") && !rowText.includes("[PRACTITIONER JUDGMENT]")) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8F9FA" },
          }
        })
      }
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
