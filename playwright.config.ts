// Playwright smoke (SPEC §7.6). Server + imported fixture come from e2e/global-setup.ts.
// Run `npm run build` first (the server serves dist/client).
import { defineConfig, devices } from '@playwright/test';

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
  ],
});
