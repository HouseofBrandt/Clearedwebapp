// ---------------------------------------------------------------------------
// Auto-Population Engine — AI-Powered Document Extraction
//
// Reads EVERY document in the case file and uses Claude to extract
// form-relevant data. This is the core differentiator — practitioners
// should never manually re-enter data that exists in uploaded documents.
// ---------------------------------------------------------------------------

export interface AutoPopulatedField {
  fieldId: string
  value: any
  confidence: "high" | "medium" | "low"
  source: { documentId: string; documentName: string; documentType: string }
  extractedFrom: string
}

export interface AutoPopulationResult {
  fields: AutoPopulatedField[]
  highConfidence: number
  needsReview: number
  totalFound: number
  documentsUsed: string[]
}

// The prompt that tells Claude exactly what to extract for Form 433-A
const EXTRACTION_PROMPT = `You are extracting financial data from IRS case documents to auto-populate Form 433-A (Collection Information Statement).

Analyze ALL the document text provided and extract EVERY piece of information that maps to a Form 433-A field. Be thorough — look for:

PERSONAL INFO:
- Full legal name(s), SSN (last 4 only), date of birth
- Street address, city, state, ZIP code, county
- Marital/filing status, spouse name and SSN
- Dependents (names, DOB, relationship)
- Phone numbers

EMPLOYMENT (Section 2):
- Employer names, addresses, EIN
- Gross monthly pay, net monthly pay, pay frequency
- Self-employment business name, type, gross receipts, expenses
- Multiple employers should each be separate entries

BANK ACCOUNTS (Section 3):
- Bank/institution name, account type (checking/savings/money market)
- Current balance for each account
- Include ALL accounts found across all documents

INVESTMENTS & RETIREMENT (Section 3):
- Brokerage accounts, mutual funds, stocks
- 401(k), IRA, Roth IRA, pension accounts
- Current values and any outstanding loans

REAL PROPERTY (Section 3):
- Property addresses and descriptions
- Fair market values, mortgage/loan balances
- Monthly payments, lender names

VEHICLES (Section 3):
- Year, make, model, mileage
- Fair market value, loan balance
- Monthly payment, lender

MONTHLY INCOME (Section 4):
- Wages/salary (convert annual to monthly by dividing by 12)
- Social Security benefits
- Pension/annuity income
- Self-employment net income
- Rental income, interest, dividends
- Child support, alimony received
- Any other income sources

MONTHLY EXPENSES (Section 5):
- Housing (rent/mortgage + utilities)
- Vehicle payments and operating costs
- Health insurance premiums
- Medical/dental out-of-pocket
- Child care costs
- Court-ordered payments
- Life insurance premiums
- Current tax payments

OTHER INFO (Section 6):
- Bankruptcy history
- Pending lawsuits
- Asset transfers in last 10 years
- Trust or estate interests
- Safe deposit boxes

Return a JSON object with this EXACT structure. Use null for fields you can't find. For repeating groups (employers, bank_accounts, etc.), return arrays. Convert all annual amounts to MONTHLY by dividing by 12.

{
  "taxpayer_name": "string or null",
  "ssn_last4": "string or null",
  "dob": "YYYY-MM-DD or null",
  "address_street": "string or null",
  "address_city": "string or null",
  "address_state": "2-letter code or null",
  "address_zip": "string or null",
  "county": "string or null",
  "marital_status": "single|married|separated|divorced|widowed or null",
  "home_phone": "string or null",
  "cell_phone": "string or null",
  "spouse_name": "string or null",
  "spouse_ssn_last4": "string or null",
  "spouse_dob": "YYYY-MM-DD or null",
  "dependents": [{"dep_name":"string","dep_dob":"YYYY-MM-DD","dep_relationship":"child|parent|other"}],
  "employment_type": "wage_earner|self_employed|both|neither or null",
  "employers": [{"emp_name":"string","emp_address":"string","emp_ein":"string","emp_gross_monthly":0,"emp_net_monthly":0,"emp_pay_frequency":"weekly|biweekly|semimonthly|monthly"}],
  "business_name": "string or null",
  "business_type": "string or null",
  "business_gross_monthly": 0,
  "business_expenses_monthly": 0,
  "bank_accounts": [{"bank_name":"string","bank_account_type":"checking|savings|money_market|cd","bank_balance":0}],
  "investments": [{"inv_institution":"string","inv_type":"brokerage|mutual_fund|stocks|other","inv_balance":0,"inv_loan":0}],
  "real_property": [{"prop_description":"string","prop_address":"string","prop_fmv":0,"prop_loan":0,"prop_monthly_payment":0,"prop_lender":"string"}],
  "vehicles": [{"veh_year":"string","veh_make":"string","veh_model":"string","veh_mileage":"string","veh_fmv":0,"veh_loan":0,"veh_monthly_payment":0,"veh_lender":"string"}],
  "retirement_accounts": [{"ret_institution":"string","ret_type":"401k|ira|roth|pension|other","ret_balance":0,"ret_loan":0}],
  "life_insurance_csv": 0,
  "has_safe_deposit": false,
  "income_wages": 0,
  "income_ss": 0,
  "income_pension": 0,
  "income_self_employment": 0,
  "income_rental": 0,
  "income_interest_dividends": 0,
  "income_distributions": 0,
  "income_child_support_alimony": 0,
  "income_other": 0,
  "expense_food_clothing": 0,
  "expense_housing": 0,
  "expense_vehicle_ownership": 0,
  "expense_vehicle_operating": 0,
  "expense_health_insurance": 0,
  "expense_medical": 0,
  "expense_court_ordered": 0,
  "expense_child_care": 0,
  "expense_life_insurance": 0,
  "expense_taxes": 0,
  "expense_secured_debts": 0,
  "filed_bankruptcy": false,
  "involved_lawsuit": false,
  "transferred_assets": false,
  "total_liability": 0
}

IMPORTANT:
- Extract from ALL documents, not just the first one
- Convert annual income to monthly (divide by 12)
- For W-2 wages, use gross wages / 12 for monthly
- For bank accounts, use the most recent balance
- Include EVERY account, property, and vehicle found
- If a document is a tax return, extract filing status, dependents, and all income
- If a document is an IRS transcript, extract balances, TC codes, and filing info
- Return ONLY the JSON object, no markdown, no backticks, no explanation`

/**
 * AI-powered auto-population that reads every document in the case
 * and uses Claude to extract all form-relevant data.
 */
export async function autoPopulateForm(
  caseId: string,
  _formNumber: string
): Promise<AutoPopulationResult> {
  try {
    const { prisma } = await import("@/lib/db")

    // 1. Fetch ALL documents for this case with their extracted text
    const documents = await prisma.document.findMany({
      where: { caseId },
      select: {
        id: true,
        fileName: true,
        documentCategory: true,
        extractedText: true,
        fileType: true,
      },
      orderBy: { uploadedAt: "desc" },
    })

    if (!documents.length) {
      return { fields: [], highConfidence: 0, needsReview: 0, totalFound: 0, documentsUsed: [] }
    }

    // 2. Also fetch case metadata
    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        clientName: true,
        filingStatus: true,
        tabsNumber: true,
        liabilityPeriods: {
          select: { taxYear: true, totalBalance: true, penalties: true, interest: true },
        },
      },
    })

    // 3. Build a comprehensive document text package for Claude
    const docTexts: string[] = []
    const docsWithText: typeof documents = []

    for (const doc of documents) {
      if (doc.extractedText && doc.extractedText.length > 10) {
        // Limit each doc to 3000 chars to fit in context window
        const truncated = doc.extractedText.length > 3000
          ? doc.extractedText.slice(0, 3000) + "\n[... truncated]"
          : doc.extractedText
        docTexts.push(`=== DOCUMENT: ${doc.fileName} (Category: ${doc.documentCategory}) ===\n${truncated}\n`)
        docsWithText.push(doc)
      }
    }

    if (docTexts.length === 0) {
      // No documents with extracted text — fall back to case data only
      return buildResultFromCaseData(caseData)
    }

    // 4. Add case metadata context
    let caseContext = ""
    if (caseData) {
      try {
        const { decryptField } = await import("@/lib/encryption")
        const name = decryptField(caseData.clientName)
        if (name && !name.includes(":")) caseContext += `Client Name: ${name}\n`
      } catch { /* ignore */ }
      if (caseData.filingStatus) caseContext += `Filing Status: ${caseData.filingStatus}\n`
      if (caseData.liabilityPeriods?.length) {
        const total = caseData.liabilityPeriods.reduce((s: number, lp: any) => s + (Number(lp.totalBalance) || 0), 0)
        caseContext += `Total Liability: $${total.toLocaleString()}\n`
        caseContext += `Tax Years: ${caseData.liabilityPeriods.map((lp: any) => lp.taxYear).join(", ")}\n`
      }
    }

    // 5. Call Claude to extract data from all documents
    const fullPrompt = `${caseContext ? `CASE CONTEXT:\n${caseContext}\n` : ""}DOCUMENTS TO ANALYZE (${docTexts.length} total):\n\n${docTexts.join("\n")}`

    let extractedData: Record<string, any> = {}
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default
      const client = new Anthropic()

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature: 0,
        system: EXTRACTION_PROMPT,
        messages: [{ role: "user", content: fullPrompt }],
      })

      const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
      const clean = text.replace(/```json\n?|```\n?/g, "").trim()
      extractedData = JSON.parse(clean)
    } catch (error) {
      console.error("AI extraction error:", error)
      // Fall back to case data if AI fails
      return buildResultFromCaseData(caseData)
    }

    // 6. Convert extracted data to AutoPopulatedField array
    const allFields: AutoPopulatedField[] = []
    const documentsUsed = new Set<string>()
    docsWithText.forEach(d => documentsUsed.add(d.fileName))

    const sourceInfo = {
      documentId: "ai-extraction",
      documentName: `${docsWithText.length} documents analyzed`,
      documentType: "AI_EXTRACTION",
    }

    // Simple fields
    const simpleFields: [string, string, "high" | "medium"][] = [
      ["taxpayer_name", "taxpayer_name", "high"],
      ["address_street", "address_street", "medium"],
      ["address_city", "address_city", "medium"],
      ["address_state", "address_state", "medium"],
      ["address_zip", "address_zip", "medium"],
      ["county", "county", "medium"],
      ["marital_status", "marital_status", "high"],
      ["home_phone", "home_phone", "medium"],
      ["cell_phone", "cell_phone", "medium"],
      ["spouse_name", "spouse_name", "medium"],
      ["dob", "dob", "medium"],
      ["spouse_dob", "spouse_dob", "medium"],
      ["employment_type", "employment_type", "medium"],
      ["business_name", "business_name", "medium"],
      ["business_type", "business_type", "medium"],
      ["business_gross_monthly", "business_gross_monthly", "medium"],
      ["business_expenses_monthly", "business_expenses_monthly", "medium"],
      ["life_insurance_csv", "life_insurance_csv", "medium"],
      ["has_safe_deposit", "has_safe_deposit", "medium"],
      ["income_wages", "income_wages", "medium"],
      ["income_ss", "income_ss", "medium"],
      ["income_pension", "income_pension", "medium"],
      ["income_self_employment", "income_self_employment", "medium"],
      ["income_rental", "income_rental", "medium"],
      ["income_interest_dividends", "income_interest_dividends", "medium"],
      ["income_distributions", "income_distributions", "medium"],
      ["income_child_support_alimony", "income_child_support_alimony", "medium"],
      ["income_other", "income_other", "medium"],
      ["expense_food_clothing", "expense_food_clothing", "medium"],
      ["expense_housing", "expense_housing", "medium"],
      ["expense_vehicle_ownership", "expense_vehicle_ownership", "medium"],
      ["expense_vehicle_operating", "expense_vehicle_operating", "medium"],
      ["expense_health_insurance", "expense_health_insurance", "medium"],
      ["expense_medical", "expense_medical", "medium"],
      ["expense_court_ordered", "expense_court_ordered", "medium"],
      ["expense_child_care", "expense_child_care", "medium"],
      ["expense_life_insurance", "expense_life_insurance", "medium"],
      ["expense_taxes", "expense_taxes", "medium"],
      ["expense_secured_debts", "expense_secured_debts", "medium"],
      ["filed_bankruptcy", "filed_bankruptcy", "medium"],
      ["involved_lawsuit", "involved_lawsuit", "medium"],
      ["transferred_assets", "transferred_assets", "medium"],
      ["total_liability", "total_liability", "high"],
    ]

    for (const [fieldId, dataKey, confidence] of simpleFields) {
      const value = extractedData[dataKey]
      if (value !== null && value !== undefined && value !== "" && value !== 0) {
        allFields.push({
          fieldId,
          value,
          confidence,
          source: sourceInfo,
          extractedFrom: `AI extracted from ${docsWithText.length} documents`,
        })
      }
    }

    // Repeating groups — bank accounts
    if (Array.isArray(extractedData.bank_accounts) && extractedData.bank_accounts.length > 0) {
      allFields.push({
        fieldId: "bank_accounts",
        value: extractedData.bank_accounts,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.bank_accounts.length} bank account(s) found across documents`,
      })
    }

    // Repeating groups — employers
    if (Array.isArray(extractedData.employers) && extractedData.employers.length > 0) {
      allFields.push({
        fieldId: "employers",
        value: extractedData.employers,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.employers.length} employer(s) found`,
      })
    }

    // Repeating groups — investments
    if (Array.isArray(extractedData.investments) && extractedData.investments.length > 0) {
      allFields.push({
        fieldId: "investments",
        value: extractedData.investments,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.investments.length} investment account(s) found`,
      })
    }

    // Repeating groups — real property
    if (Array.isArray(extractedData.real_property) && extractedData.real_property.length > 0) {
      allFields.push({
        fieldId: "real_property",
        value: extractedData.real_property,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.real_property.length} properties found`,
      })
    }

    // Repeating groups — vehicles
    if (Array.isArray(extractedData.vehicles) && extractedData.vehicles.length > 0) {
      allFields.push({
        fieldId: "vehicles",
        value: extractedData.vehicles,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.vehicles.length} vehicle(s) found`,
      })
    }

    // Repeating groups — retirement
    if (Array.isArray(extractedData.retirement_accounts) && extractedData.retirement_accounts.length > 0) {
      allFields.push({
        fieldId: "retirement_accounts",
        value: extractedData.retirement_accounts,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.retirement_accounts.length} retirement account(s) found`,
      })
    }

    // Repeating groups — dependents
    if (Array.isArray(extractedData.dependents) && extractedData.dependents.length > 0) {
      allFields.push({
        fieldId: "dependents",
        value: extractedData.dependents,
        confidence: "medium",
        source: sourceInfo,
        extractedFrom: `${extractedData.dependents.length} dependent(s) found`,
      })
    }

    const highCount = allFields.filter(f => f.confidence === "high").length
    const reviewCount = allFields.filter(f => f.confidence === "medium" || f.confidence === "low").length

    return {
      fields: allFields,
      highConfidence: highCount,
      needsReview: reviewCount,
      totalFound: allFields.length,
      documentsUsed: Array.from(documentsUsed),
    }
  } catch (error) {
    console.error("Auto-populate error:", error)
    return { fields: [], highConfidence: 0, needsReview: 0, totalFound: 0, documentsUsed: [] }
  }
}

/**
 * Fallback when AI extraction is not available — use case data only
 */
function buildResultFromCaseData(caseData: any): AutoPopulationResult {
  const fields: AutoPopulatedField[] = []
  const source = { documentId: "case-record", documentName: "Case Record", documentType: "CASE" }

  if (caseData) {
    try {
      const { decryptField } = require("@/lib/encryption")
      const name = decryptField(caseData.clientName)
      if (name && !name.includes(":")) {
        fields.push({ fieldId: "taxpayer_name", value: name, confidence: "high", source, extractedFrom: "Case record" })
      }
    } catch { /* ignore */ }

    if (caseData.filingStatus) {
      const map: Record<string, string> = { SINGLE: "single", MFJ: "married", MFS: "married", HOH: "single", QW: "widowed" }
      const mapped = map[caseData.filingStatus]
      if (mapped) fields.push({ fieldId: "marital_status", value: mapped, confidence: "medium", source, extractedFrom: `Filing status: ${caseData.filingStatus}` })
    }

    if (caseData.liabilityPeriods?.length) {
      const total = caseData.liabilityPeriods.reduce((s: number, lp: any) => s + (Number(lp.totalBalance) || 0), 0)
      if (total > 0) fields.push({ fieldId: "total_liability", value: total, confidence: "high", source, extractedFrom: `Sum of ${caseData.liabilityPeriods.length} liability periods` })
    }
  }

  return {
    fields,
    highConfidence: fields.filter(f => f.confidence === "high").length,
    needsReview: fields.filter(f => f.confidence !== "high").length,
    totalFound: fields.length,
    documentsUsed: fields.length > 0 ? ["Case Record"] : [],
  }
}

/**
 * Match a single document's structured data against field mappings.
 * Kept for backward compatibility with direct extraction.
 */
export function matchDocumentToFields(
  documentId: string,
  documentName: string,
  documentType: string,
  extractedData: Record<string, any>
): AutoPopulatedField[] {
  const results: AutoPopulatedField[] = []
  const FIELD_MAPPINGS: Record<string, { formField: string; extractPath: string; confidence: "high" | "medium" }[]> = {
    "W-2": [
      { formField: "employers.emp_name", extractPath: "payer", confidence: "high" },
      { formField: "employers.emp_ein", extractPath: "fields.ein", confidence: "high" },
      { formField: "employers.emp_gross_monthly", extractPath: "fields.wages", confidence: "medium" },
    ],
    "SSA-1099": [{ formField: "income_ss", extractPath: "fields.net_benefits", confidence: "high" }],
    "1099-R": [{ formField: "income_pension", extractPath: "fields.gross_distribution", confidence: "medium" }],
    "1099-INT": [{ formField: "income_interest_dividends", extractPath: "fields.interest", confidence: "high" }],
  }

  const mappings = FIELD_MAPPINGS[documentType]
  if (!mappings) return []

  for (const mapping of mappings) {
    const parts = mapping.extractPath.split(".")
    let current: any = extractedData
    for (const part of parts) {
      if (current == null) break
      current = current[part]
    }
    if (current !== undefined && current !== null && current !== "") {
      const value = typeof current === "number" ? Math.round(current / 12 * 100) / 100 : current
      results.push({
        fieldId: mapping.formField,
        value,
        confidence: mapping.confidence,
        source: { documentId, documentName, documentType },
        extractedFrom: `${documentType} — ${mapping.extractPath}`,
      })
    }
  }

  return results
}
