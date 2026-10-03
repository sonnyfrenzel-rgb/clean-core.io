import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Owner, 02.10.2026 (translated): "when I open an example from the workspace,
 * the workspace with the first look always opens first, and not Analyze."
 *
 * Every way an ordinary community account starts an example — or its own code —
 * lands on the project's workspace with the first look (`?first=1`), never on
 * the Analyze tool — and the workspace signs the engine's reading at once, so
 * the first look ends on the full map (ADR-066). Each entry point
 * below runs as a fresh community account: no admin claim, no `isAdmin`, and no
 * model stage on, so nothing here waits on or pays for a model call.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'ExampleOpens123!';
const SOURCE = [
  'REPORT z_example_opens.',
  'TABLES: vbak.',
  'DATA lt_vbak TYPE STANDARD TABLE OF vbak.',
  'SELECT * FROM vbak INTO TABLE lt_vbak UP TO 10 ROWS.',
  'IF sy-subrc <> 0.',
  "  MESSAGE 'No orders' TYPE 'E'.",
  'ENDIF.',
  'LOOP AT lt_vbak INTO DATA(ls_vbak).',
  '  WRITE: / ls_vbak-vbeln.',
  'ENDLOOP.',
].join('\n');

async function communityAccount(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Example', lastName: 'Opener', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    modelStages: { analyze: false, naming: false, statements: false },
  });
  return email;
}

async function goto(page: Page, url: string) {
  // The sign-in redirect can still be in flight and abort this navigation.
  await page.evaluate(() => window.stop()).catch(() => {});
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
}

/**
 * The workspace, with the first look grown and the full map drawn from the
 * run the start signed (ADR-066) — not the two-node main line, and never a
 * visit to Analyze.
 */
async function expectWorkspaceWithFirstLook(page: Page): Promise<string> {
  await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
  expect(page.url(), 'an example landed on the Analyze tool').not.toContain('/analyze');
  const projectId = new URL(page.url()).pathname.split('/')[2];
  await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 90000 });
  const look = page.locator('[data-first-look]');
  await expect(look).toBeVisible({ timeout: 60000 });
  await expect(look).toHaveAttribute('data-first-look', /^(building|complete|end-state)$/, { timeout: 60000 });
  await expect(look).toHaveAttribute('data-first-look', /^(complete|end-state)$/, { timeout: 90000 });
  const map = page.locator('[data-workspace-process="ready"] [data-process-map]');
  await expect(map, 'the start drew no full map').toBeVisible({ timeout: 60000 });
  // And it stays.
  await page.waitForTimeout(3000);
  await expect(map).toBeVisible();
  expect(page.url()).not.toContain('/analyze');
  return projectId;
}

async function startFromGallery(page: Page, scope: string, name: string) {
  await expect(page.locator(scope).first()).toBeVisible({ timeout: 90000 });
  const start = page.locator(`${scope} [data-example-start="${name}"]`).first();
  // The first four stand up front; the rest are under "More examples".
  if (!(await start.isVisible().catch(() => false))) {
    await page.locator(`${scope} [data-examples-more] button`).first().click({ timeout: 60000 });
  }
  await start.click({ timeout: 60000 });
}

test.describe('an example opens the workspace with the first look, never Analyze (owner 02.10.2026)', () => {
  test.describe.configure({ mode: 'serial' });

  test('from the gallery on "My workspace" — the empty list a new account sees', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-list');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/dashboard');
    await expect(page.locator('[data-cc-workspace]')).toBeVisible({ timeout: 90000 });
    await startFromGallery(page, '[data-cc-workspace]', 'Z_MATERIAL_STOCK_CALC');
    await expectWorkspaceWithFirstLook(page);
  });

  test('from the landing page\'s "Open an example", signed in', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-landing');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/');
    const open = page.getByRole('link', { name: 'Open an example' }).first();
    await expect(open).toHaveAttribute('href', '/dashboard', { timeout: 60000 });
    await open.click();
    await page.waitForURL(/\/dashboard/, { timeout: 90000 });
    await expect(page.locator('[data-cc-workspace]')).toBeVisible({ timeout: 90000 });
    await startFromGallery(page, '[data-cc-workspace]', 'Z_INVOICE_EXTRACTOR');
    await expectWorkspaceWithFirstLook(page);
  });

  test('from "New project", the example half', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-newproject');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/dashboard');
    await page.locator('[data-workspace-new-project]').first().click({ timeout: 90000 });
    await page.waitForURL(/\/admin\/new-project$/, { timeout: 90000 });
    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 90000 });
    await startFromGallery(page, '[data-new-project-examples]', 'Z_MATERIAL_STOCK_CALC');
    await expectWorkspaceWithFirstLook(page);
  });

  test('from "New project", own code — the workspace signs the reading, no Analyze in between', async ({ page }) => {
    test.setTimeout(480 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-owncode');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/admin/new-project/upload');
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 90000 });
    await page.locator('[data-own-code-input]').setInputFiles([
      { name: 'Z_EXAMPLE_OPENS.abap', mimeType: 'text/plain', buffer: Buffer.from(SOURCE, 'utf8') },
    ]);
    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    await page.click('[data-own-code-start]');
    const projectId = await expectWorkspaceWithFirstLook(page);

    // The run is on record, so Next step has moved past Analyze.
    await expect(page.locator('[data-next-step]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator(`[data-next-step] a[href*="/project/${projectId}/analyze"]`)).toHaveCount(0);
  });
});
