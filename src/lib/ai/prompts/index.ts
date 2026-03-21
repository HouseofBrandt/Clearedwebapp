/**
 * Prompt loader that works both locally and on Vercel serverless.
 * Uses fs.readFileSync with path.join(process.cwd(), ...) which Next.js
 * traces and includes in the serverless bundle when used at the top level.
 */
import { readFileSync } from "fs"
import path from "path"

const PROMPTS_DIR = path.join(process.cwd(), "src", "lib", "ai", "prompts")

// Cache prompts after first load
const cache = new Map<string, string>()

export function loadPrompt(name: string): string {
  if (cache.has(name)) {
    return cache.get(name)!
  }

  const promptPath = path.join(PROMPTS_DIR, `${name}.txt`)
  const content = readFileSync(promptPath, "utf-8")
  cache.set(name, content)
  return content
}

// Pre-reference all prompt files so Next.js includes them in the bundle trace.
// This is needed for Vercel serverless deployment.
const _promptFiles = [
  path.join(PROMPTS_DIR, "core_system_v1.txt"),
  path.join(PROMPTS_DIR, "oic_analysis_v1.txt"),
  path.join(PROMPTS_DIR, "oic_extraction_v1.txt"),
  path.join(PROMPTS_DIR, "case_analysis_v1.txt"),
  path.join(PROMPTS_DIR, "case_memo_v1.txt"),
  path.join(PROMPTS_DIR, "penalty_abatement_v1.txt"),
  path.join(PROMPTS_DIR, "ia_analysis_v1.txt"),
  path.join(PROMPTS_DIR, "cnc_analysis_v1.txt"),
  path.join(PROMPTS_DIR, "innocent_spouse_v1.txt"),
  path.join(PROMPTS_DIR, "tfrp_analysis_v1.txt"),
  path.join(PROMPTS_DIR, "case_router_v1.txt"),
  path.join(PROMPTS_DIR, "research_assistant_v1.txt"),
  path.join(PROMPTS_DIR, "appeals_rebuttal_v1.txt"),
  path.join(PROMPTS_DIR, "oic_narrative_v1.txt"),
]

// Force Next.js to trace these files by reading them at module init
try {
  for (const f of _promptFiles) {
    readFileSync(f, "utf-8")
  }
} catch {
  // Ignore errors during build — files will be available at runtime
}
