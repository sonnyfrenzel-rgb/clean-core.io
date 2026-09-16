import { defineConfig, devices } from '@playwright/test';

// Force emulator environment variables for the test runner process
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

// Ensure security secrets are available for tests that call createApprovalToken directly
if (!process.env.PILOT_APPROVAL_SECRET) {
  process.env.PILOT_APPROVAL_SECRET = 'test-approval-secret-key-1234567890';
}
if (!process.env.MFA_BACKUP_CODE_PEPPER) {
  process.env.MFA_BACKUP_CODE_PEPPER = 'test-mfa-pepper-value-for-ci-test-runner-32';
}
// The signing and verification routes now fail closed without a key in every
// environment, which is the whole point of removing the committed fallback. Set
// here at module scope rather than in `webServer.env` so the specs sign with the
// same key the server verifies with — the server inherits it through
// `...process.env` below. The value is not a secret and does not need to be: it
// signs test fixtures against a test server.
if (!process.env.AUDIT_SIGNING_KEY) {
  process.env.AUDIT_SIGNING_KEY = 'test-audit-signing-key-for-ci-test-runner-32';
}
// 32 bytes of nothing in particular, base64. `lib/s4-credentials.ts` throws
// without a key and accepts any 32-byte one, so the suite needs *a* key and
// never the production key: CI used to be handed the same `S4_ENCRYPTION_KEY`
// the live service uses, which is the key every stored S/4 credential is
// encrypted with (security audit of v2.11.0, SEC-2026-024). A value committed
// here is visibly a test value; a production secret in a test job is one
// dependency or one changed spec away from leaving the building.
if (!process.env.S4_ENCRYPTION_KEY) {
  process.env.S4_ENCRYPTION_KEY = Buffer.alloc(32, 'clean-core-test-key').toString('base64');
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI ? 'npm start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      PILOT_APPROVAL_SECRET: process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345',
      MFA_BACKUP_CODE_PEPPER: process.env.MFA_BACKUP_CODE_PEPPER || 'test-mfa-pepper-value-for-ci-test-runner-32',
      // Suppress real email dispatch during E2E tests — API routes check `if (resendApiKey)` and skip when empty
      RESEND_API_KEY: '',
    },
  },
});
