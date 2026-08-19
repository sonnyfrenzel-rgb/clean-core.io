import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345';

import firebaseConfig from '../firebase-applet-config.json';

const firebaseApp = initializeApp(firebaseConfig, 'starter-examples');
const firebaseAuth = getAuth(firebaseApp);

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

const EMAIL = 'starter-examples-e2e@cleancore-test.io';
const PASSWORD = 'SuperPassword123!';

/**
 * The starter examples are the shortest path from an approved account to a first
 * result — most accounts never get there because they would otherwise have to
 * extract custom ABAP from a real system first. This guards that path.
 */
test.describe('Dashboard — starter examples', () => {
  test.beforeAll(async () => {
    let uid = '';
    try {
      uid = (await createUserWithEmailAndPassword(firebaseAuth, EMAIL, PASSWORD)).user.uid;
    } catch (error: any) {
      if (error.code !== 'auth/email-already-in-use') throw error;
      uid = (await signInWithEmailAndPassword(firebaseAuth, EMAIL, PASSWORD)).user.uid;
    }

    await adminSetDoc('users', uid, {
      firstName: 'Starter', lastName: 'Tester', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: '2026-07-07',
      createdAt: new Date(),
    });
  });

  test('a starter example is one click from the dashboard into a loaded analysis', async ({ page }) => {
    test.setTimeout(120 * 1000);
    page.on('pageerror', (err) => process.stdout.write(`[BROWSER ERROR] ${err.message}\n`));

    // The static sources must actually be served — the whole feature hinges on it.
    const asset = await page.request.get('/starter-examples/Z_MATERIAL_STOCK_CALC.txt');
    expect(asset.status()).toBe(200);
    expect(await asset.text()).toContain('REPORT z_material_stock_calc');

    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")');
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.stop());

    try {
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    } catch {
      // The evaluate itself can throw if the aborted navigation already tore down
      // the execution context — that is the case we are recovering from, not a failure.
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(1000);
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    }

    // Scoped to the panel: projects created by earlier runs carry the same names,
    // so an unscoped text match collides with the project list further up the page.
    const panel = page.getByTestId('starter-examples');
    await expect(panel.getByRole('heading', { name: /Try it with an example/i })).toBeVisible({ timeout: 30000 });

    // Every shipped example is offered, including the large one.
    const names = panel.getByTestId('starter-example-name');
    await expect(names).toHaveCount(7);
    await expect(names.filter({ hasText: /^Z_MATERIAL_STOCK_CALC$/ })).toBeVisible();
    await expect(names.filter({ hasText: /^ZLEGACY_ORDER_FULFILLMENT_AUDIT$/ })).toBeVisible();
    await expect(panel.getByText('1,000 lines').first()).toBeVisible();

    // One click must create the project AND carry the source into the analyze stage.
    await names.filter({ hasText: /^Z_MATERIAL_STOCK_CALC$/ }).click();
    await page.waitForURL(/\/project\/[^/]+\/analyze/, { timeout: 45000 });

    // The code has to be there — a project that lands empty is the failure mode
    // this guards against.
    await expect(page.getByText(/z_material_stock_calc/i).first()).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/starter-example-loaded.png', fullPage: false });
  });

  test('the first-run guide is publicly readable and points at the examples', async ({ page }) => {
    // Linked straight from the community mail, so it must render without a session.
    await page.goto('/first-run');
    await expect(page.getByRole('heading', { name: 'Your first run', exact: true })).toBeVisible();
    await expect(page.getByText(/Scroll to "Try it with an example"/)).toBeVisible();
    await expect(page.getByText('Z_MATERIAL_STOCK_CALC').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Open the How-To Guide/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'info@clean-core.io' })).toBeVisible();
  });
});
