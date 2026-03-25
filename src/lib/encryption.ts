/**
 * Field-level encryption for sensitive data at rest (e.g., client names).
 *
 * Uses AES-256-GCM with a random IV per encryption. The output format is:
 *   v1:iv_hex:authTag_hex:ciphertext_hex  (new format)
 *   iv_hex:authTag_hex:ciphertext_hex     (legacy format)
 *
 * Key derivation uses SHA-256 hash of ENCRYPTION_KEY for consistency with
 * existing encrypted data. The v1: prefix enables future key rotation.
 */
import crypto from "crypto"

const DEV_KEY = "dev-encryption-key-change-in-production-32chars"

/**
 * Derive the AES-256 key from the ENCRYPTION_KEY environment variable.
 * Uses SHA-256 hash for deterministic, reproducible key derivation.
 */
function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY environment variable is required in production.")
    }
    return crypto.createHash("sha256").update(DEV_KEY).digest()
  }
  return crypto.createHash("sha256").update(key).digest()
}

export function encryptField(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12) // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  // v1: prefix for key versioning support — allows future key rotation
  return `v1:${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decryptField(encrypted: string): string {
  if (!encrypted) return encrypted
  const key = getKey()

  let ivHex: string, authTagHex: string, ciphertext: string

  // Check for version prefix (v1: format from new encryptField)
  if (encrypted.startsWith("v1:")) {
    const parts = encrypted.substring(3).split(":")
    ;[ivHex, authTagHex, ciphertext] = parts
  } else {
    // Legacy format (no version prefix) — backward compatible
    ;[ivHex, authTagHex, ciphertext] = encrypted.split(":")
  }

  if (!ivHex || !authTagHex || !ciphertext) {
    // Not encrypted (legacy plaintext)
    console.warn("[SECURITY] Unencrypted field detected. Run /api/admin/encrypt-existing to migrate.")
    return encrypted
  }
  try {
    const iv = Buffer.from(ivHex, "hex")
    const authTag = Buffer.from(authTagHex, "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(ciphertext, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch {
    // Decryption failed — likely plaintext data, return as-is
    console.warn("[SECURITY] Decryption failed for field. May be plaintext or encrypted with different key.")
    return encrypted
  }
}

/**
 * Encrypt PII fields on a Case object before writing to DB.
 */
export function encryptCasePII(data: any): any {
  const encrypted = { ...data }
  if (data.clientName) encrypted.clientName = encryptField(data.clientName)
  if (data.clientEmail) encrypted.clientEmail = encryptField(data.clientEmail)
  if (data.clientPhone) encrypted.clientPhone = encryptField(data.clientPhone)
  return encrypted
}

/**
 * Decrypt PII fields on a Case object after reading from DB.
 * Safe to call on already-decrypted or plaintext data.
 */
export function decryptCasePII(caseData: any): any {
  if (!caseData) return caseData
  const decrypted = { ...caseData }
  if (caseData.clientName) decrypted.clientName = decryptField(caseData.clientName)
  if (caseData.clientEmail) decrypted.clientEmail = decryptField(caseData.clientEmail)
  if (caseData.clientPhone) decrypted.clientPhone = decryptField(caseData.clientPhone)
  return decrypted
}
