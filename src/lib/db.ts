import { Pool, neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"

// In Node.js environments (local dev), use the ws package for WebSockets.
// Must be set BEFORE creating the connection pool.
if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line
  neonConfig.webSocketConstructor = require("ws")
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,  // 10s to establish connection
    idleTimeoutMillis: 0,             // Don't close idle connections (Neon manages this)
    max: 10,                          // Connection pool size
  })
  const adapter = new PrismaNeon(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

/**
 * Keep the database connection warm during long-running operations (e.g. Claude API calls).
 * Returns a cleanup function to stop the keepalive.
 */
export function startDbKeepalive(intervalMs = 30_000): () => void {
  const timer = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch (e: any) {
      console.warn("[DB Keepalive] Ping failed:", e.message)
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
