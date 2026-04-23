import { NextResponse } from "next/server"
import { requireApiAuth, PRACTITIONER_ROLES } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"

/**
 * GET /api/admin/health/pgvector
 *
 * Reports whether the pgvector extension is installed on the Postgres
 * database powering this deployment. Auto-populate V3's semantic search
 * requires pgvector; if the extension isn't installed, V3 silently
 * degrades to V2 quality. This endpoint gives the admin a fast way to
 * know whether that's the case.
 *
 * Returns:
 *   { enabled: boolean, version?: string, message: string }
 *
 * Admin dashboards can poll this (sparingly) and surface a warning when
 * enabled=false.
 */
export async function GET() {
  const auth = await requireApiAuth(PRACTITIONER_ROLES)
  if (!auth.authorized) return auth.response

  try {
    // Cast extname/extversion to text — `extname` is Postgres's `name`
    // type and extversion is `text`, but node-postgres via Prisma's raw
    // query doesn't always round-trip `name` cleanly and throws at decode
    // time. Explicit ::text casts make the query portable.
    const rows = await prisma.$queryRawUnsafe<Array<{ extname: string; extversion: string }>>(
      "SELECT extname::text AS extname, extversion::text AS extversion FROM pg_extension WHERE extname = 'vector'"
    )
    if (Array.isArray(rows) && rows.length > 0) {
      return NextResponse.json({
        enabled: true,
        version: rows[0].extversion,
        message: `pgvector ${rows[0].extversion} installed`,
      })
    }
    return NextResponse.json({
      enabled: false,
      message:
        "pgvector extension not installed. V3 auto-populate will degrade to V2 quality until this is enabled. Run: CREATE EXTENSION IF NOT EXISTS vector;",
    })
  } catch (err: any) {
    return NextResponse.json({
      enabled: false,
      message: `Could not check pgvector: ${err?.message || String(err)}`,
    }, { status: 500 })
  }
}
