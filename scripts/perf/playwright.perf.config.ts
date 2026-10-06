import { defineConfig, devices } from '@playwright/test';

/**
 * Load-time measurement of the signed-in product (docs/perf/REPORT.md).
 *
 * Not part of the test suite: it lives outside `tests/` so CI never runs it,
 * and it starts no server. Run it against a production build that is already
 * up (`npm run build` with NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true, then
 * `npm start` with the emulator variables) and the emulators running:
 *
 *   npx playwright test -c scripts/perf/playwright.perf.config.ts
 *
 * The seeding helper talks to /api/test/seed with PILOT_APPROVAL_SECRET, so
 * the server and this run need the same value.
 */
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
if (!process.env.PILOT_APPROVAL_SECRET) process.env.PILOT_APPROVAL_SECRET = 'perf-approval-secret-key-1234567890';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.perf\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 15 * 60 * 1000,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
