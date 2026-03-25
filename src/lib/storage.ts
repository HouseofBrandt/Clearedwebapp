import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createAuditLog } from "@/lib/ai/audit"

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
})

const BUCKET = process.env.AWS_S3_BUCKET || ""

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
  return key
}

export async function getFromS3(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  )
  const stream = response.Body
  if (!stream) throw new Error("Empty response from S3")
  const chunks: Uint8Array[] = []
  // @ts-expect-error - Body is a readable stream in Node.js
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  )
}

/**
 * Generate a presigned PUT URL for direct browser-to-S3 uploads.
 * Bypasses the serverless function body size limit entirely.
 * Expires in 30 minutes to limit exposure window.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  maxSizeBytes?: number,
  userId?: string
): Promise<{ url: string; key: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ...(maxSizeBytes ? { ContentLength: maxSizeBytes } : {}),
  })
  const url = await getSignedUrl(s3, command, { expiresIn: 1800 }) // 30 minutes

  // Audit log presigned URL generation
  if (userId) {
    createAuditLog({
      practitionerId: userId,
      action: "PRESIGNED_UPLOAD_URL_GENERATED",
      metadata: { key, contentType, expiresIn: 1800 },
    }).catch((err) => console.error("[Storage] Audit log failed:", err.message))
  }

  return { url, key }
}

/**
 * Generate a presigned GET URL for downloading/reading files from S3.
 * Expires in 15 minutes to limit exposure window.
 */
export async function getPresignedDownloadUrl(key: string, userId?: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  const url = await getSignedUrl(s3, command, { expiresIn: 900 }) // 15 minutes

  // Audit log presigned URL generation
  if (userId) {
    createAuditLog({
      practitionerId: userId,
      action: "PRESIGNED_DOWNLOAD_URL_GENERATED",
      metadata: { key, expiresIn: 900 },
    }).catch((err) => console.error("[Storage] Audit log failed:", err.message))
  }

  return url
}

/**
 * Stream a file from S3 in chunks for processing large files
 * without loading the entire file into memory.
 */
export async function streamFromS3(key: string): Promise<ReadableStream> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  )
  if (!response.Body) throw new Error("Empty response from S3")
  return (response.Body as any).transformToWebStream()
}

export { BUCKET, s3 }
