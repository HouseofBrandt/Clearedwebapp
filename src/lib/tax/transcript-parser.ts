/**
 * IRS Transcript Parser
 *
 * Uses Claude to extract structured data from uploaded IRS transcripts (PDFs).
 * Supports Wage & Income, Account, and Tax Return transcripts.
 */

import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

const PARSE_PROMPT = `You are a tax transcript parser for an IRS resolution firm. Extract ALL data from uploaded IRS transcripts into structured JSON.
Return ONLY valid JSON — no markdown, no backticks, no preamble.

For each transcript, identify:
- Transcript type: "wage_income", "account", or "tax_return"
- Tax year from "Tax Period Requested" or "Report for Tax Period Ending"
- All income forms with payer, EIN, and dollar amounts
- All transaction codes with dates and amounts
- Filing status, balance information, special flags

Output this exact JSON structure:
{
  "taxpayer": {
    "name": "string",
    "ssn_last4": "string",
    "addresses": ["string"],
    "representative_payee": "string or null"
  },
  "years": {
    "YYYY": {
      "wage_income": {
        "forms": [
          {
            "type": "SSA-1099|1099-R|W-2|1099-INT|1099-MISC|1099-NEC|1099-DIV|1099-B|1098|other",
            "payer": "string",
            "ein": "string",
            "fields": {
              "gross_benefits": 0,
              "repayments": 0,
              "net_benefits": 0,
              "gross_distribution": 0,
              "taxable_amount": 0,
              "fed_withheld": 0,
              "distribution_code": "string",
              "interest": 0,
              "dividends": 0,
              "wages": 0,
              "mortgage_interest": 0,
              "outstanding_principal": 0,
              "nonemployee_comp": 0,
              "state_withheld": 0,
              "other_fields": {}
            }
          }
        ]
      },
      "account": {
        "balance": 0,
        "accrued_interest": 0,
        "accrued_penalty": 0,
        "filing_status": "string or null",
        "return_filed": true,
        "return_present": true,
        "transactions": [
          {"code": "string", "description": "string", "date": "string", "amount": 0, "cycle": "string"}
        ],
        "flags": []
      },
      "tax_return": {
        "filed": true,
        "agi": 0,
        "taxable_income": 0,
        "tax_liability": 0,
        "payments": 0,
        "filing_status": "string"
      }
    }
  }
}

CRITICAL RULES:
- Use numbers not strings for dollar amounts (no $ signs, no commas)
- Include ALL forms found on wage & income transcripts
- Include ALL transaction codes from account transcripts
- If a transcript says "No record of return filed" set return_filed: false
- If a transcript says "Requested data not found" set return_present: false and return_filed: false
- Flag "Deceased taxpayer" (TC 540), "ASFR" (TC 590/598/599), "Lien" (TC 582)
- For SSA-1099: gross_benefits = Total Benefits Paid, repayments = Repayments amount
- For 1099-R: get gross_distribution, taxable_amount, fed_withheld, distribution_code
- For 1098: get mortgage_interest, outstanding_principal
- For 1099-INT: get interest amount
- Merge data for the same year from different transcript types`

export interface TranscriptData {
  taxpayer: {
    name: string
    ssn_last4: string
    addresses: string[]
    representative_payee: string | null
  } | null
  years: Record<string, any>
}

/**
 * Parse IRS transcript PDFs using Claude.
 * Processes in batches of 6 to stay within API limits.
 */
export async function parseTranscripts(
  fileContents: { data: string; mediaType: string }[],
  onProgress?: (msg: string) => void
): Promise<TranscriptData> {
  const BATCH = 6
  let allYears: Record<string, any> = {}
  let taxpayer: TranscriptData["taxpayer"] = null

  for (let i = 0; i < fileContents.length; i += BATCH) {
    const batch = fileContents.slice(i, i + BATCH)
    onProgress?.(`Parsing batch ${Math.floor(i / BATCH) + 1} of ${Math.ceil(fileContents.length / BATCH)}...`)

    const content: any[] = []
    for (const file of batch) {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: file.mediaType,
          data: file.data,
        },
      })
    }
    content.push({ type: "text", text: "Parse all the above IRS transcripts. Return ONLY the JSON object." })

    try {
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: PARSE_PROMPT,
        messages: [{ role: "user", content }],
      })

      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")

      const clean = text.replace(/```json\n?|```\n?/g, "").trim()

      try {
        const parsed = JSON.parse(clean)
        if (parsed.taxpayer && !taxpayer) taxpayer = parsed.taxpayer
        if (parsed.years) {
          for (const [yr, d] of Object.entries(parsed.years) as [string, any][]) {
            if (!allYears[yr]) allYears[yr] = {}
            if (d.wage_income) allYears[yr].wage_income = d.wage_income
            if (d.account) allYears[yr].account = d.account
            if (d.tax_return) allYears[yr].tax_return = d.tax_return
          }
        }
      } catch (e) {
        console.error("[TranscriptParser] JSON parse error:", e)
      }
    } catch (e: any) {
      console.error("[TranscriptParser] API error:", e.message)
    }
  }

  return { taxpayer, years: allYears }
}
