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
