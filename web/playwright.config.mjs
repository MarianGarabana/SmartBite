// End-to-end tests against servers that are already running: the web dev server on 3100 (`npm run dev`) and the
// engine on 8100 (`.venv/bin/uvicorn api.index:app --host 127.0.0.1 --port 8100`). This config never starts or
// stops a server. The language model is mocked in the test (route interception): no real API call, no key.
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  outputDir: path.join(os.tmpdir(), "smartbite-e2e-results"), // keeps traces and screenshots out of the repo
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
