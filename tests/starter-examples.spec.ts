import { test, expect } from '@playwright/test';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-12345';

import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
// The current Terms version, not a literal: seeding a stale one makes the
// account fail `requireCurrentTerms` on every protected route, so a version
// bump would break this spec for a reason that has nothing to do with it.
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

const firebaseApp = initializeApp(firebaseConfig, 'starter-examples');
const firebaseAuth = getAuth(firebaseApp);

// Fail closed: throws unless the run targets the emulators (tests/helpers/emulator-guard.ts).
connectAuthToEmulator(firebaseAuth);

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
      termsVersionAccepted: TERMS_VERSION,
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

    await signInViaLanding(page, EMAIL, PASSWORD, { pauseMs: 3000, alsoGermanLabel: true });
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

    // Every shipped example is offered, including the large one — the first
    // four up front, the rest one click away under "More examples".
    await panel.locator('[data-examples-more] button').first().click();
    const names = panel.locator('[data-example-kind="example"]').getByTestId('starter-example-name');
    await expect(names).toHaveCount(8);
    expect(STARTER_EXAMPLES).toHaveLength(8);
    await expect(names.filter({ hasText: /^Z_MATERIAL_STOCK_CALC$/ })).toBeVisible();
    await expect(names.filter({ hasText: /^Z_MM_PO_APPROVAL$/ })).toBeVisible();
    // Every card's source is served on the path the click fetches from (lib/starter-examples.ts loadStarterExample).
    for (const ex of STARTER_EXAMPLES) {
      const res = await page.request.get(`/starter-examples/${ex.file}`);
      expect(res.status(), ex.file).toBe(200);
      expect((await res.text()).toLowerCase(), ex.file).toContain(ex.name.toLowerCase());
    }
    await expect(names.filter({ hasText: /^ZLEGACY_ORDER_FULFILLMENT_AUDIT$/ })).toBeVisible();
    await expect(panel.getByText('1,000 lines').first()).toBeVisible();

    // One click must create the project AND carry the source with it. Since
    // roadmap 3.0.1 every project opens in the workspace, with its first look.
    await panel.locator('[data-example-start="Z_MATERIAL_STOCK_CALC"]').click();
    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 45000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];

    // The code has to be there — a project that lands empty is the failure mode
    // this guards against. Read where the source is shown: the Analyze tool.
    await page.goto(`/project/${projectId}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/z_material_stock_calc/i).first()).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/starter-example-loaded.png', fullPage: false });
  });

  test('an example whose source carries personal-data shapes asks before it is written', async ({ page }) => {
    // Z_EMPLOYEE_EXPENSE_VAL reads a personnel number. The gallery writes the
    // source to Firestore on Start, so the hint stands in front of that write —
    // the gate New project had before it showed this gallery (85d0ea44).
    test.setTimeout(120 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD, { pauseMs: 3000, alsoGermanLabel: true });
    await page.evaluate(() => window.stop());
    await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 }).catch(async () => {
      await page.waitForTimeout(1000);
      await page.goto('/dashboard', { waitUntil: 'commit', timeout: 45000 });
    });

    const panel = page.getByTestId('starter-examples');
    await expect(panel.getByRole('heading', { name: /Try it with an example/i })).toBeVisible({ timeout: 30000 });
    await panel.locator('[data-examples-more] button').first().click();
    const card = panel.locator('[data-example-card="Z_EMPLOYEE_EXPENSE_VAL"]');
    await card.locator('[data-example-start="Z_EMPLOYEE_EXPENSE_VAL"]').click();

    const ack = card.locator('[data-personal-data-ack] input[type="checkbox"]');
    await expect(ack, 'the gallery wrote the source without showing the hint').toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(/\/dashboard/);

    await ack.check();
    await card.locator('[data-example-start="Z_EMPLOYEE_EXPENSE_VAL"]').click();
    await page.waitForURL(/\/project\/[^/]+/, { timeout: 45000 });
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
