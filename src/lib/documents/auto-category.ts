/**
 * Auto-detect document category from filename.
 * Used by both server (upload route) and client (upload component).
 */
export function autoDetectCategory(fileName: string): string {
  const n = fileName.toLowerCase()
  if (n.includes("rejection") || n.includes("reject") || n.includes("denial") ||
      n.includes("denied") || n.includes("13711") || n.includes("appeal")) return "IRS_REJECTION"
  if (n.includes("irs") || n.includes("notice") || n.includes("letter") ||
      n.includes("cp") || n.includes("lt11") || n.includes("1058") ||
      n.includes("transcript")) return "IRS_NOTICE"
  if (n.includes("bank") || n.includes("checking") || n.includes("savings") ||
      n.includes("horizon") || n.includes("chase") || n.includes("wells")) return "BANK_STATEMENT"
  if (n.includes("tax_return") || n.includes("1040") || n.includes("1120")) return "TAX_RETURN"
  if (n.includes("paystub") || n.includes("pay_stub") || n.includes("payroll") ||
      n.includes("w-2") || n.includes("w2") || n.includes("earnings")) return "PAY_STUB"
  if (n.includes("mortgage") || n.includes("trustmark")) return "MORTGAGE_STATEMENT"
  if (n.includes("utility") || n.includes("mlgw") || n.includes("electric")) return "UTILITY_BILL"
  if (n.includes("insurance") || n.includes("bcbs") || n.includes("blue_cross") ||
      n.includes("aetna") || n.includes("cigna")) return "INSURANCE"
  if (n.includes("student") || n.includes("mohela") || n.includes("fedloan") ||
      n.includes("navient")) return "STUDENT_LOAN"
  if (n.includes("vehicle") || n.includes("toyota") || n.includes("honda") ||
      n.includes("auto_loan")) return "VEHICLE_LOAN"
  if (n.includes("vanguard") || n.includes("fidelity") || n.includes("ira") ||
      n.includes("401k") || n.includes("retirement") || n.includes("sep")) return "RETIREMENT_ACCOUNT"
  if (n.includes("intake") || n.includes("meeting") || n.includes("notes")) return "MEETING_NOTES"
  // Audio files
  const audioExts = [".mp3", ".mp4", ".m4a", ".wav", ".webm", ".ogg", ".flac"]
  if (audioExts.some(ext => n.endsWith(ext))) {
    if (n.includes("voice") || n.includes("memo") || n.includes("note")) return "VOICE_NOTE"
    return "MEETING_RECORDING"
  }
  return "OTHER"
}
