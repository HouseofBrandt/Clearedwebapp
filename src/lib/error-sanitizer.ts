/**
 * Sanitize error responses to prevent information leakage.
 * In production, returns generic messages. In development, returns full details.
 */

export function sanitizeErrorResponse(error: any): { message: string; code?: string } {
  if (process.env.NODE_ENV !== "production") {
    return { message: error?.message || "Unknown error", code: error?.code }
  }

  // Map known error types to safe messages
  if (error?.code === "P2002") return { message: "A record with this information already exists.", code: "DUPLICATE" }
  if (error?.code === "P2025") return { message: "The requested record was not found.", code: "NOT_FOUND" }
  if (error?.code === "P2003") return { message: "This operation references data that does not exist.", code: "REFERENCE_ERROR" }
  if (error?.message?.includes("Unauthorized")) return { message: "Authentication required.", code: "UNAUTHORIZED" }
  if (error?.message?.includes("Forbidden")) return { message: "You do not have permission for this action.", code: "FORBIDDEN" }

  // Generic fallback — never expose internals
  return { message: "An unexpected error occurred. Please try again or contact support.", code: "INTERNAL_ERROR" }
}

/**
 * Sanitize error data before sending to Sentry.
 * Strips PII from error context.
 */
export function sanitizeForSentry(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data }
  const piiKeys = ["clientName", "ssn", "tin", "ein", "address", "phone", "email", "accountNumber"]
  for (const key of Object.keys(sanitized)) {
    if (piiKeys.some(pk => key.toLowerCase().includes(pk))) {
      sanitized[key] = "[REDACTED]"
    }
  }
  return sanitized
}
