/**
 * Vendor Auto-Inventory — SOC 2 CC2.2
 *
 * Auto-generates a vendor inventory from known system integrations.
 * This serves as the baseline for vendor risk management and
 * third-party assessments.
 */

export interface VendorInfo {
  name: string
  service: string
  dataShared: string
  integrationType: "API" | "SDK" | "Cloud Infrastructure" | "SaaS"
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  soc2Status: "VERIFIED" | "PENDING" | "NOT_AVAILABLE"
  dpaRequired: boolean
  notes?: string
}

/**
 * Get the list of all system vendors derived from the platform architecture.
 * This is the authoritative source of vendor data.
 */
export function getSystemVendors(): VendorInfo[] {
  return [
    {
      name: "Anthropic",
      service: "AI Language Model API",
      dataShared: "Tokenized case data (PII stripped)",
      integrationType: "API",
      riskLevel: "HIGH",
      soc2Status: "VERIFIED",
      dpaRequired: true,
      notes:
        "Primary AI provider. All client data is tokenized (3-tier PII stripping) before API calls. No raw SSNs, names, or addresses are transmitted.",
    },
    {
      name: "Neon",
      service: "PostgreSQL Database",
      dataShared: "All application data (encrypted at rest)",
      integrationType: "Cloud Infrastructure",
      riskLevel: "CRITICAL",
      soc2Status: "VERIFIED",
      dpaRequired: true,
      notes:
        "Hosts all application data including cases, client records, and audit logs. Client names are additionally encrypted at the application level.",
    },
    {
      name: "Vercel",
      service: "Application Hosting & CDN",
      dataShared: "Application code, environment variables",
      integrationType: "Cloud Infrastructure",
      riskLevel: "HIGH",
      soc2Status: "VERIFIED",
      dpaRequired: true,
      notes:
        "Hosts the Next.js application. Environment variables (API keys, database credentials) are encrypted at rest. Edge network provides DDoS protection.",
    },
    {
      name: "AWS S3",
      service: "Document Storage",
      dataShared: "Uploaded documents, generated files",
      integrationType: "Cloud Infrastructure",
      riskLevel: "HIGH",
      soc2Status: "VERIFIED",
      dpaRequired: true,
      notes:
        "Stores uploaded client documents (IRS notices, bank statements, tax returns). Server-side encryption enabled. No public bucket access.",
    },
    {
      name: "OpenAI",
      service: "Audio Transcription (Whisper)",
      dataShared: "Audio recordings (meeting notes)",
      integrationType: "API",
      riskLevel: "MEDIUM",
      soc2Status: "VERIFIED",
      dpaRequired: true,
      notes:
        "Used for audio transcription only. Audio files may contain spoken PII that cannot be pre-tokenized. Transcribed text is tokenized post-transcription.",
    },
    {
      name: "Sentry",
      service: "Error Monitoring",
      dataShared: "Error logs, stack traces (PII scrubbed)",
      integrationType: "SaaS",
      riskLevel: "LOW",
      soc2Status: "VERIFIED",
      dpaRequired: false,
      notes:
        "Captures application errors for debugging. PII scrubbing is configured to prevent client data from appearing in error reports.",
    },
  ]
}

/**
 * Get vendors that require SOC 2 report verification.
 */
export function getVendorsRequiringSoc2(): VendorInfo[] {
  return getSystemVendors().filter(
    (v) => v.riskLevel === "HIGH" || v.riskLevel === "CRITICAL"
  )
}

/**
 * Get vendors that require a Data Processing Agreement.
 */
export function getVendorsRequiringDPA(): VendorInfo[] {
  return getSystemVendors().filter((v) => v.dpaRequired)
}

/**
 * Get a risk breakdown summary.
 */
export function getVendorRiskSummary() {
  const vendors = getSystemVendors()
  return {
    total: vendors.length,
    critical: vendors.filter((v) => v.riskLevel === "CRITICAL").length,
    high: vendors.filter((v) => v.riskLevel === "HIGH").length,
    medium: vendors.filter((v) => v.riskLevel === "MEDIUM").length,
    low: vendors.filter((v) => v.riskLevel === "LOW").length,
    dpaRequired: vendors.filter((v) => v.dpaRequired).length,
    soc2Verified: vendors.filter((v) => v.soc2Status === "VERIFIED").length,
  }
}
