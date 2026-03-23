export const BANJO_MESSAGES: Record<string, string[]> = {
  starting: [
    "Tuning up the strings...",
    "Rosining the bow...",
    "Setting up the music stand...",
    "Checking the tuning pegs...",
    "Finding the right capo...",
  ],
  processing: [
    "Picking through the financials...",
    "Reading between the lines...",
    "Rolling through the transcripts...",
    "Strumming through the statements...",
    "Plucking the important bits...",
    "Sightreading the notices...",
  ],
  generating: [
    "Making greener bluegrass...",
    "Finding the right key...",
    "Working out the chord progression...",
    "Playing a little flatpicking...",
    "Laying down the rhythm track...",
    "Building a melody from the data...",
    "Harmonizing the numbers...",
    "Composing your deliverables...",
    "Improvising within the structure...",
    "Adding some fingerpicking detail...",
  ],
  finalizing: [
    "Fine-tuning the arrangement...",
    "Polishing the final notes...",
    "Adding the finishing flourishes...",
    "Bringing it all together...",
    "Checking the harmony...",
  ],
  revision: [
    "Listening back to the whole set...",
    "Cross-checking the harmonies...",
    "Making sure every note lands...",
    "One last ear on the mix...",
    "Quality-checking the full arrangement...",
    "Tuning the ensemble...",
  ],
  complete: [
    "That's a wrap \u2014 take it from here, maestro.",
    "Your set list is ready.",
    "The banjo has spoken.",
  ],
}

export function getBanjoMessage(phase: string, previousMessages: string[]): string {
  const pool = BANJO_MESSAGES[phase] || BANJO_MESSAGES.generating
  const available = pool.filter((m) => !previousMessages.slice(-5).includes(m))
  return available[Math.floor(Math.random() * available.length)] || pool[0]
}

export function getBanjoPhase(percent: number): string {
  if (percent <= 10) return "starting"
  if (percent <= 30) return "processing"
  if (percent <= 75) return "generating"
  if (percent < 100) return "finalizing"
  return "complete"
}
