import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345';

import firebaseConfig from '../firebase-applet-config.json';

const firebaseApp = initializeApp(firebaseConfig, 'admin-usage-panel');
const firebaseAuth = getAuth(firebaseApp);

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

const ADMIN_EMAIL = 'sonny.frenzel@gmail.com';
const ADMIN_PASSWORD = 'SecurityPassword123!';
const FALLBACK_PASSWORD = 'SuperPassword123!';

/** Deterministic 64-char hex fingerprints, as written by reserveRunQuota. */
const fp = (seed: string, n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${seed}${i}`.padEnd(64, '0'), true]));

/**
 * Seeded cohort — one account per state the panel must render.
 *
 * The addresses deliberately look like real people: the panel hides CI accounts by
 * default, so a cohort on a test domain would be invisible and the test would pass
 * against an empty table. The one CI-looking account is there on purpose, to prove
 * the filter both hides and reveals it.
 */
const COHORT = [
  {
    uid: 'usage-e2e-fresh',
    firstName: 'Lena', lastName: 'Vogt', email: 'lena.vogt@northwind-industries.com',
    tier: 'pilot', status: 'approved', transformationsUsed: 0, transformationsLimit: 5,
  },
  {
    uid: 'usage-e2e-partial',
    firstName: 'Maria', lastName: 'Huber', email: 'maria.huber@northwind-industries.com',
    tier: 'pilot', status: 'approved', transformationsUsed: 3, transformationsLimit: 5,
    chargedInputs: fp('a', 3),
  },
  {
    uid: 'usage-e2e-atlimit',
    firstName: 'Jonas', lastName: 'Roth', email: 'jonas.roth@northwind-industries.com',
    tier: 'pilot', status: 'approved', transformationsUsed: 5, transformationsLimit: 5,
    chargedInputs: fp('b', 5),
  },
  {
    uid: 'usage-e2e-byok',
    firstName: 'Tim', lastName: 'Bauer', email: 'tim.bauer@northwind-industries.com',
    tier: 'pilot', status: 'approved', transformationsUsed: 0, transformationsLimit: 5,
    byokConfigured: true, byokLast4: '9f2c',
  },
  {
    uid: 'usage-e2e-pending',
    firstName: 'Sabine', lastName: 'Klein', email: 'sabine.klein@northwind-industries.com',
    tier: 'pilot', status: 'pending', transformationsUsed: 0, transformationsLimit: 5,
  },
  {
    // A pipeline account — must be hidden until explicitly asked for.
    uid: 'usage-e2e-ci',
    firstName: 'Superduper', lastName: 'E2E', email: 'superduper-e2e-99999@cleancore-test.io',
    tier: 'starter', status: 'approved', transformationsUsed: 1, transformationsLimit: 25,
  },
];

test.describe('Admin Console — Usage & Quota panel', () => {
  test.beforeAll(async () => {
    let adminUid = '';
    try {
      adminUid = (await createUserWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, ADMIN_PASSWORD)).user.uid;
    } catch (error: unknown) {
      if ((error as { code?: string }).code !== 'auth/email-already-in-use') throw error;
      try {
        adminUid = (await signInWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, ADMIN_PASSWORD)).user.uid;
      } catch {
        adminUid = (await signInWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, FALLBACK_PASSWORD)).user.uid;
      }
    }

    await adminSetDoc('users', adminUid, {
      firstName: 'Sonny', lastName: 'Frenzel', email: ADMIN_EMAIL,
      tier: 'enterprise', status: 'approved', isAdmin: true,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetCustomClaim(adminUid, { admin: true });

    for (const user of COHORT) {
      const { uid, ...profile } = user;
      await adminSetDoc('users', uid, { ...profile, createdAt: new Date(), updatedAt: new Date() });
    }
  });

  async function signInAsAdmin(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.stop()).catch(() => {});

    try {
      await page.goto('/admin', { waitUntil: 'commit', timeout: 45000 });
    } catch {
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(1000);
      await page.goto('/admin', { waitUntil: 'commit', timeout: 45000 });
    }
    await expect(page.getByRole('heading', { name: /Admin Control Room/i })).toBeVisible({ timeout: 30000 });
    await page.click('button:has-text("Usage & Quota")');
    await expect(page.getByRole('heading', { name: /Free transformation usage/i })).toBeVisible();
    await expect(page.getByText('Streaming usage data...')).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByText('Access failed')).toHaveCount(0);
  }

  test('admin sees live per-user consumption of the free transformations', async ({ page }) => {
    test.setTimeout(120 * 1000);
    page.on('pageerror', (err) => process.stdout.write(`[BROWSER ERROR] ${err.message}\n`));

    await signInAsAdmin(page);

    // --- Rows render the counters straight from Firestore ---
    const partialRow = page.locator('button', { hasText: 'Maria Huber' }).first();
    await expect(partialRow).toContainText('3 / 5');

    const atLimitRow = page.locator('button', { hasText: 'Jonas Roth' }).first();
    await expect(atLimitRow).toContainText('5 / 5');
    await expect(atLimitRow).toContainText('Limit');

    const byokRow = page.locator('button', { hasText: 'Tim Bauer' }).first();
    await expect(byokRow).toContainText('BYOK');
    await expect(byokRow).toContainText('unlimited');

    await expect(page.locator('button', { hasText: 'Sabine Klein' }).first()).toContainText('Pending');

    // --- KPI strip, in English ---
    await expect(page.getByText('Units', { exact: true })).toBeVisible();
    await expect(page.getByText('ABAP objects', { exact: true })).toBeVisible();
    await expect(page.getByText('At limit', { exact: true }).first()).toBeVisible();

    // --- Filters ---
    await page.getByRole('button', { name: 'At limit', exact: true }).click();
    await expect(page.locator('button', { hasText: 'Jonas Roth' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Maria Huber' })).toHaveCount(0);

    await page.getByRole('button', { name: 'BYOK', exact: true }).click();
    await expect(page.locator('button', { hasText: 'Tim Bauer' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Jonas Roth' })).toHaveCount(0);

    await page.getByRole('button', { name: 'All', exact: true }).click();

    // --- Search ---
    await page.fill('input[placeholder="Search name or email..."]', 'jonas.roth');
    await expect(page.locator('button', { hasText: 'Jonas Roth' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Maria Huber' })).toHaveCount(0);
    await page.fill('input[placeholder="Search name or email..."]', '');

    // --- Drill-down ---
    await partialRow.click();
    await expect(page.getByText('Distinct ABAP objects')).toBeVisible();
    await expect(page.getByText('3 of 5')).toBeVisible();
    await expect(page.getByText('UID', { exact: true })).toBeVisible();
    await expect(page.getByText(/Only the analysis run in/)).toBeVisible();

    // Fully expanded, not clipped by the container's overflow-hidden.
    await expect
      .poll(
        async () =>
          page.locator('[data-testid="usage-detail"]').evaluate((el) => el.scrollHeight - el.clientHeight),
        { timeout: 5000, message: 'expanded detail panel is clipped' },
      )
      .toBeLessThanOrEqual(1);
  });

  test('CI accounts are hidden by default and revealed on request', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await signInAsAdmin(page);

    // The pipeline creates a user per run; they outnumbered real accounts four to
    // one, which is what made the panel unusable for its actual purpose.
    await expect(page.locator('button', { hasText: 'Superduper E2E' })).toHaveCount(0);
    await expect(page.locator('button', { hasText: 'Maria Huber' }).first()).toBeVisible();

    // The count has to be honest about what is being withheld.
    const toggle = page.getByText(/Show \d+ CI test accounts?/);
    await expect(toggle).toBeVisible();

    await page.getByRole('checkbox').check();
    await expect(page.locator('button', { hasText: 'Superduper E2E' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Superduper E2E' }).first()).toContainText('CI');

    await page.getByRole('checkbox').uncheck();
    await expect(page.locator('button', { hasText: 'Superduper E2E' })).toHaveCount(0);
  });

  test('the panel is usable on a phone', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await signInAsAdmin(page);
    await page.setViewportSize({ width: 375, height: 812 });

    // Nothing may push the page sideways — the failure mode that makes an admin
    // table unusable on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows by ${overflow}px at 375px`).toBeLessThanOrEqual(1);

    // The per-row data must still be readable, with its own labels now that the
    // column headers are hidden.
    const row = page.locator('button', { hasText: 'Maria Huber' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('3 / 5');
    await expect(row).toContainText('Objects:');

    await page.screenshot({ path: 'test-results/admin-usage-panel-mobile.png', fullPage: true });
  });
});
