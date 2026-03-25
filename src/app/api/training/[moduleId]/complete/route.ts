import { NextRequest, NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/auth/api-guard"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/ai/audit"
import { TRAINING_MODULES } from "@/lib/compliance/training-content"

/**
 * POST /api/training/[moduleId]/complete
 *
 * Submit quiz answers for a training module and record the result.
 * Body: { answers: number[] }
 *
 * Validates answers against correct answers, computes score, records pass/fail.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const auth = await requireApiAuth()
  if (!auth.authorized) return auth.response

  try {
    const { moduleId } = await params
    const body = await request.json()
    const { answers } = body

    // Find the training module
    const mod = TRAINING_MODULES.find((m) => m.id === moduleId)
    if (!mod) {
      return NextResponse.json(
        { error: `Training module '${moduleId}' not found` },
        { status: 404 }
      )
    }

    // Validate answers array
    if (!Array.isArray(answers) || answers.length !== mod.quiz.length) {
      return NextResponse.json(
        {
          error: `Expected ${mod.quiz.length} answers, received ${
            Array.isArray(answers) ? answers.length : 0
          }`,
        },
        { status: 400 }
      )
    }

    // Validate each answer is a valid index
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i]
      if (typeof answer !== "number" || answer < 0 || answer >= mod.quiz[i].options.length) {
        return NextResponse.json(
          { error: `Invalid answer at index ${i}: must be 0-${mod.quiz[i].options.length - 1}` },
          { status: 400 }
        )
      }
    }

    // Score the quiz
    let correct = 0
    const results = mod.quiz.map((q, i) => {
      const isCorrect = answers[i] === q.correctIndex
      if (isCorrect) correct++
      return {
        question: q.question,
        selectedIndex: answers[i],
        correctIndex: q.correctIndex,
        isCorrect,
      }
    })

    const score = Math.round((correct / mod.quiz.length) * 100)
    const passed = score >= mod.passingScore

    // Record the completion (upsert to allow retakes)
    await prisma.securityTraining.upsert({
      where: {
        userId_moduleId_version: {
          userId: auth.userId,
          moduleId: mod.id,
          version: mod.version,
        },
      },
      update: {
        score,
        passed,
        completedAt: new Date(),
        moduleName: mod.title,
      },
      create: {
        userId: auth.userId,
        moduleId: mod.id,
        moduleName: mod.title,
        version: mod.version,
        score,
        passed,
        completedAt: new Date(),
      },
    })

    // Audit log
    logAudit({
      userId: auth.userId,
      action: "TRAINING_COMPLETED",
      metadata: {
        moduleId: mod.id,
        moduleName: mod.title,
        version: mod.version,
        score,
        passed,
        correct,
        total: mod.quiz.length,
      },
    })

    return NextResponse.json({
      moduleId: mod.id,
      score,
      passed,
      passingScore: mod.passingScore,
      correct,
      total: mod.quiz.length,
      results,
    })
  } catch (error: any) {
    console.error("[training] Error completing module:", error)
    return NextResponse.json(
      { error: "Failed to record training completion", details: error.message },
      { status: 500 }
    )
  }
}
