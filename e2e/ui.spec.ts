import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------
// UI rendering tests — verify pages render with expected elements.
// Note: The ChatPanel (Junebug) is only available in the (dashboard)
// layout which requires authentication. Without DB access, we can
// only verify unauthenticated page rendering.
// ---------------------------------------------------------------

test.describe("Login page", () => {
  test("renders login form", async ({ page }) => {
    await page.goto("/login")
    // Should have email and password inputs
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    // Should have a submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test("shows Cleared branding", async ({ page }) => {
    await page.goto("/login")
    const text = await page.textContent("body")
    expect(text).toContain("Cleared")
  })

  test("login form rejects empty submission", async ({ page }) => {
    await page.goto("/login")
    await page.click('button[type="submit"]')
    // Should stay on login page (not navigate away)
    await expect(page).toHaveURL(/login/)
  })
})

test.describe("Dashboard pages redirect to login", () => {
  test("cases page redirects", async ({ page }) => {
    await page.goto("/cases")
    await expect(page).toHaveURL(/login/, { timeout: 10000 })
  })

  test("review page redirects", async ({ page }) => {
    await page.goto("/review")
    await expect(page).toHaveURL(/login/, { timeout: 10000 })
  })

  test("settings/work-product redirects to login (C1)", async ({ page }) => {
    await page.goto("/settings/work-product")
    await expect(page).toHaveURL(/login/, { timeout: 10000 })
  })
})
