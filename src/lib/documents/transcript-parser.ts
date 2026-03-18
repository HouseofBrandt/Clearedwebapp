/**
 * IRS Transcript Parser
 *
 * Parses IRS Account Transcripts and extracts structured data including
 * transaction codes (TC), assessment dates, and liability periods.
 *
 * Common transaction codes:
 *   TC 150 — Tax return filed (original assessment)
 *   TC 276 — Penalty assessed
 *   TC 196 — Interest assessed
 *   TC 290 — Additional tax assessed
 *   TC 291 — Abatement of prior tax
 *   TC 300 — Additional tax/deficiency assessed by examination
 *   TC 301 — Abatement of additional assessment
 *   TC 420 — Examination started
 *   TC 421 — Examination closed
 *   TC 460 — Extension of time to file
 *   TC 480 — Offer in Compromise pending
 *   TC 481 — Offer in Compromise withdrawn/rejected
 *   TC 520 — IRS Litigation started
 *   TC 530 — Currently Not Collectible
 *   TC 570 — Additional account action pending
 *   TC 571 — Account action resolved
 *   TC 582 — Lien filed
 *   TC 610 — Payment with return
 *   TC 640 — Estimated tax payment
 *   TC 670 — Subsequent payment
 *   TC 700 — Credit to another account
 *   TC 706 — Refund applied from another year
 *   TC 766 — Credit to account (refundable credit)
 *   TC 768 — Earned Income Credit
 *   TC 806 — W-2 withholding
 *   TC 846 — Refund issued
 *   TC 898 — Refund offset
 *   TC 971 — Notice issued
 *   TC 977 — Amended return filed
 */

export interface TransactionCode {
  code: number
  date: string | null      // MM-DD-YYYY or YYYY-MM-DD
  amount: number | null    // Dollar amount (positive = assessment, negative = credit)
  description: string
  cycle: string | null     // Processing cycle (e.g., 20241505)
}

export interface TranscriptPeriod {
  taxYear: number
  formType: string              // "1040", "941", "940", etc.
  filingDate: string | null
  transactions: TransactionCode[]
  // Computed from transactions
  originalAssessment: number | null
  penalties: number | null
  interest: number | null
  totalBalance: number | null
  assessmentDate: string | null
  csedDate: string | null       // Collection Statute Expiration Date (10 years from assessment)
  status: string                // "assessed", "filed", "cnc", "lien", etc.
}

export interface TranscriptParseResult {
  periods: TranscriptPeriod[]
  rawTransactions: TransactionCode[]
  taxpayerInfo: {
    name: string | null
    ssn: string | null
    ein: string | null
    address: string | null
  }
  errors: string[]
}

// Maps TC codes to human-readable descriptions
const TC_DESCRIPTIONS: Record<number, string> = {
  150: "Tax return filed",
  160: "Manually assessed penalty",
  166: "Manually assessed penalty removed",
  170: "Penalty for failure to file",
  171: "Penalty abated (failure to file)",
  176: "Penalty for failure to pay",
  177: "Penalty abated (failure to pay)",
  196: "Interest assessed",
  197: "Interest abated",
  276: "Penalty assessed",
  277: "Penalty abated",
  286: "Penalty for bad check",
  290: "Additional tax assessed",
  291: "Abatement of prior tax",
  298: "Additional tax assessed (math error)",
  299: "Math error abatement",
  300: "Additional tax by examination",
  301: "Abatement of examination assessment",
  310: "Manual assessment of fraud penalty",
  320: "Fraud penalty assessed",
  340: "Penalty for negligence/substantial understatement",
  341: "Negligence penalty abated",
  350: "TFRP assessed (Trust Fund Recovery Penalty)",
  360: "Estimated tax penalty",
  420: "Examination started",
  421: "Examination closed",
  460: "Extension of time to file",
  480: "Offer in Compromise pending",
  481: "OIC withdrawn/rejected",
  482: "OIC accepted",
  520: "Litigation pending",
  521: "Litigation closed",
  530: "Currently Not Collectible",
  531: "CNC removed",
  570: "Additional account action pending",
  571: "Account action resolved",
  582: "Federal tax lien filed",
  583: "Lien released",
  610: "Payment with return",
  640: "Estimated tax payment",
  670: "Subsequent payment",
  694: "Designation of payment",
  700: "Credit to another account",
  706: "Refund applied from another year",
  716: "Credit transferred to another account",
  766: "Refundable credit",
  767: "Reduced or removed refundable credit",
  768: "Earned Income Credit",
  806: "W-2/1099 withholding",
  826: "Credit transferred (excess collection)",
  846: "Refund issued",
  898: "Refund offset",
  971: "Notice issued",
  977: "Amended return filed",
}

/**
 * Parse IRS transcript text and extract structured transaction data.
 */
export function parseTranscript(text: string): TranscriptParseResult {
  const errors: string[] = []
  const rawTransactions: TransactionCode[] = []

  // Extract taxpayer info
  const taxpayerInfo = extractTaxpayerInfo(text)

  // Detect form type and tax period
  const formMatch = text.match(/(?:Form|FORM)\s+(1040[A-Z]*|941|940|1065|1120[A-Z]*|990)/i)
  const formType = formMatch ? formMatch[1].toUpperCase() : "1040"

  const yearMatch = text.match(/(?:Tax\s*Period|TAX PERIOD|Period)[\s:]*(?:Dec(?:ember)?\.?\s*)?(\d{4})/i)
  let taxYear = yearMatch ? parseInt(yearMatch[1]) : 0

  // Some transcripts show tax period as YYYYMM
  if (!taxYear) {
    const periodMatch = text.match(/(?:Tax\s*Period|TAX PERIOD)[\s:]*(\d{4})(\d{2})/i)
    if (periodMatch) taxYear = parseInt(periodMatch[1])
  }

  if (!taxYear) {
    // Try to find a year from TC 150 line
    const tc150Match = text.match(/(?:150|Return Filed).*?(\d{2}[-\/]\d{2}[-\/](\d{4}))/i)
    if (tc150Match) taxYear = parseInt(tc150Match[2])
  }

  // Parse transaction lines
  // IRS transcripts typically show: TC CODE  DATE  AMOUNT  CYCLE
  // The format varies but common patterns:
  //   150  04-15-2023  $0.00  20231505
  //   670  06-15-2024  -$5,000.00
  const lines = text.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Pattern 1: TC code followed by date and amount
    // Matches: "150   04-15-2023   $12,345.67"
    // Also: "TC 150  04-15-2023  12345.67"
    const tcMatch = trimmed.match(
      /(?:TC\s*)?(\d{3})\s+(\d{2}[-\/]\d{2}[-\/]\d{4})\s+[\$]?([-]?\$?[\d,]+\.?\d*)/i
    )
    if (tcMatch) {
      const code = parseInt(tcMatch[1])
      const date = tcMatch[2]
      const amountStr = tcMatch[3].replace(/[$,]/g, "")
      const amount = parseFloat(amountStr) || 0

      rawTransactions.push({
        code,
        date,
        amount,
        description: TC_DESCRIPTIONS[code] || `Transaction Code ${code}`,
        cycle: extractCycle(trimmed),
      })
      continue
    }

    // Pattern 2: Description-based (some transcripts show description first)
    // "Return Filed & Tax Assessed   04-15-2023   $12,345.00"
    const descMatch = trimmed.match(
      /^(.+?)\s+(\d{2}[-\/]\d{2}[-\/]\d{4})\s+[\$]?([-]?\$?[\d,]+\.?\d*)/
    )
    if (descMatch) {
      const desc = descMatch[1].trim()
      const code = descriptionToTC(desc)
      if (code) {
        rawTransactions.push({
          code,
          date: descMatch[2],
          amount: parseFloat(descMatch[3].replace(/[$,]/g, "")) || 0,
          description: desc,
          cycle: extractCycle(trimmed),
        })
      }
    }
  }

  if (rawTransactions.length === 0) {
    errors.push("No transaction codes found in transcript text")
  }

  // Build period from transactions
  const period = buildPeriod(taxYear, formType, rawTransactions)

  return {
    periods: taxYear > 0 ? [period] : [],
    rawTransactions,
    taxpayerInfo,
    errors,
  }
}

/**
 * Parse a multi-period transcript (e.g., a Record of Account covering multiple years).
 */
export function parseMultiPeriodTranscript(text: string): TranscriptParseResult {
  // Split by tax period headers
  const periodSections = text.split(/(?=(?:Tax\s*Period|TAX PERIOD)[\s:]+)/i)
  const allPeriods: TranscriptPeriod[] = []
  const allTransactions: TransactionCode[] = []
  const errors: string[] = []
  const taxpayerInfo = extractTaxpayerInfo(text)

  for (const section of periodSections) {
    if (section.trim().length < 20) continue
    const result = parseTranscript(section)
    allPeriods.push(...result.periods)
    allTransactions.push(...result.rawTransactions)
    errors.push(...result.errors)
  }

  if (allPeriods.length === 0 && allTransactions.length > 0) {
    // Fallback: couldn't split by period but found transactions
    const fallback = buildPeriod(0, "1040", allTransactions)
    allPeriods.push(fallback)
  }

  return {
    periods: allPeriods,
    rawTransactions: allTransactions,
    taxpayerInfo,
    errors,
  }
}

function extractTaxpayerInfo(text: string) {
  const nameMatch = text.match(/(?:Taxpayer\s*Name|NAME)[\s:]+([^\n]+)/i)
  const ssnMatch = text.match(/(?:SSN|TIN|Social\s*Security)[\s:]+(\d{3}[-]?\d{2}[-]?\d{4})/i)
  const einMatch = text.match(/(?:EIN|Employer\s*ID)[\s:]+(\d{2}[-]?\d{7})/i)
  const addrMatch = text.match(/(?:Address|ADDR)[\s:]+([^\n]+)/i)

  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    ssn: ssnMatch ? ssnMatch[1] : null,
    ein: einMatch ? einMatch[1] : null,
    address: addrMatch ? addrMatch[1].trim() : null,
  }
}

function extractCycle(line: string): string | null {
  const cycleMatch = line.match(/(\d{8,10})$/)
  return cycleMatch ? cycleMatch[1] : null
}

function descriptionToTC(desc: string): number | null {
  const lower = desc.toLowerCase()
  if (lower.includes("return filed") || lower.includes("tax assessed")) return 150
  if (lower.includes("penalty") && lower.includes("abat")) return 277
  if (lower.includes("penalty") && lower.includes("failure to file")) return 170
  if (lower.includes("penalty") && lower.includes("failure to pay")) return 176
  if (lower.includes("penalty")) return 276
  if (lower.includes("interest") && lower.includes("abat")) return 197
  if (lower.includes("interest")) return 196
  if (lower.includes("payment with return")) return 610
  if (lower.includes("estimated tax payment")) return 640
  if (lower.includes("payment") || lower.includes("subsequent")) return 670
  if (lower.includes("withholding")) return 806
  if (lower.includes("refund issued")) return 846
  if (lower.includes("refund offset")) return 898
  if (lower.includes("earned income credit")) return 768
  if (lower.includes("notice issued")) return 971
  if (lower.includes("amended return")) return 977
  if (lower.includes("examination") && lower.includes("start")) return 420
  if (lower.includes("examination") && lower.includes("clos")) return 421
  if (lower.includes("offer in compromise") && (lower.includes("pending") || lower.includes("submit"))) return 480
  if (lower.includes("offer") && lower.includes("accept")) return 482
  if (lower.includes("offer") && (lower.includes("reject") || lower.includes("withdrawn"))) return 481
  if (lower.includes("currently not collectible") || lower.includes("cnc")) return 530
  if (lower.includes("lien") && lower.includes("release")) return 583
  if (lower.includes("lien")) return 582
  if (lower.includes("additional") && lower.includes("tax") && lower.includes("exam")) return 300
  if (lower.includes("additional") && lower.includes("tax")) return 290
  if (lower.includes("abatement")) return 291
  return null
}

function buildPeriod(
  taxYear: number,
  formType: string,
  transactions: TransactionCode[]
): TranscriptPeriod {
  let originalAssessment = 0
  let penalties = 0
  let interest = 0
  let totalCredits = 0
  let assessmentDate: string | null = null
  let filingDate: string | null = null
  let status = "assessed"

  for (const tc of transactions) {
    const amt = tc.amount || 0

    switch (tc.code) {
      case 150: // Return filed
        originalAssessment += amt
        filingDate = tc.date
        if (!assessmentDate) assessmentDate = tc.date
        break

      // Penalties (assessed)
      case 160: case 170: case 176: case 276: case 286: case 310:
      case 320: case 340: case 350: case 360:
        penalties += Math.abs(amt)
        break

      // Penalties (abated)
      case 166: case 171: case 177: case 277: case 299: case 301: case 341:
        penalties -= Math.abs(amt)
        break

      // Interest
      case 196:
        interest += Math.abs(amt)
        break
      case 197:
        interest -= Math.abs(amt)
        break

      // Additional assessments
      case 290: case 298: case 300:
        originalAssessment += amt
        break

      // Abatements
      case 291:
        originalAssessment -= Math.abs(amt)
        break

      // Payments and credits
      case 610: case 640: case 670: case 700: case 706: case 716:
      case 766: case 768: case 806: case 826:
        totalCredits += Math.abs(amt)
        break

      // Status-changing codes
      case 530:
        status = "cnc"
        break
      case 531:
        status = "assessed"
        break
      case 480:
        status = "oic-pending"
        break
      case 482:
        status = "oic-accepted"
        break
      case 481:
        status = "assessed"
        break
      case 582:
        status = "lien"
        break
      case 420:
        status = "under-exam"
        break
      case 421:
        if (status === "under-exam") status = "assessed"
        break
    }
  }

  // CSED: 10 years from assessment date
  let csedDate: string | null = null
  if (assessmentDate) {
    const parts = assessmentDate.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/)
    if (parts) {
      const csed = new Date(parseInt(parts[3]) + 10, parseInt(parts[1]) - 1, parseInt(parts[2]))
      csedDate = `${String(csed.getMonth() + 1).padStart(2, "0")}-${String(csed.getDate()).padStart(2, "0")}-${csed.getFullYear()}`
    }
  }

  const totalBalance = originalAssessment + penalties + interest - totalCredits

  return {
    taxYear,
    formType,
    filingDate,
    transactions,
    originalAssessment: originalAssessment || null,
    penalties: penalties > 0 ? penalties : null,
    interest: interest > 0 ? interest : null,
    totalBalance: totalBalance !== 0 ? totalBalance : null,
    assessmentDate,
    csedDate,
    status,
  }
}
