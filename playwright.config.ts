import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a real WordPress + Bricks builder (see README, "Running the tests").
 * BRICKS_URL defaults to the local lab at http://localhost:8080 (admin / admin).
 */
export default defineConfig({
  testDir: './test/e2e',
  // PHP's built-in server handles one request at a time: run serially.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  globalSetup: './test/e2e/global-setup.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BRICKS_URL ?? 'http://localhost:8080',
    viewport: { width: 1600, height: 1000 },
    storageState: 'test-results/.auth/admin.json',
    permissions: ['clipboard-read', 'clipboard-write'],
    headless: true,
    trace: 'retain-on-failure',
  },
});
