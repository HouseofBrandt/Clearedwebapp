import { PDFDocument } from "pdf-lib"
import { readFile } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"
import { getFormSchema } from "./registry"

export interface AutoMapResult {
  formNumber: string
  mappings: Record<string, string> // our field ID -> PDF field name
  unmapped: string[] // our fields with no match
  confidence: number // 0-100
  generatedAt: string
}

// Cache auto-mapped results in memory (persists for the serverless instance lifetime)
const mapCache = new Map<string, AutoMapResult>()

// Explicit form number -> PDF filename mapping for known forms
const EXPLICIT_PDF_FILES: Record<string, string> = {
  "433-A": "f433a.pdf",
  "433-A-OIC": "f433aoic.pdf",
  "12153": "f12153.pdf",
  "911": "f911.pdf",
}

/**
 * Derive a PDF filename from a form number.
 * Checks explicit mapping first, then tries IRS standard naming convention.
 */
export function getPDFFileName(formNumber: string): string | null {
  if (EXPLICIT_PDF_FILES[formNumber]) {
    return EXPLICIT_PDF_FILES[formNumber]
  }
  // Try standard IRS naming convention: Form 1040 -> f1040.pdf, Form 433-B -> f433b.pdf
  const standardName = `f${formNumber.toLowerCase().replace(/-/g, "")}.pdf`
  const pdfPath = join(process.cwd(), "public", "forms", standardName)
  if (existsSync(pdfPath)) {
    return standardName
  }
  return null
}

/**
 * Get the AI-powered auto-mapping for a form.
 * Loads the PDF, extracts AcroForm field names, loads the FormSchema,
 * sends both to Claude for matching, caches the result.
 */
export async function getAutoMapping(formNumber: string): Promise<AutoMapResult | null> {
  // Check cache first
  if (mapCache.has(formNumber)) {
    return mapCache.get(formNumber)!
  }

  const pdfFile = getPDFFileName(formNumber)
  if (!pdfFile) {
    console.error(`[AUTO-MAP] No PDF file found for ${formNumber}`)
    return null
  }

  const schema = await getFormSchema(formNumber)
  if (!schema) {
    console.error(`[AUTO-MAP] No schema found for ${formNumber}`)
    return null
  }

  console.log(`[AUTO-MAP] Starting auto-map for ${formNumber}, PDF: ${pdfFile}, Schema sections: ${schema.sections.length}`)

  try {
    // Step 1: Extract all PDF field names
    const pdfPath = join(process.cwd(), "public", "forms", pdfFile)
    if (!existsSync(pdfPath)) {
      console.error(`[AUTO-MAP] PDF file not found: ${pdfPath}`)
      return null
    }

    const pdfBytes = await readFile(pdfPath)
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const form = pdfDoc.getForm()
    const pdfFields = form.getFields().map(f => ({
      name: f.getName(),
      type: f.constructor.name,
    }))

    if (pdfFields.length === 0) {
      // Pure XFA form with no AcroForm fields - cannot auto-map
      const emptyResult: AutoMapResult = {
        formNumber,
        mappings: {},
        unmapped: [],
        confidence: 0,
        generatedAt: new Date().toISOString(),
      }
      mapCache.set(formNumber, emptyResult)
      return emptyResult
    }

    // Step 2: Build our field list from schema
    const ourFields: { id: string; label: string; type: string; irsRef?: string; section: string }[] = []
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (field.type === "computed") continue // Skip computed fields

        ourFields.push({
          id: field.id,
          label: field.label,
          type: field.type,
          irsRef: field.irsReference,
          section: section.title,
        })

        // Also add repeating group sub-fields with row indices
        if (field.type === "repeating_group" && field.groupFields) {
          const rowCount = field.maxGroups || 3
          for (let row = 0; row < rowCount; row++) {
            for (const subField of field.groupFields) {
              ourFields.push({
                id: `${field.id}.${row}.${subField.id}`,
                label: `${field.label} Row ${row + 1}: ${subField.label}`,
                type: subField.type,
                section: section.title,
              })
            }
          }
        }
      }
    }

    // Step 3: Send to Claude for matching
    const { default: Anthropic } = await import("@anthropic-ai/sdk")
    const client = new Anthropic()

    const prompt = `You are mapping form fields between a web application schema and an IRS PDF form (Form ${formNumber}).

WEB APP FIELDS (our field IDs and labels):
${ourFields.map(f => `- ${f.id} | "${f.label}" | type: ${f.type} | section: ${f.section}${f.irsRef ? ` | IRS ref: ${f.irsRef}` : ""}`).join("\n")}

PDF ACROFORM FIELDS (from the actual IRS PDF):
${pdfFields.map(f => `- ${f.name} (${f.type})`).join("\n")}

TASK: Match each web app field to the PDF field that represents the same data on the IRS form.

RULES:
- Match by meaning, not by exact name
- PDF field names contain structural clues:
  - "topmostSubform[0].Page1[0]" = page prefix
  - "Lines1a-b" might mean name/address area
  - "Line1c" = county or another sub-line
  - "p1-t4" = page 1, text field 4
  - "p3_t58_35" = page 3, field 58, IRS line 35
  - "Table_Part4-Line5" = table structure
  - "F02_030" or "F02_031" = sequential field IDs in a table
  - "ClaimedAsDependents" = dependents table
  - "Row1", "Row2" etc. = repeating row indices
  - "cb" prefix typically means checkbox
- For repeating groups (like dependents.0.dep_name, dependents.1.dep_name), match to Row1, Row2, Row3 etc. in the PDF
- If a web app field has no corresponding PDF field, include it in the unmapped list
- Only map fields you are confident about
- Include the FULL PDF field name path (e.g., "topmostSubform[0].Page1[0].c1[0].Lines1a-b[0].p1-t4[0]")

Return ONLY valid JSON with no markdown formatting, no backticks, no code blocks:
{
  "mappings": {
    "our_field_id": "full_pdf_field_name"
  },
  "unmapped": ["field_ids_with_no_match"],
  "confidence": 85
}`

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("")

    // Clean up any markdown code block formatting the model might include despite instructions
    const clean = responseText.replace(/```json\n?|```\n?/g, "").trim()
    const parsed = JSON.parse(clean)

    const result: AutoMapResult = {
      formNumber,
      mappings: parsed.mappings || {},
      unmapped: parsed.unmapped || [],
      confidence: parsed.confidence || 0,
      generatedAt: new Date().toISOString(),
    }

    // Cache the result
    mapCache.set(formNumber, result)
    console.log(
      `[AUTO-MAP] ${formNumber}: ${Object.keys(result.mappings).length} mapped, ` +
      `${result.unmapped.length} unmapped, confidence ${result.confidence}%`
    )

    return result
  } catch (error: any) {
    console.error(`[AUTO-MAP] Failed for ${formNumber}:`, error.message, error.stack?.slice(0, 200))
    // Return error info instead of null so the API can show what went wrong
    return {
      formNumber,
      mappings: {},
      unmapped: [],
      confidence: 0,
      generatedAt: new Date().toISOString(),
      error: error.message,
    } as AutoMapResult & { error: string }
  }
}

/**
 * Clear cached auto-map results.
 * Useful after manual corrections or schema changes.
 */
export function clearAutoMapCache(formNumber?: string): void {
  if (formNumber) {
    mapCache.delete(formNumber)
  } else {
    mapCache.clear()
  }
}
