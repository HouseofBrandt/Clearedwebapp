/**
 * Drift Detector — detects significant changes in retrieval results
 * between benchmark runs using Jaccard similarity.
 */

/**
 * Detect drift between two sets of citations.
 *
 * Returns true if the Jaccard similarity between the current and previous
 * citation sets drops below the threshold (default 0.7), indicating
 * significant drift in retrieval results.
 *
 * @param currentCitations — citations from the current benchmark run
 * @param previousCitations — citations from the previous benchmark run
 * @param threshold — minimum Jaccard similarity to consider stable (default 0.7)
 * @returns true if drift is detected (similarity below threshold)
 */
export function detectDrift(
  currentCitations: string[],
  previousCitations: string[],
  threshold: number = 0.7
): boolean {
  // If both are empty, no drift
  if (currentCitations.length === 0 && previousCitations.length === 0) {
    return false
  }

  // If one is empty and the other is not, that is drift
  if (currentCitations.length === 0 || previousCitations.length === 0) {
    return true
  }

  const currentArr = currentCitations.map((c) => c.toLowerCase())
  const previousArr = previousCitations.map((c) => c.toLowerCase())
  const currentSet = new Set(currentArr)
  const previousSet = new Set(previousArr)

  // Jaccard similarity = |intersection| / |union|
  let intersectionSize = 0
  for (let i = 0; i < currentArr.length; i++) {
    if (previousSet.has(currentArr[i])) {
      intersectionSize++
    }
  }

  // Deduplicate intersection count (in case currentArr has duplicates)
  const seen = new Set<string>()
  intersectionSize = 0
  for (let i = 0; i < currentArr.length; i++) {
    if (!seen.has(currentArr[i]) && previousSet.has(currentArr[i])) {
      intersectionSize++
      seen.add(currentArr[i])
    }
  }

  const unionSet = new Set(currentArr.concat(previousArr))
  const unionSize = unionSet.size
  const similarity = unionSize > 0 ? intersectionSize / unionSize : 1.0

  return similarity < threshold
}
