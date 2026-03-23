import { Pool, neonConfig } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"
import ws from "ws"

// Always use the `ws` package for WebSockets, even when native WebSocket exists.
// Node.js 18+ has a native WebSocket whose ErrorEvent.message is read-only,
// which crashes the Neon driver when it tries to set it on connection errors.
neonConfig.webSocketConstructor = ws

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
