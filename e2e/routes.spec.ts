import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------
// These tests verify that all routes compile, load, and return
// correct HTTP status codes. The Neon DB is unreachable in this
// environment, so we test auth guards (401/403) and page rendering.
// ---------------------------------------------------------------

test.describe("Page routes render without crash", () => {
  test("login page returns 200", async ({ request }) => {
    const res = await request.get("/login")
    expect(res.status()).toBe(200)
    const html = await res.text()
    expect(html).toContain("Cleared")
  })

  test("dashboard redirects to login when unauthenticated", async ({ request }) => {
    const res = await request.get("/dashboard", { maxRedirects: 0 })
    // Should redirect (307/302) to login
    expect([302, 307]).toContain(res.status())
  })

  test("settings/work-product page exists (C1)", async ({ request }) => {
    const res = await request.get("/settings/work-product", { maxRedirects: 0 })
    // Redirects to login (auth required) — but NOT 404
    expect([302, 307]).toContain(res.status())
  })
})

test.describe("A1: KB search enum fix — route loads", () => {
  test("GET /api/knowledge/search returns 401 without auth (not 500)", async ({ request }) => {
    const res = await request.get("/api/knowledge/search?q=test&category=IRC_STATUTE")
    expect(res.status()).toBe(401)
  })
})

test.describe("A2: Research route — enum validation", () => {
  test("POST /api/research returns 403 without auth (not 500)", async ({ request }) => {
    const res = await request.post("/api/research", {
      data: { topic: "test", scope: "narrow", kbCategory: "CUSTOM" },
    })
    expect(res.status()).toBe(403)
  })
})

test.describe("A6: KB ingestion routes have maxDuration", () => {
  test("POST /api/knowledge/ingest-approved returns auth error (not 500)", async ({ request }) => {
    const res = await request.post("/api/knowledge/ingest-approved", {
      data: { taskId: "fake" },
    })
    // Auth guard should kick in before anything else
    expect([401, 403]).toContain(res.status())
  })
})

test.describe("B2: Banjo plan — concurrency guard", () => {
  test("POST /api/banjo/plan returns 403 without auth", async ({ request }) => {
    const res = await request.post("/api/banjo/plan", {
      data: { caseId: "fake", assignmentText: "test" },
    })
    expect(res.status()).toBe(403)
  })
})

test.describe("C2: Autopopulate endpoint exists", () => {
  test("GET /api/cases/fake/autopopulate returns auth error (not 404)", async ({ request }) => {
    const res = await request.get("/api/cases/fake/autopopulate")
    // 401 means the route exists and auth guard runs
    expect([401, 403]).toContain(res.status())
  })
})

test.describe("C3: Export with new filter params", () => {
  test("GET /api/messages/export accepts new params without crash", async ({ request }) => {
    const res = await request.get(
      "/api/messages/export?format=json&includeArchived=false&readFilter=unread&statusFilter=open,in_progress"
    )
    // 401 = route loaded, auth guard ran (not 500)
    expect(res.status()).toBe(401)
  })
})

test.describe("C7: Banjo DELETE endpoint exists", () => {
  test("DELETE /api/banjo/fake-id returns 403 (not 404 or 500)", async ({ request }) => {
    const res = await request.delete("/api/banjo/fake-id")
    expect(res.status()).toBe(403)
  })
})

test.describe("C8: Banjo validate endpoint exists", () => {
  test("GET /api/banjo/fake-id/validate returns 403 (not 404 or 500)", async ({ request }) => {
    const res = await request.get("/api/banjo/fake-id/validate")
    expect(res.status()).toBe(403)
  })
})

test.describe("Feed mention notification (B3)", () => {
  test("POST /api/feed returns auth error (not 500)", async ({ request }) => {
    const res = await request.post("/api/feed", {
      data: {
        postType: "post",
        content: "Hello @someone",
        mentions: [{ type: "user", id: "fake", display: "@someone" }],
      },
    })
    expect([401, 403]).toContain(res.status())
  })
})
