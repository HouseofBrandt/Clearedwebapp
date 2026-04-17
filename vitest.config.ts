import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Vitest config — runs the unit-test suite for pure-function modules.
 *
 * Scope (intentionally narrow):
 *   - Pure-function libraries under src/lib/** and src/components/**\/lib/**
 *   - No DOM, no Next.js runtime, no Prisma — those need integration tests
 *     (a separate setup with a test database and a Next.js test harness).
 *
 * Run locally with `npm test`. CI runs the same script. Both should pass
 * before any PR merges to main.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    globals: false, // import { describe, it, expect } explicitly
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/components/**/lib/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
    // Tests should be hermetic — no network, no filesystem outside fixtures.
    // Anything that needs a real Prisma or fetch shouldn't be a unit test.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
