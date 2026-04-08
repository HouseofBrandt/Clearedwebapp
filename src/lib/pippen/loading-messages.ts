/**
 * Pippen Loading Messages
 *
 * Golden retriever personality messages shown during report generation.
 * Grouped by phase of the daily report build process.
 */

export type PippenPhase = "harvesting" | "processing" | "compiling" | "complete"

export const PIPPEN_LOADING_MESSAGES: Record<PippenPhase, string[]> = {
  harvesting: [
    "Sniffing out today's documents...",
    "Digging through the mailbox for new filings...",
    "Fetching the latest from the IRS...",
    "Ears perked — checking authority sources...",
    "Bounding through the intake queue...",
    "Nose to the ground, tracking new uploads...",
  ],
  processing: [
    "Chewing through the data... good boy.",
    "Sorting documents into neat little piles...",
    "Shaking off duplicates...",
    "Tail wagging — found some interesting items...",
    "Pawing through extraction results...",
    "Rolling around in the metadata...",
  ],
  compiling: [
    "Carrying the report back to you...",
    "Almost there — just one more lap around the yard...",
    "Assembling your daily fetch summary...",
    "Putting a bow on it... well, a paw print...",
    "Trotting back with everything in mouth...",
  ],
  complete: [
    "Delivered! Who's a good boy?",
    "Report dropped at your feet. Treat please?",
    "All fetched and accounted for!",
    "Mission accomplished. Belly rub optional but encouraged.",
    "Your daily report is served, tail wags included.",
  ],
}

export const PIPPEN_EMPTY_STATE = {
  title: "Nothing to fetch today",
  messages: [
    "Pippen checked everywhere — no new documents or authorities today.",
    "The intake bowl is empty. Pippen will check again tomorrow.",
    "Pippen sniffed around but came back empty-pawed. Quiet day!",
    "No new items in the yard today. Pippen is taking a well-earned nap.",
  ],
}

/**
 * Get a random loading message for the given phase.
 */
export function getPippenMessage(phase: PippenPhase): string {
  const messages = PIPPEN_LOADING_MESSAGES[phase]
  return messages[Math.floor(Math.random() * messages.length)]
}

/**
 * Get a random empty state message.
 */
export function getPippenEmptyMessage(): string {
  const messages = PIPPEN_EMPTY_STATE.messages
  return messages[Math.floor(Math.random() * messages.length)]
}
