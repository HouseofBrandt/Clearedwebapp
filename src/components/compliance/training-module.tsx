"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  ClipboardCheck,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"
import type { TrainingModule } from "@/lib/compliance/training-content"

interface TrainingModuleViewProps {
  module: TrainingModule
  onComplete?: () => void
}

type Phase = "sections" | "quiz" | "results"

interface QuizResult {
  score: number
  passed: boolean
  correct: number
  total: number
  results: {
    question: string
    selectedIndex: number
    correctIndex: number
    isCorrect: boolean
  }[]
}

export function TrainingModuleView({ module, onComplete }: TrainingModuleViewProps) {
  const [phase, setPhase] = useState<Phase>("sections")
  const [sectionIndex, setSectionIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>(
    new Array(module.quiz.length).fill(null)
  )
  const [quizIndex, setQuizIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = module.sections.length + module.quiz.length
  const currentStep =
    phase === "sections"
      ? sectionIndex + 1
      : phase === "quiz"
        ? module.sections.length + quizIndex + 1
        : totalSteps

  const progressPercent = Math.round((currentStep / totalSteps) * 100)

  // --- Section navigation ---
  function handleNextSection() {
    if (sectionIndex < module.sections.length - 1) {
      setSectionIndex(sectionIndex + 1)
    } else {
      setPhase("quiz")
      setQuizIndex(0)
    }
  }

  function handlePrevSection() {
    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1)
    }
  }

  // --- Quiz navigation ---
  function handleSelectAnswer(optionIndex: number) {
    const updated = [...quizAnswers]
    updated[quizIndex] = optionIndex
    setQuizAnswers(updated)
  }

  function handleNextQuestion() {
    if (quizIndex < module.quiz.length - 1) {
      setQuizIndex(quizIndex + 1)
    }
  }

  function handlePrevQuestion() {
    if (quizIndex > 0) {
      setQuizIndex(quizIndex - 1)
    } else {
      setPhase("sections")
      setSectionIndex(module.sections.length - 1)
    }
  }

  async function handleSubmitQuiz() {
    // Check all answered
    const unanswered = quizAnswers.findIndex((a) => a === null)
    if (unanswered !== -1) {
      setError(`Please answer question ${unanswered + 1} before submitting.`)
      setQuizIndex(unanswered)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/training/${module.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: quizAnswers }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to submit quiz")
      }

      const result: QuizResult = await res.json()
      setQuizResult(result)
      setPhase("results")

      if (result.passed && onComplete) {
        onComplete()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleRetake() {
    setPhase("sections")
    setSectionIndex(0)
    setQuizIndex(0)
    setQuizAnswers(new Array(module.quiz.length).fill(null))
    setQuizResult(null)
    setError(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-[#1B3A5C]" />
              <div>
                <CardTitle className="text-lg">{module.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{module.description}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              v{module.version}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3">
            <Progress value={progressPercent} className="flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {phase === "sections" && `Section ${sectionIndex + 1} of ${module.sections.length}`}
              {phase === "quiz" && `Question ${quizIndex + 1} of ${module.quiz.length}`}
              {phase === "results" && "Complete"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Section Content */}
      {phase === "sections" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[#1B3A5C] text-white text-xs font-bold flex-shrink-0">
                {sectionIndex + 1}
              </span>
              {module.sections[sectionIndex].title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              {module.sections[sectionIndex].content.split("\n\n").map((paragraph, i) => (
                <div key={i} className="mb-4">
                  {paragraph.startsWith("- ") ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {paragraph.split("\n").map((line, j) => (
                        <li key={j} className="text-sm text-muted-foreground">
                          {line.replace(/^- /, "")}
                        </li>
                      ))}
                    </ul>
                  ) : paragraph.match(/^\d+\./) ? (
                    <ol className="list-decimal pl-5 space-y-1">
                      {paragraph.split("\n").map((line, j) => (
                        <li key={j} className="text-sm text-muted-foreground">
                          {line.replace(/^\d+\.\s*/, "")}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">{paragraph}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevSection}
                disabled={sectionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button size="sm" onClick={handleNextSection}>
                {sectionIndex < module.sections.length - 1 ? (
                  <>
                    Next Section
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Start Quiz
                    <ClipboardCheck className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiz */}
      {phase === "quiz" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#1B3A5C]" />
              Question {quizIndex + 1} of {module.quiz.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium mb-4">{module.quiz[quizIndex].question}</p>

            <div className="space-y-2">
              {module.quiz[quizIndex].options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectAnswer(i)}
                  className={`w-full text-left p-3 rounded-md border text-sm transition-colors ${
                    quizAnswers[quizIndex] === i
                      ? "border-[#1B3A5C] bg-blue-50 font-medium"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border text-xs mr-2 flex-shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {option}
                </button>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 mt-4 p-3 rounded-md bg-red-50 border border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={handlePrevQuestion}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {quizIndex === 0 ? "Back to Content" : "Previous"}
              </Button>

              {quizIndex < module.quiz.length - 1 ? (
                <Button
                  size="sm"
                  onClick={handleNextQuestion}
                  disabled={quizAnswers[quizIndex] === null}
                >
                  Next Question
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmitQuiz}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Quiz"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {phase === "results" && quizResult && (
        <>
          <Card className={quizResult.passed ? "border-emerald-200" : "border-red-200"}>
            <CardContent className="py-8 text-center">
              {quizResult.passed ? (
                <>
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-lg font-semibold text-emerald-700">Training Complete</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You scored {quizResult.score}% ({quizResult.correct}/{quizResult.total} correct).
                    Passing score: {module.passingScore}%.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
                  <p className="text-lg font-semibold text-red-700">Not Passed</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You scored {quizResult.score}% ({quizResult.correct}/{quizResult.total} correct).
                    You need {module.passingScore}% to pass.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={handleRetake}>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Retake Training
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Detailed Results */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                Quiz Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {quizResult.results.map((r, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-md border ${
                      r.isCorrect ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {r.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{r.question}</p>
                        {!r.isCorrect && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-red-600">
                              Your answer: {module.quiz[i].options[r.selectedIndex]}
                            </p>
                            <p className="text-xs text-emerald-700">
                              Correct answer: {module.quiz[i].options[r.correctIndex]}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
