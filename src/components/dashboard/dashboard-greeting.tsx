"use client"

/**
 * DashboardGreeting
 * -----------------
 * Centered editorial greeting at the top of the new dashboard.
 *
 * Deliberately NO urgency ("3 items need attention"). The bell in the left
 * rail holds deadlines and alerts. The greeting is purely welcoming — it
 * sets the emotional tone for the page and says "we're not in a hurry."
 *
 * Cormorant Garamond weight 300, 32px, centered. Subtitle is DM Sans 12px
 * uppercase with generous letter-spacing.
 */

interface DashboardGreetingProps {
  userName: string
}

export function DashboardGreeting({ userName }: DashboardGreetingProps) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = userName.split(" ")[0] || "there"

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return (
    <div className="mb-[56px] mt-2">
      <h1 className="dash-greeting">
        {greeting}, {firstName}
      </h1>
      <p className="dash-greeting-date">{dateStr}</p>
    </div>
  )
}
