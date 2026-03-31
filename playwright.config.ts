import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3457",
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },
  // Don't start the server automatically — we manage it ourselves
  webServer: {
    command: "npx next dev -p 3457",
    port: 3457,
    reuseExistingServer: true,
    timeout: 30000,
  },
})
