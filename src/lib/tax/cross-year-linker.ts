/**
 * Cross-Year Linkage Detection
 *
 * Identifies financial relationships between tax years such as
 * overpayment transfers (TC 826/700), credit movements (TC 706),
 * and escalating balance patterns across multiple periods.
 */

export interface CrossYearLink {
  id: string
  type: string
  description: string
  sourceYear: string
  targetYear: string
  amount: number
  sourceTransaction: { code: string; date: string; amount: number }
  targetTransaction?: { code: string; date: string; amount: number }
}

export function detectCrossYearLinks(yearData: Record<string, any>): CrossYearLink[] {
  const links: CrossYearLink[] = []
  let linkId = 0
  const years = Object.keys(yearData).sort()

  for (const year of years) {
    const transactions = yearData[year]?.account?.transactions || []

    // TC 826: Overpayment transferred to another period
    for (const t of transactions) {
      if (t.code === "826" && t.amount) {
        // Find the target year (often in description or cycle)
        const targetYear = findTargetYear(t, years, year)
        if (targetYear) {
          // Look for matching TC 700 (credit transferred in) on target year
          const targetTxns = yearData[targetYear]?.account?.transactions || []
          const matching = targetTxns.find((tt: any) =>
            tt.code === "700" && Math.abs(Math.abs(tt.amount) - Math.abs(t.amount)) < 1
          )
          links.push({
            id: `link-${++linkId}`,
            type: "OVERPAYMENT_TRANSFER",
            description: `Overpayment of ${formatCurrency(Math.abs(t.amount))} from TY ${year} transferred to TY ${targetYear}`,
            sourceYear: year,
            targetYear,
            amount: Math.abs(t.amount),
            sourceTransaction: t,
            targetTransaction: matching || undefined
          })
        }
      }

      // TC 700: Credit transferred in
      if (t.code === "700" && t.amount) {
        // Already handled from TC 826 side, but catch any unlinked credits
        const alreadyLinked = links.some(l =>
          l.targetYear === year && l.type === "OVERPAYMENT_TRANSFER" && Math.abs(l.amount - Math.abs(t.amount)) < 1
        )
        if (!alreadyLinked) {
          links.push({
            id: `link-${++linkId}`,
            type: "CREDIT_TRANSFERRED_IN",
            description: `Credit of ${formatCurrency(Math.abs(t.amount))} transferred into TY ${year} from another period`,
            sourceYear: "unknown",
            targetYear: year,
            amount: Math.abs(t.amount),
            sourceTransaction: t,
          })
        }
      }

      // TC 706: Credit transferred out
      if (t.code === "706" && t.amount) {
        links.push({
          id: `link-${++linkId}`,
          type: "CREDIT_TRANSFERRED_OUT",
          description: `Credit of ${formatCurrency(Math.abs(t.amount))} transferred out of TY ${year}`,
          sourceYear: year,
          targetYear: "unknown",
          amount: Math.abs(t.amount),
          sourceTransaction: t,
        })
      }
    }
  }

  // Cross-year pattern: escalating balances
  const balances = years.map(y => ({
    year: y,
    balance: yearData[y]?.account?.balance || 0
  })).filter(b => b.balance > 0)

  if (balances.length >= 3) {
    const increasing = balances.every((b, i) => i === 0 || b.balance >= balances[i - 1].balance)
    if (increasing && balances[balances.length - 1].balance > balances[0].balance * 2) {
      links.push({
        id: `link-${++linkId}`,
        type: "ESCALATING_BALANCES",
        description: `Balances escalating across ${balances.length} years: ${formatCurrency(balances[0].balance)} (${balances[0].year}) \u2192 ${formatCurrency(balances[balances.length - 1].balance)} (${balances[balances.length - 1].year})`,
        sourceYear: balances[0].year,
        targetYear: balances[balances.length - 1].year,
        amount: balances[balances.length - 1].balance - balances[0].balance,
        sourceTransaction: { code: "pattern", date: "", amount: balances[0].balance }
      })
    }
  }

  return links
}

function findTargetYear(transaction: any, allYears: string[], sourceYear: string): string | null {
  // Try to extract target year from description or cycle
  const desc = (transaction.description || "").toLowerCase()
  for (const y of allYears) {
    if (y !== sourceYear && (desc.includes(y) || desc.includes(`12${y}`))) return y
  }
  // Default: adjacent year
  const idx = allYears.indexOf(sourceYear)
  if (idx < allYears.length - 1) return allYears[idx + 1]
  if (idx > 0) return allYears[idx - 1]
  return null
}

function formatCurrency(n: number): string {
  return Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })
}
