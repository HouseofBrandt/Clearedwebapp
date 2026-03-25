import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { TRAINING_MODULES } from "@/lib/compliance/training-content"

/**
 * GET /api/training
 *
 * Returns training status for the current user: which modules are completed,
 * which are pending, scores, and whether all required training is done.
 */
export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    // Fetch all training completions for this user
    const completions = await prisma.securityTraining.findMany({
      where: { userId: auth.userId },
      orderBy: { completedAt: "desc" },
    })

    // Build status for each module
    const modules = TRAINING_MODULES.map((mod) => {
      // Find the latest completion for this module at the current version
      const completion = completions.find(
        (c) => c.moduleId === mod.id && c.version === mod.version
      )

      return {
        id: mod.id,
        title: mod.title,
        description: mod.description,
        version: mod.version,
        passingScore: mod.passingScore,
        totalQuestions: mod.quiz.length,
        status: completion
          ? completion.passed
            ? ("passed" as const)
            : ("failed" as const)
          : ("pending" as const),
        score: completion?.score ?? null,
        completedAt: completion?.completedAt ?? null,
      }
    })

    const allPassed = modules.every((m) => m.status === "passed")
    const pendingCount = modules.filter((m) => m.status !== "passed").length

    return NextResponse.json({
      modules,
      allPassed,
      pendingCount,
    })
  } catch (error: any) {
    console.error("[training] Error fetching status:", error)
    return NextResponse.json(
      { error: "Failed to fetch training status", details: error.message },
      { status: 500 }
    )
  }
}
