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
 * Seeded cohort — one account per state the Usage & Quota panel must render.
 * These are Firestore profiles only; the panel reads `users` and needs no Auth accounts.
 */
const COHORT = [
  {
    uid: 'usage-e2e-fresh',
    firstName: 'Lena', lastName: 'Vogt', email: 'lena.vogt@usage-e2e.io',
    tier: 'pilot', status: 'approved', transformationsUsed: 0, transformationsLimit: 5,
  },
  {
    uid: 'usage-e2e-partial',
    firstName: 'Maria', lastName: 'Huber', email: 'maria.huber@usage-e2e.io',
    tier: 'pilot', status: 'approved', transformationsUsed: 3, transformationsLimit: 5,
    chargedInputs: fp('a', 3),
  },
  {
    uid: 'usage-e2e-atlimit',
    firstName: 'Jonas', lastName: 'Roth', email: 'jonas.roth@usage-e2e.io',
    tier: 'pilot', status: 'approved', transformationsUsed: 5, transformationsLimit: 5,
    chargedInputs: fp('b', 5),
  },
  {
    uid: 'usage-e2e-byok',
    firstName: 'Tim', lastName: 'Bauer', email: 'tim.bauer@usage-e2e.io',
    tier: 'pilot', status: 'approved', transformationsUsed: 0, transformationsLimit: 5,
    byokConfigured: true, byokLast4: '9f2c',
  },
  {
    uid: 'usage-e2e-pending',
    firstName: 'Sabine', lastName: 'Klein', email: 'sabine.klein@usage-e2e.io',
    tier: 'pilot', status: 'pending', transformationsUsed: 0, transformationsLimit: 5,
  },
];

test.describe('Admin Console — Usage & Quota panel', () => {
  test.beforeAll(async () => {
    // Admin account (Auth + profile + custom claim — the rules gate on the claim).
    let adminUid = '';
    try {
      adminUid = (await createUserWithEmailAndPassword(firebaseAuth, ADMIN_EMAIL, ADMIN_PASSWORD)).user.uid;
    } catch (error: any) {
      if (error.code !== 'auth/email-already-in-use') throw error;
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

  test('admin sees live per-user consumption of the free transformations', async ({ page }) => {
    test.setTimeout(120 * 1000);
    page.on('pageerror', (err) => process.stdout.write(`[BROWSER ERROR] ${err.message}\n`));

    // --- Sign in ---
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.stop());

    // Retry once — the router.push started by the sign-in can abort this navigation.
    try {
      await page.goto('/admin', { waitUntil: 'commit', timeout: 45000 });
    } catch {
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(1000);
      await page.goto('/admin', { waitUntil: 'commit', timeout: 45000 });
    }
    await expect(page.getByRole('heading', { name: /Admin Control Room/i })).toBeVisible({ timeout: 30000 });

    // --- Switch to the new section ---
    await page.click('button:has-text("Usage & Quota")');
    await expect(page.getByRole('heading', { name: /Verbrauch der freien Transformationen/i })).toBeVisible();

    // The stream must resolve — the loading state must not stick, and a rules
    // rejection would surface as the explicit "Zugriff fehlgeschlagen" panel.
    await expect(page.getByText('Verbrauchsdaten werden gestreamt...')).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByText('Zugriff fehlgeschlagen')).toHaveCount(0);

    // --- Rows render the counters straight from Firestore ---
    const partialRow = page.locator('button', { hasText: 'Maria Huber' }).first();
    await expect(partialRow).toContainText('3 / 5');

    const atLimitRow = page.locator('button', { hasText: 'Jonas Roth' }).first();
    await expect(atLimitRow).toContainText('5 / 5');
    await expect(atLimitRow).toContainText('Limit');

    const byokRow = page.locator('button', { hasText: 'Tim Bauer' }).first();
    await expect(byokRow).toContainText('BYOK');
    await expect(byokRow).toContainText('unbegrenzt');

    await expect(page.locator('button', { hasText: 'Sabine Klein' }).first()).toContainText('Pending');

    // --- KPI strip ---
    await expect(page.getByText('Einheiten', { exact: true })).toBeVisible();
    await expect(page.getByText('ABAP-Objekte', { exact: true })).toBeVisible();
    await expect(page.getByText('Am Limit', { exact: true }).first()).toBeVisible();

    // --- Filter: only the exhausted account survives "Am Limit" ---
    await page.click('button:has-text("Am Limit")');
    await expect(page.locator('button', { hasText: 'Jonas Roth' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Maria Huber' })).toHaveCount(0);

    await page.click('button:has-text("BYOK")');
    await expect(page.locator('button', { hasText: 'Tim Bauer' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Jonas Roth' })).toHaveCount(0);

    await page.click('button:has-text("Alle")');

    // --- Search ---
    await page.fill('input[placeholder="Name oder E-Mail suchen..."]', 'jonas.roth');
    await expect(page.locator('button', { hasText: 'Jonas Roth' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Maria Huber' })).toHaveCount(0);
    await page.fill('input[placeholder="Name oder E-Mail suchen..."]', '');

    // --- Drill-down shows the distinct billed ABAP sources ---
    await partialRow.click();
    await expect(page.getByText('Eindeutige ABAP-Objekte')).toBeVisible();
    await expect(page.getByText('3 von 5')).toBeVisible();
    // The panel must expand to its FULL height. `toBeVisible()` alone would pass on
    // content clipped by the container's overflow-hidden, so measure it instead:
    // once the height animation settles, nothing may overflow.
    await expect(page.getByText('UID', { exact: true })).toBeVisible();
    await expect(page.getByText(/Gezählt wird ausschließlich der Analyse-Run/)).toBeVisible();
    await expect
      .poll(
        async () =>
          page.locator('[data-testid="usage-detail"]').evaluate((el) => el.scrollHeight - el.clientHeight),
        { timeout: 5000, message: 'expanded detail panel is clipped by its container' },
      )
      .toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/admin-usage-panel.png', fullPage: true });
  });
});
