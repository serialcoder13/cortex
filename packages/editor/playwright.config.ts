import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5199",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite --config vite.config.ts",
    port: 5199,
    reuseExistingServer: true,
    timeout: 15_000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
