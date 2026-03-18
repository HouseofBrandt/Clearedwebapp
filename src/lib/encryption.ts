/**
 * Field-level encryption for sensitive data at rest (e.g., client names).
 *
 * Uses AES-256-GCM with a random IV per encryption. The output format is:
 *   iv_hex:authTag_hex:ciphertext_hex
 *
 * This is separate from the tokenizer's encryption (which uses AES-256-CBC
 * for token maps). GCM provides authenticated encryption.
 */
import crypto from "crypto"

const DEV_KEY = "dev-encryption-key-change-in-production-32chars"

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
  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decryptField(encrypted: string): string {
  const key = getKey()
  const [ivHex, authTagHex, ciphertext] = encrypted.split(":")
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted field format")
  }
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(ciphertext, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}
