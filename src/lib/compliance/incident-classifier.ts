/**
 * Incident Response Classifier
 *
 * Automatically classifies security and compliance incidents based on event patterns.
 * Provides playbook steps for each incident type to guide response teams.
 */

export interface ClassificationRule {
  eventPattern: string | RegExp
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  classification: string
  autoAssign: "admin" | "compliance_lead" | "on_call"
  playbookSteps: string[]
}

export interface PlaybookStep {
  step: number
  description: string
  status: "pending" | "in_progress" | "completed" | "skipped"
  completedAt: string | null
  completedBy: string | null
}

export interface IncidentClassification {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  classification: string
  autoAssign: "admin" | "compliance_lead" | "on_call"
  playbookSteps: string[]
}

export interface AutoCreatedIncident {
  title: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  classification: string
  description: string
  detectedBy: "system" | "manual"
  autoAssign: "admin" | "compliance_lead" | "on_call"
  playbookSteps: PlaybookStep[]
}

export const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    eventPattern: "UNAUTHORIZED_ACCESS",
    severity: "CRITICAL",
    classification: "unauthorized_access",
    autoAssign: "admin",
    playbookSteps: [
      "Verify the access attempt — confirm it was unauthorized",
      "Identify the source (IP, user agent, account)",
      "Block the source if ongoing",
      "Assess what data was accessed or exposed",
      "Determine if client PII was compromised",
      "If PII compromised: escalate to breach notification workflow",
      "Preserve all logs and evidence",
      "Notify affected practitioners",
      "Document findings and timeline",
    ],
  },
  {
    eventPattern: "RATE_LIMIT_HIT",
    severity: "LOW",
    classification: "rate_limit_abuse",
    autoAssign: "on_call",
    playbookSteps: [
      "Review the rate-limited user/IP",
      "Determine if the pattern is malicious or accidental",
      "If malicious: block and escalate",
      "If accidental: adjust limits if appropriate",
      "Document finding",
    ],
  },
  {
    eventPattern: /ENCRYPTION_FAILURE|PII_LEAK/,
    severity: "CRITICAL",
    classification: "data_exposure",
    autoAssign: "admin",
    playbookSteps: [
      "Immediately identify the scope of exposure",
      "Determine what data was exposed and to whom",
      "Rotate encryption keys if compromised",
      "Re-encrypt affected data",
      "Assess if breach notification is required",
      "Preserve all evidence",
      "Document timeline and remediation",
    ],
  },
  {
    eventPattern: "LOGIN_FAILURE",
    severity: "MEDIUM",
    classification: "brute_force_attempt",
    autoAssign: "on_call",
    playbookSteps: [
      "Review failed login attempts for pattern",
      "Determine if account lockout was triggered",
      "Check if the targeted account exists",
      "If pattern indicates brute force: block source IP",
      "Notify account owner",
      "Document finding",
    ],
  },
  {
    eventPattern: "CONFIGURATION_DRIFT",
    severity: "HIGH",
    classification: "configuration_drift",
    autoAssign: "compliance_lead",
    playbookSteps: [
      "Identify which configuration changed",
      "Determine who made the change and when",
      "Assess security impact of the drift",
      "Revert to compliant configuration if necessary",
      "Update change management records",
      "Document finding and corrective action",
    ],
  },
  {
    eventPattern: "ANOMALOUS_EXPORT",
    severity: "HIGH",
    classification: "anomalous_export",
    autoAssign: "admin",
    playbookSteps: [
      "Identify the user and exported data",
      "Review export volume and frequency against baseline",
      "Determine if export was authorized",
      "Check if exported data contains PII",
      "If unauthorized: revoke access and preserve evidence",
      "Notify compliance officer",
      "Document finding and timeline",
    ],
  },
  {
    eventPattern: "PRIVILEGE_ESCALATION",
    severity: "CRITICAL",
    classification: "privilege_escalation",
    autoAssign: "admin",
    playbookSteps: [
      "Identify the account and escalation method",
      "Determine if escalation was authorized",
      "Immediately revoke unauthorized privileges",
      "Audit all actions taken with elevated privileges",
      "Assess data exposure from elevated access",
      "Block the attack vector",
      "Preserve all logs and evidence",
      "Notify security team and affected users",
      "Document findings and remediation",
    ],
  },
  {
    eventPattern: /TOKEN_MAP_ACCESSED|PII_DETOKENIZED/,
    severity: "MEDIUM",
    classification: "pii_access",
    autoAssign: "compliance_lead",
    playbookSteps: [
      "Verify the access was by an authorized practitioner",
      "Confirm the access was for a legitimate case purpose",
      "Review the scope of PII accessed",
      "If unauthorized: escalate to data exposure incident",
      "Document finding",
    ],
  },
  {
    eventPattern: "API_KEY_EXPOSED",
    severity: "CRITICAL",
    classification: "credential_exposure",
    autoAssign: "admin",
    playbookSteps: [
      "Immediately rotate the exposed API key",
      "Identify how the key was exposed",
      "Review usage logs for the compromised key",
      "Assess if any data was accessed with the key",
      "Update key storage practices",
      "Document finding and remediation",
    ],
  },
  {
    eventPattern: "SERVICE_UNAVAILABLE",
    severity: "HIGH",
    classification: "service_disruption",
    autoAssign: "on_call",
    playbookSteps: [
      "Identify the affected service and scope of impact",
      "Determine root cause (infrastructure, DDoS, misconfiguration)",
      "Initiate failover if available",
      "Communicate status to affected users",
      "Restore service",
      "Conduct post-incident review",
      "Document findings and timeline",
    ],
  },
]

/**
 * Classify an incident based on event type and optional metadata.
 * Matches against classification rules in priority order.
 */
export function classifyIncident(
  eventType: string,
  _metadata?: Record<string, any>
): IncidentClassification {
  for (const rule of CLASSIFICATION_RULES) {
    if (typeof rule.eventPattern === "string" && eventType.includes(rule.eventPattern)) {
      return {
        severity: rule.severity,
        classification: rule.classification,
        autoAssign: rule.autoAssign,
        playbookSteps: rule.playbookSteps,
      }
    }
    if (rule.eventPattern instanceof RegExp && rule.eventPattern.test(eventType)) {
      return {
        severity: rule.severity,
        classification: rule.classification,
        autoAssign: rule.autoAssign,
        playbookSteps: rule.playbookSteps,
      }
    }
  }

  // Default classification for unrecognized events
  return {
    severity: "MEDIUM",
    classification: "unclassified",
    autoAssign: "on_call",
    playbookSteps: [
      "Investigate the event",
      "Determine severity",
      "Take appropriate action",
      "Document findings",
    ],
  }
}

/**
 * Auto-create an incident record from a detected event.
 * Returns the data needed to create an IncidentRecord in the database.
 */
export function autoCreateIncident(
  eventType: string,
  description: string,
  metadata?: Record<string, any>
): AutoCreatedIncident {
  const classification = classifyIncident(eventType, metadata)

  return {
    title: `Auto-detected: ${eventType}`,
    severity: classification.severity,
    classification: classification.classification,
    description,
    detectedBy: "system",
    autoAssign: classification.autoAssign,
    playbookSteps: classification.playbookSteps.map((step, i) => ({
      step: i + 1,
      description: step,
      status: "pending" as const,
      completedAt: null,
      completedBy: null,
    })),
  }
}

/**
 * Determine SLA deadline based on incident severity.
 * Returns the number of hours within which the incident must be resolved.
 */
export function getSLAHours(severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"): number {
  switch (severity) {
    case "CRITICAL":
      return 4
    case "HIGH":
      return 24
    case "MEDIUM":
      return 72
    case "LOW":
      return 168 // 7 days
  }
}

/**
 * Calculate SLA deadline from incident creation time and severity.
 */
export function calculateSLADeadline(
  createdAt: Date,
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
): Date {
  const hours = getSLAHours(severity)
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Check whether an incident has breached its SLA.
 */
export function isSLABreached(
  createdAt: Date,
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  resolvedAt?: Date | null
): boolean {
  const deadline = calculateSLADeadline(createdAt, severity)
  const checkTime = resolvedAt || new Date()
  return checkTime > deadline
}
