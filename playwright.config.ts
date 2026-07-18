import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const nextPort = 3218;
const harnessPort = 4173;
const nodeCommand = JSON.stringify(process.execPath);
const serverEgressGuard = pathToFileURL(
  resolve("tests/browser/support/block-server-egress.mjs")
).href;

export default defineConfig({
  testDir: "./tests/browser/specs",
  outputDir: "test-results/browser-qa",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/browser-qa/results.json" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${nextPort}`,
    colorScheme: "light",
    contextOptions: {
      reducedMotion: "reduce",
    },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: `${nodeCommand} node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${nextPort}`,
      url: `http://127.0.0.1:${nextPort}/auth/signup`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        MEELNI_BROWSER_QA: "true",
        MEELNI_REACTIVATION_DEFAULT: "true",
        MEELNI_RELAUNCH_PHASE: "launched",
        NEXT_PUBLIC_STATSIG_CLIENT_KEY: "",
        NEXT_PUBLIC_STATSIG_ENVIRONMENT: "production",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-qa-anon-placeholder",
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "production",
        NODE_OPTIONS: `--import=${serverEgressGuard}`,
        VERCEL_ENV: "production",
      },
    },
    {
      command: `${nodeCommand} node_modules/vitest/node_modules/vite/bin/vite.js --config tests/browser/vite.config.ts --host 127.0.0.1 --port ${harnessPort} --strictPort`,
      url: `http://127.0.0.1:${harnessPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "test",
        NODE_OPTIONS: `--import=${serverEgressGuard}`,
      },
    },
  ],
});
