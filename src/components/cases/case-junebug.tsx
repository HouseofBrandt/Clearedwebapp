"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { JunebugIcon } from "@/components/assistant/junebug-icon"

/**
 * CaseJunebug — compact "Ask Junebug about this case" link at the bottom
 * of the case detail right rail. Routes to the full workspace with the
 * case pre-scoped.
 *
 * Historical note: this used to be an inline chat widget behind a
 * feature flag. The inline widget was replaced by a link once the
 * multi-thread workspace became the canonical surface; the flag was
 * retired in PR 4 of the A4.7 rollout. The old `caseContext`,
 * `collapsed`, `onToggle`, and `digest` props on this component went
 * away with the widget.
 */
export interface CaseJunebugProps {
  caseId: string
}

export function CaseJunebug({ caseId }: CaseJunebugProps) {
  return (
    <div className="border-t">
      <Link
        href={`/junebug?case=${caseId}`}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <JunebugIcon className="h-4 w-4" style={{ color: "var(--c-warning)" }} />
          <span className="text-xs font-medium text-c-gray-700">Ask Junebug about this case</span>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
    </div>
  )
}
