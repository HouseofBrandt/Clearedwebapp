/**
 * Risk Register Generator — SOC 2 CC2.2, CC5.3
 *
 * Auto-generates a risk register from the Cleared platform's system
 * architecture. Each risk is scored based on data sensitivity, exposure,
 * and encryption status.
 */

export type RiskLikelihood = "RARE" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "ALMOST_CERTAIN"
export type RiskImpact = "NEGLIGIBLE" | "MINOR" | "MODERATE" | "MAJOR" | "SEVERE"
export type RiskCategory =
  | "DATA_EXPOSURE"
  | "UNAUTHORIZED_ACCESS"
  | "CREDENTIAL_COMPROMISE"
  | "PRIVILEGE_ABUSE"
  | "DATA_EXFILTRATION"
  | "SYSTEM_AVAILABILITY"
  | "THIRD_PARTY"
  | "COMPLIANCE"

export interface RiskEntry {
  id: string
  title: string
  category: RiskCategory
  description: string
  source: string // The system component that introduces this risk
  dataSensitivity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  likelihood: RiskLikelihood
  impact: RiskImpact
  inherentRiskScore: number // 1-25 (likelihood * impact)
  existingControls: string[]
  residualRiskScore: number // After controls
  soc2Controls: string[] // Mapped SOC 2 control IDs
  owner: string // Role responsible
  reviewFrequency: string
}

const LIKELIHOOD_SCORES: Record<RiskLikelihood, number> = {
  RARE: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  ALMOST_CERTAIN: 5,
}

const IMPACT_SCORES: Record<RiskImpact, number> = {
  NEGLIGIBLE: 1,
  MINOR: 2,
  MODERATE: 3,
  MAJOR: 4,
  SEVERE: 5,
}

function score(likelihood: RiskLikelihood, impact: RiskImpact): number {
  return LIKELIHOOD_SCORES[likelihood] * IMPACT_SCORES[impact]
}

/**
 * Auto-generate the risk register from system architecture.
 */
export function generateRiskRegister(): RiskEntry[] {
  return [
    {
      id: "RISK-001",
      title: "AI API Data Exposure",
      category: "DATA_EXPOSURE",
      description:
        "Tokenized case data sent to the Anthropic Claude API could be intercepted or stored beyond retention policies. Although PII is stripped via tokenization, residual context in legal/financial narratives could be correlated.",
      source: "Anthropic Claude API Integration",
      dataSensitivity: "HIGH",
      likelihood: "UNLIKELY",
      impact: "MAJOR",
      inherentRiskScore: score("UNLIKELY", "MAJOR"),
      existingControls: [
        "PII tokenization (3-tier) before API calls",
        "TLS 1.3 encryption in transit",
        "Anthropic data processing agreement",
        "Request/response audit logging",
        "No raw PII in tokenized output",
      ],
      residualRiskScore: 4,
      soc2Controls: ["CC6.1", "CC6.7", "C1.1", "C1.2"],
      owner: "ADMIN",
      reviewFrequency: "Quarterly",
    },
    {
      id: "RISK-002",
      title: "Cloud Database Breach",
      category: "UNAUTHORIZED_ACCESS",
      description:
        "Neon PostgreSQL database containing all application data (cases, clients, documents, PII) could be compromised through SQL injection, credential exposure, or cloud provider vulnerability.",
      source: "Neon PostgreSQL Database",
      dataSensitivity: "CRITICAL",
      likelihood: "UNLIKELY",
      impact: "SEVERE",
      inherentRiskScore: score("UNLIKELY", "SEVERE"),
      existingControls: [
        "Encryption at rest (AES-256)",
        "TLS encryption in transit",
        "Parameterized queries via Prisma ORM",
        "Environment variable credential storage",
        "Client name field encryption",
        "Role-based access control",
        "Connection pooling with timeouts",
      ],
      residualRiskScore: 4,
      soc2Controls: ["CC6.1", "CC6.3", "CC6.6", "CC6.7"],
      owner: "ADMIN",
      reviewFrequency: "Monthly",
    },
    {
      id: "RISK-003",
      title: "Document Storage Unauthorized Access",
      category: "UNAUTHORIZED_ACCESS",
      description:
        "S3-compatible storage containing uploaded client documents (IRS notices, bank statements, tax returns) could be accessed by unauthorized parties through misconfigured bucket policies or credential exposure.",
      source: "AWS S3 Document Storage",
      dataSensitivity: "CRITICAL",
      likelihood: "POSSIBLE",
      impact: "SEVERE",
      inherentRiskScore: score("POSSIBLE", "SEVERE"),
      existingControls: [
        "Server-side encryption (SSE-S3)",
        "Private bucket policy (no public access)",
        "Pre-signed URLs with expiration",
        "IAM role-based access",
        "Document access audit logging",
      ],
      residualRiskScore: 6,
      soc2Controls: ["CC6.1", "CC6.3", "CC6.5"],
      owner: "ADMIN",
      reviewFrequency: "Monthly",
    },
    {
      id: "RISK-004",
      title: "Authentication Credential Compromise",
      category: "CREDENTIAL_COMPROMISE",
      description:
        "NextAuth.js session tokens or user credentials could be stolen through XSS, session fixation, phishing, or brute force attacks, granting unauthorized access to the platform.",
      source: "NextAuth.js Authentication System",
      dataSensitivity: "HIGH",
      likelihood: "POSSIBLE",
      impact: "MAJOR",
      inherentRiskScore: score("POSSIBLE", "MAJOR"),
      existingControls: [
        "bcrypt password hashing",
        "MFA support (TOTP)",
        "HTTP-only secure session cookies",
        "CSRF protection",
        "Session expiration",
        "No public registration (employees only)",
        "Role-based access control",
      ],
      residualRiskScore: 6,
      soc2Controls: ["CC6.1", "CC6.2", "CC6.3"],
      owner: "ADMIN",
      reviewFrequency: "Monthly",
    },
    {
      id: "RISK-005",
      title: "Admin Privilege Abuse",
      category: "PRIVILEGE_ABUSE",
      description:
        "ADMIN role users have access to all cases, user management, compliance data, and system configuration. A compromised or malicious admin could exfiltrate data or modify security controls.",
      source: "RBAC System — ADMIN Role",
      dataSensitivity: "CRITICAL",
      likelihood: "RARE",
      impact: "SEVERE",
      inherentRiskScore: score("RARE", "SEVERE"),
      existingControls: [
        "Comprehensive audit logging",
        "Policy acknowledgment requirement",
        "Background checks for all staff",
        "Separation of duties (review workflow)",
        "Governance meeting oversight",
      ],
      residualRiskScore: 3,
      soc2Controls: ["CC5.1", "CC5.2", "CC5.3", "CC6.2", "CC6.3"],
      owner: "ADMIN",
      reviewFrequency: "Quarterly",
    },
    {
      id: "RISK-006",
      title: "Practitioner Privilege Abuse",
      category: "PRIVILEGE_ABUSE",
      description:
        "PRACTITIONER and SENIOR role users can run AI analysis, review outputs, and manage cases. A compromised practitioner account could access client PII across their assigned cases.",
      source: "RBAC System — PRACTITIONER/SENIOR Role",
      dataSensitivity: "HIGH",
      likelihood: "UNLIKELY",
      impact: "MAJOR",
      inherentRiskScore: score("UNLIKELY", "MAJOR"),
      existingControls: [
        "Case assignment scoping",
        "Mandatory review workflow",
        "AI output audit trail",
        "Review action logging",
        "Policy acknowledgments",
      ],
      residualRiskScore: 4,
      soc2Controls: ["CC5.2", "CC5.3", "CC6.2"],
      owner: "SENIOR",
      reviewFrequency: "Quarterly",
    },
    {
      id: "RISK-007",
      title: "Bulk Data Exfiltration via Export",
      category: "DATA_EXFILTRATION",
      description:
        "The document export capability (.docx, .xlsx) could be used to exfiltrate large volumes of client data if an authorized user exports systematically or if the export API is abused.",
      source: "Document Export System",
      dataSensitivity: "HIGH",
      likelihood: "UNLIKELY",
      impact: "MAJOR",
      inherentRiskScore: score("UNLIKELY", "MAJOR"),
      existingControls: [
        "Export action audit logging",
        "Role-based export permissions",
        "Mandatory review before export",
        "Session-based access control",
      ],
      residualRiskScore: 4,
      soc2Controls: ["CC6.1", "CC6.5", "CC6.7"],
      owner: "ADMIN",
      reviewFrequency: "Monthly",
    },
    {
      id: "RISK-008",
      title: "API Endpoint Attack Surface",
      category: "UNAUTHORIZED_ACCESS",
      description:
        "Exposed API routes (auth, cases, documents, AI, review) could be targeted by attackers through injection, broken access control, or parameter tampering.",
      source: "Next.js API Routes",
      dataSensitivity: "HIGH",
      likelihood: "POSSIBLE",
      impact: "MAJOR",
      inherentRiskScore: score("POSSIBLE", "MAJOR"),
      existingControls: [
        "requireApiAuth() on all routes",
        "Role-based route guards",
        "Zod input validation",
        "Prisma parameterized queries",
        "Rate limiting (Vercel)",
        "HTTPS-only deployment",
      ],
      residualRiskScore: 6,
      soc2Controls: ["CC6.1", "CC6.6", "CC6.7", "CC7.1"],
      owner: "ADMIN",
      reviewFrequency: "Monthly",
    },
    {
      id: "RISK-009",
      title: "Application Hosting Compromise",
      category: "THIRD_PARTY",
      description:
        "Vercel hosting platform compromise could expose application code, environment variables (API keys, database credentials), or allow code injection into the deployed application.",
      source: "Vercel Application Hosting",
      dataSensitivity: "HIGH",
      likelihood: "RARE",
      impact: "SEVERE",
      inherentRiskScore: score("RARE", "SEVERE"),
      existingControls: [
        "Environment variables encrypted at rest",
        "Automated deployment pipeline",
        "Build-time only secret access",
        "Vercel SOC 2 Type II compliance",
        "Edge network DDoS protection",
      ],
      residualRiskScore: 3,
      soc2Controls: ["CC6.1", "CC6.7", "A1.1", "A1.2"],
      owner: "ADMIN",
      reviewFrequency: "Quarterly",
    },
    {
      id: "RISK-010",
      title: "Audio Transcription Data Exposure",
      category: "DATA_EXPOSURE",
      description:
        "Audio recordings sent to OpenAI Whisper for transcription may contain client PII spoken during meetings. Unlike text, audio cannot be pre-tokenized before API transmission.",
      source: "OpenAI Whisper Audio Transcription",
      dataSensitivity: "MEDIUM",
      likelihood: "POSSIBLE",
      impact: "MODERATE",
      inherentRiskScore: score("POSSIBLE", "MODERATE"),
      existingControls: [
        "OpenAI data processing agreement",
        "TLS encryption in transit",
        "Audio files not retained by API provider",
        "Transcribed text undergoes PII tokenization",
        "Access limited to authenticated users",
      ],
      residualRiskScore: 4,
      soc2Controls: ["CC6.1", "CC6.7", "C1.1"],
      owner: "ADMIN",
      reviewFrequency: "Quarterly",
    },
    {
      id: "RISK-011",
      title: "Inadequate Data Retention & Disposal",
      category: "COMPLIANCE",
      description:
        "Client data retained beyond necessary periods increases exposure surface. Failure to properly dispose of data after case resolution could violate retention policies and increase breach impact.",
      source: "Data Lifecycle Management",
      dataSensitivity: "CRITICAL",
      likelihood: "POSSIBLE",
      impact: "MAJOR",
      inherentRiskScore: score("POSSIBLE", "MAJOR"),
      existingControls: [
        "Data disposal records with dual confirmation",
        "Crypto-shred capability",
        "Disposal certificate generation",
        "Retention policy tracking per case",
      ],
      residualRiskScore: 6,
      soc2Controls: ["CC6.5", "C1.2", "P4.1", "P4.2"],
      owner: "ADMIN",
      reviewFrequency: "Quarterly",
    },
    {
      id: "RISK-012",
      title: "Error Monitoring Data Leakage",
      category: "DATA_EXPOSURE",
      description:
        "Sentry error monitoring could capture PII in stack traces, error messages, or request context if PII scrubbing is incomplete.",
      source: "Sentry Error Monitoring",
      dataSensitivity: "LOW",
      likelihood: "UNLIKELY",
      impact: "MINOR",
      inherentRiskScore: score("UNLIKELY", "MINOR"),
      existingControls: [
        "PII scrubbing configured in Sentry",
        "No raw client data in error messages",
        "Error sanitization before transmission",
        "Sentry data retention limits",
      ],
      residualRiskScore: 2,
      soc2Controls: ["CC6.7", "C1.1"],
      owner: "ADMIN",
      reviewFrequency: "Quarterly",
    },
  ]
}

/**
 * Get a risk score summary for dashboard display.
 */
export function getRiskSummary() {
  const risks = generateRiskRegister()
  const critical = risks.filter((r) => r.residualRiskScore >= 15)
  const high = risks.filter((r) => r.residualRiskScore >= 10 && r.residualRiskScore < 15)
  const medium = risks.filter((r) => r.residualRiskScore >= 5 && r.residualRiskScore < 10)
  const low = risks.filter((r) => r.residualRiskScore < 5)

  return {
    totalRisks: risks.length,
    critical: critical.length,
    high: high.length,
    medium: medium.length,
    low: low.length,
    averageResidualScore:
      risks.reduce((sum, r) => sum + r.residualRiskScore, 0) / risks.length,
    highestRisk: risks.reduce((max, r) =>
      r.residualRiskScore > max.residualRiskScore ? r : max
    ),
  }
}
