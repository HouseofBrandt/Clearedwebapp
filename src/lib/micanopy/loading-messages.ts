export const micanopyLoadingMessages: Record<string, string[]> = {
  retrieving: [
    "Banjo's tuning up the research strings...",
    "Diving into the firm's knowledge vault...",
    "Pulling every thread on this question...",
    "Searching across IRC, IRM, and case law...",
    "Cross-referencing the IRS's own playbook...",
    "Checking what Revenue Procedures apply here...",
    "Looking for on-point Tax Court opinions...",
    "Scanning Treasury Regulations for the fine print...",
    "Searching the firm's approved work product library...",
    "Querying IRS.gov for the latest guidance...",
  ],
  composing: [
    "Banjo's laying down the analysis track...",
    "Building the legal framework brick by brick...",
    "Weaving authorities into a clear narrative...",
    "Drafting your research with pinpoint citations...",
    "Constructing the CREAC analysis structure...",
    "Connecting the dots between statute and facts...",
    "Putting the conclusion before the windup...",
    "Making sure every proposition has a citation...",
  ],
  verifying: [
    "Double-checking every citation against sources...",
    "Running the quality evaluation pass...",
    "Verifying authority hierarchy and recency...",
    "Making sure nothing slipped through uncited...",
    "Banjo's proofing the final draft...",
  ],
  exporting: [
    "Formatting for Times New Roman perfection...",
    "Building the DOCX with firm letterhead...",
    "Laying out the authority table...",
    "Polishing the final document...",
  ],
}

export function getMicanopyLoadingMessage(stage: string): string {
  const messages = micanopyLoadingMessages[stage]
  if (!messages || messages.length === 0) return "Working..."
  return messages[Math.floor(Math.random() * messages.length)]
}
