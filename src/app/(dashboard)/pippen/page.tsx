import { PippenDailyReportView } from "@/components/pippen/daily-report"

export const metadata = {
  title: "Pippen's Report — Cleared",
  description: "Daily intake report — what Pippen fetched today",
}

export default function PippenPage() {
  return <PippenDailyReportView />
}
