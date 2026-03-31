import { test, expect } from "@playwright/test"
import { execSync } from "child_process"

// ---------------------------------------------------------------
// Unit-level tests for the export validation module.
// Since Playwright can't import TS directly, we run via tsx.
// ---------------------------------------------------------------

function runValidation(tasksJson: string): any {
  const script = `
    import { validateForExport } from './src/lib/banjo/export-validation';
    const tasks = ${tasksJson};
    const result = validateForExport(tasks);
    console.log(JSON.stringify(result));
  `
  const output = execSync(`npx tsx -e "${script.replace(/"/g, '\\"')}"`, {
    cwd: "/home/user/Clearedwebapp",
    encoding: "utf-8",
    timeout: 10000,
  }).trim()
  return JSON.parse(output)
}

test.describe("C8: Export validation module", () => {
  test("rejects empty output", () => {
    const result = runValidation(`[{
      id: "t1", taskType: "CASE_MEMO", status: "APPROVED",
      detokenizedOutput: "", banjoStepNumber: 1, banjoStepLabel: "Memo",
      verifyFlagCount: 0, judgmentFlagCount: 0
    }]`)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test("accepts valid output", () => {
    const result = runValidation(`[{
      id: "t2", taskType: "CASE_MEMO", status: "APPROVED",
      detokenizedOutput: "This is a properly written case memo with substantive analysis of the taxpayer situation and recommended resolution approach.",
      banjoStepNumber: 1, banjoStepLabel: "Memo",
      verifyFlagCount: 0, judgmentFlagCount: 0
    }]`)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test("rejects output with [PLACEHOLDER]", () => {
    const result = runValidation(`[{
      id: "t3", taskType: "CASE_MEMO", status: "APPROVED",
      detokenizedOutput: "This memo contains a [PLACEHOLDER] that should be filled in before sending to the client.",
      banjoStepNumber: 1, banjoStepLabel: "Memo",
      verifyFlagCount: 0, judgmentFlagCount: 0
    }]`)
    expect(result.valid).toBe(false)
  })

  test("rejects output with template variables", () => {
    const result = runValidation(`[{
      id: "t5", taskType: "CASE_MEMO", status: "APPROVED",
      detokenizedOutput: "Dear {{client_name}}, your case for {{tax_year}} is ready for review and final submission.",
      banjoStepNumber: 1, banjoStepLabel: "Letter",
      verifyFlagCount: 0, judgmentFlagCount: 0
    }]`)
    expect(result.valid).toBe(false)
  })

  test("warns on high VERIFY flag count but still valid", () => {
    const result = runValidation(`[{
      id: "t6", taskType: "CASE_MEMO", status: "APPROVED",
      detokenizedOutput: "This is a valid case memo with enough content to pass the length check and verify flag warnings.",
      banjoStepNumber: 1, banjoStepLabel: "Memo",
      verifyFlagCount: 8, judgmentFlagCount: 0
    }]`)
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test("rejects suspiciously short output", () => {
    const result = runValidation(`[{
      id: "t8", taskType: "CASE_MEMO", status: "APPROVED",
      detokenizedOutput: "Too short.",
      banjoStepNumber: 1, banjoStepLabel: "Memo",
      verifyFlagCount: 0, judgmentFlagCount: 0
    }]`)
    expect(result.valid).toBe(false)
  })
})
