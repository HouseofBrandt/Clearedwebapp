/**
 * Junebug loading messages — dog-themed personality layer.
 *
 * The tone is warm and slightly playful: a very good dog
 * who happens to be extremely competent at tax research.
 *
 * These appear only in the UI chrome (loading states, empty states, errors).
 * Junebug's actual analytical responses stay professional and practitioner-grade.
 */

export const JUNEBUG_LOADING_MESSAGES: Record<string, string[]> = {
  thinking: [
    "Chasing my tail through the transcripts...",
    "Sniffing out the answer...",
    "Digging through the case file...",
    "Fetching that for you...",
    "Pawing through the knowledge base...",
    "Nose deep in the documents...",
    "On the scent...",
    "Tracking it down...",
    "Rummaging through the IRM...",
    "Ears up, searching...",
    "Hot on the trail...",
    "Pulling up the good stuff...",
    "Shaking the dust off this one...",
    "Trotting through the case history...",
    "Circling the answer...",
    "Tail up — found something...",
  ],
  research: [
    "Chasing this one across the web...",
    "Sniffing out the latest guidance...",
    "Off-leash on the internet...",
    "Fetching from the real world...",
    "Following the trail online...",
    "Digging up something fresh...",
    "Running down a lead...",
    "Nose to the ground out there...",
  ],
  banjo: [
    "Handing this off to Banjo...",
    "Nudging Banjo awake...",
    "Banjo's warming up the strings...",
  ],
}

export const JUNEBUG_COMPLETE_MESSAGES = [
  "Found it.",
  "Got it. Here you go.",
  "Back with the goods.",
  "Fetched.",
  "Done sniffing around.",
]

export const JUNEBUG_ERROR_MESSAGES = [
  "Got distracted by a squirrel. Try again?",
  "Lost the scent. Give it another shot?",
  "Tripped over my own paws. Try again?",
  "Dropped the ball on that one. Retry?",
]

export const JUNEBUG_EMPTY_STATE = {
  greeting: "Junebug is here.",
  subtitle: "Ask anything about the case, tax law, or what to do next.",
}

export const JUNEBUG_GREETING_PREFIXES = [
  null, null, null, null, null, null, null, null, // 80% — no prefix
  "Ears perked. ",
  "Tail wagging. ",
  "Alert and ready. ",
  "Nose up. ",
]

/**
 * Returns a random loading message for the given phase.
 * Avoids repeating the last 4 messages shown.
 */
export function getJunebugMessage(phase: string, previousMessages: string[] = []): string {
  const pool = JUNEBUG_LOADING_MESSAGES[phase] || JUNEBUG_LOADING_MESSAGES.thinking
  const available = pool.filter(m => !previousMessages.slice(-4).includes(m))
  return available[Math.floor(Math.random() * available.length)] || pool[0]
}

export function getJunebugLoadingMessage(
  phase: "thinking" | "research" | "banjo" = "thinking",
  recentMessages: string[] = []
): string {
  const pool = JUNEBUG_LOADING_MESSAGES[phase] || JUNEBUG_LOADING_MESSAGES.thinking
  const available = pool.filter(m => !recentMessages.slice(-4).includes(m))
  if (available.length === 0) return pool[0]
  return available[Math.floor(Math.random() * available.length)]
}

/**
 * Returns a random error message.
 */
export function getJunebugErrorMessage(): string {
  return JUNEBUG_ERROR_MESSAGES[Math.floor(Math.random() * JUNEBUG_ERROR_MESSAGES.length)]
}

/**
 * Returns a greeting prefix (20% chance) or null (80% chance).
 */
export function getJunebugGreetingPrefix(): string {
  const prefix = JUNEBUG_GREETING_PREFIXES[
    Math.floor(Math.random() * JUNEBUG_GREETING_PREFIXES.length)
  ]
  return prefix || ""
}
