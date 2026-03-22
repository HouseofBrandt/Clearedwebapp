"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { BanjoIcon } from "./banjo-icon"

interface ClarificationQuestion {
  id: string
  question: string
  options: { value: string; label: string }[]
  allowFreetext: boolean
}

interface BanjoClarificationProps {
  questions: ClarificationQuestion[]
  onSubmit: (answers: Record<string, string>, additionalNotes?: string) => void
  onSkip: () => void
  disabled?: boolean
}

export function BanjoClarification({ questions, onSubmit, onSkip, disabled }: BanjoClarificationProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [freetextMode, setFreetextMode] = useState<Record<string, boolean>>({})
  const [additionalNotes, setAdditionalNotes] = useState("")

  function handleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  function toggleFreetext(questionId: string) {
    setFreetextMode((prev) => ({ ...prev, [questionId]: !prev[questionId] }))
    if (!freetextMode[questionId]) {
      setAnswers((prev) => ({ ...prev, [questionId]: "" }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BanjoIcon className="h-4 w-4" animated />
        <span>Banjo is reviewing your assignment...</span>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium">I have a couple of quick questions before I start:</p>
        </div>

        {questions.map((q, idx) => (
          <div key={q.id} className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">{idx + 1}.</span> {q.question}
            </p>

            {!freetextMode[q.id] ? (
              <div className="space-y-1.5 pl-4">
                {q.options.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === opt.value}
                      onChange={() => handleAnswer(q.id, opt.value)}
                      disabled={disabled}
                      className="h-4 w-4"
                    />
                    {opt.label}
                  </label>
                ))}
                {q.allowFreetext && (
                  <button
                    type="button"
                    onClick={() => toggleFreetext(q.id)}
                    className="text-xs text-primary hover:underline mt-1"
                    disabled={disabled}
                  >
                    I&apos;ll type my own answer
                  </button>
                )}
              </div>
            ) : (
              <div className="pl-4 space-y-1">
                <Textarea
                  value={answers[q.id] || ""}
                  onChange={(e) => handleAnswer(q.id, e.target.value)}
                  placeholder="Type your answer..."
                  rows={2}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => toggleFreetext(q.id)}
                  className="text-xs text-primary hover:underline"
                  disabled={disabled}
                >
                  Use preset options
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Additional notes (optional)</Label>
          <Textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Any extra context..."
            rows={2}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onSkip} disabled={disabled}>
          Skip \u2014 just run it
        </Button>
        <Button
          onClick={() => onSubmit(answers, additionalNotes || undefined)}
          disabled={disabled}
        >
          Answer & Continue
        </Button>
      </div>
    </div>
  )
}
