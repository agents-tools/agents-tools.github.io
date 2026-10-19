import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  outputDir: ".build/test-results",
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    browserName: "chromium",
  },
  projects: [1280, 375, 320].flatMap((width) =>
    ["light", "dark"].map((colorScheme) => ({
      name: `${colorScheme}-${width}`,
      use: { viewport: { width, height: 900 }, colorScheme },
    })),
  ),
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
