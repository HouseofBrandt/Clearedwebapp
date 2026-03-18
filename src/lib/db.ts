import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const isNeon = (process.env.DATABASE_URL || "").includes("neon.tech")

  if (isNeon) {
    // Use Neon serverless adapter for cloud deployments
    const { Pool, neonConfig } = require("@neondatabase/serverless")
    const { PrismaNeon } = require("@prisma/adapter-neon")

    if (typeof globalThis.WebSocket === "undefined") {
      const ws = require("ws")
      neonConfig.webSocketConstructor = ws.default || ws
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaNeon(pool)

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    })
  }

  // Standard Prisma client for local PostgreSQL
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
