export const JUNEBUG_MESSAGES: Record<string, string[]> = {
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
  ],
  research: [
    "Chasing this one across the web...",
    "Sniffing out the latest guidance...",
    "Off-leash on the internet...",
    "Fetching from the real world...",
    "Following the trail online...",
    "Digging up something fresh...",
  ],
  complete: [
    "Found it.",
    "Got it. Here you go.",
    "Back with the goods.",
    "Fetched.",
  ],
}

export function getJunebugMessage(phase: string, previousMessages: string[]): string {
  const pool = JUNEBUG_MESSAGES[phase] || JUNEBUG_MESSAGES.thinking
  const available = pool.filter(m => !previousMessages.slice(-4).includes(m))
  return available[Math.floor(Math.random() * available.length)] || pool[0]
}
