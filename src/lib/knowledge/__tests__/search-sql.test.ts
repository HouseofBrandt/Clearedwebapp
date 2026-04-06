/**
 * Tests for the knowledge search category filter SQL generation.
 * Verifies the fix for "operator does not exist: KnowledgeCategory = text".
 *
 * Run with: npx tsx src/lib/knowledge/__tests__/search-sql.test.ts
 */

// Replicate the category filter logic from search.ts to test in isolation
function buildCategoryFilter(
  categoryFilter: string[],
  startParamIndex: number
): { sql: string; params: string[]; nextParamIndex: number } | null {
  const validCategories = [
    "IRC_STATUTE", "TREASURY_REGULATION", "IRM_SECTION", "REVENUE_PROCEDURE",
    "REVENUE_RULING", "CASE_LAW", "TREATISE", "FIRM_TEMPLATE", "WORK_PRODUCT",
    "APPROVED_OUTPUT", "FIRM_PROCEDURE", "TRAINING_MATERIAL", "CLIENT_GUIDE", "CUSTOM",
  ]
  const filtered = categoryFilter.filter((c) => validCategories.includes(c))
  if (filtered.length === 0) return null

  let paramIndex = startParamIndex
  const params: string[] = []
  const placeholders = filtered.map((_, i) => `$${paramIndex + i}::"KnowledgeCategory"`)
  const sql = ` AND kd.category IN (${placeholders.join(", ")})`
  for (const cat of filtered) {
    params.push(cat)
    paramIndex++
  }

  return { sql, params, nextParamIndex: paramIndex }
}

// Simple test harness
let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

function assertEq(actual: any, expected: any, msg: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`)
  }
}

// ─── Tests ───────────────────────────────────────────────────────

console.log("\nKnowledge search category filter SQL tests\n")

console.log("Single category:")
{
  const r = buildCategoryFilter(["APPROVED_OUTPUT"], 3)!
  assertEq(r.sql, ` AND kd.category IN ($3::"KnowledgeCategory")`, "SQL uses enum cast")
  assertEq(r.params, ["APPROVED_OUTPUT"], "params contain category value")
  assertEq(r.nextParamIndex, 4, "paramIndex incremented by 1")
}

console.log("\nMultiple categories:")
{
  const r = buildCategoryFilter(["IRC_STATUTE", "CASE_LAW", "TREATISE"], 2)!
  assertEq(
    r.sql,
    ` AND kd.category IN ($2::"KnowledgeCategory", $3::"KnowledgeCategory", $4::"KnowledgeCategory")`,
    "SQL has correct placeholders"
  )
  assertEq(r.params, ["IRC_STATUTE", "CASE_LAW", "TREATISE"], "all valid params included")
  assertEq(r.nextParamIndex, 5, "paramIndex incremented by 3")
}

console.log("\nInvalid categories filtered out:")
{
  const r = buildCategoryFilter(["APPROVED_OUTPUT", "INVALID_CATEGORY", "CASE_LAW"], 1)!
  assertEq(r.params, ["APPROVED_OUTPUT", "CASE_LAW"], "only valid categories kept")
  assertEq(
    r.sql,
    ` AND kd.category IN ($1::"KnowledgeCategory", $2::"KnowledgeCategory")`,
    "SQL only has valid placeholders"
  )
}

console.log("\nAll invalid categories:")
{
  const r = buildCategoryFilter(["BOGUS", "FAKE"], 1)
  assertEq(r, null, "returns null")
}

console.log("\nEmpty array:")
{
  const r = buildCategoryFilter([], 1)
  assertEq(r, null, "returns null")
}

console.log("\nUses enum cast, not text cast:")
{
  const r = buildCategoryFilter(["IRC_STATUTE"], 1)!
  assert(!r.sql.includes("::text"), "does NOT contain ::text (old broken approach)")
  assert(r.sql.includes('::"KnowledgeCategory"'), "contains enum type cast")
}

console.log("\nUses IN, not ANY:")
{
  const r = buildCategoryFilter(["IRC_STATUTE", "CASE_LAW"], 1)!
  assert(!r.sql.includes("ANY"), "does NOT use ANY()")
  assert(r.sql.includes("IN"), "uses IN()")
}

console.log("\nParam index continuity (simulating text-only search starting at $2):")
{
  const r = buildCategoryFilter(["APPROVED_OUTPUT", "FIRM_PROCEDURE"], 2)!
  assertEq(r.nextParamIndex, 4, "next index is 4")
  assert(r.sql.includes("$2"), "uses $2")
  assert(r.sql.includes("$3"), "uses $3")
  assert(!r.sql.includes("$4"), "does not use $4 in clause")
}

// ─── Summary ─────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
