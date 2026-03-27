import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { syncFeedbackToTasks, getFeedbackSummary } from "@/lib/dev/feedback-sync"

export async function POST(request: Request) {
  // Auth: ADMIN role OR x-feedback-sync-secret header
  const secret = request.headers.get("x-feedback-sync-secret")
  const validSecret = process.env.FEEDBACK_SYNC_SECRET

  if (secret && validSecret && secret === validSecret) {
    // Authenticated via secret — OK for cron/script
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get("dryRun") === "true"
  const maxItems = parseInt(url.searchParams.get("maxItems") || "10")

  const result = await syncFeedbackToTasks({ dryRun, maxItems })
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const summary = await getFeedbackSummary()
  return NextResponse.json(summary)
}
